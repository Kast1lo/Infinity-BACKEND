import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

jest.mock('argon2', () => ({
  argon2id: 2,
  hash: jest.fn().mockResolvedValue('new-hash'),
  verify: jest.fn(),
}));

import * as argon2 from 'argon2';
import { UserService } from './user.service';
import { createPrismaMock } from '../test-utils/prisma.mock';

describe('UserService', () => {
  let service: UserService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let storage: { getPresignedUrl: jest.Mock; uploadAvatar: jest.Mock; deleteFile: jest.Mock };
  let mail: { sendEmailChangeCode: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    storage = {
      getPresignedUrl: jest.fn().mockResolvedValue('https://cdn/avatar.png'),
      uploadAvatar: jest.fn().mockResolvedValue('avatars/u1/key'),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };
    mail = { sendEmailChangeCode: jest.fn().mockResolvedValue(undefined) };
    service = new UserService(prisma as any, storage as any, mail as any);
  });

  describe('getProfile', () => {
    it('бросает NotFound, если пользователь не найден', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getProfile('u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('возвращает профиль без avatarUrl, если аватара нет', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.c', username: 'john', avatarKey: null });
      const out = await service.getProfile('u1');
      expect(out.avatarUrl).toBeNull();
      expect(storage.getPresignedUrl).not.toHaveBeenCalled();
    });

    it('подписывает avatarUrl, если есть avatarKey', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@b.c', username: 'john', avatarKey: 'k' });
      const out = await service.getProfile('u1');
      expect(out.avatarUrl).toBe('https://cdn/avatar.png');
      expect(storage.getPresignedUrl).toHaveBeenCalledWith('k', 3600 * 24);
    });
  });

  describe('updateProfile', () => {
    it('переводит prisma P2002 в Conflict', async () => {
      prisma.user.update.mockRejectedValue({ code: 'P2002' });
      await expect(service.updateProfile('u1', { username: 'taken' } as any)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('пробрасывает прочие ошибки как есть', async () => {
      prisma.user.update.mockRejectedValue(new Error('db down'));
      await expect(service.updateProfile('u1', { username: 'x' } as any)).rejects.toThrow('db down');
    });
  });

  describe('changePassword', () => {
    it('бросает NotFound, если пользователь не найден', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.changePassword('u1', { currentPassword: 'a', newPassword: 'b' } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('бросает BadRequest при неверном текущем пароле', async () => {
      prisma.user.findUnique.mockResolvedValue({ passwordHash: 'hash' });
      (argon2.verify as jest.Mock).mockResolvedValue(false);
      await expect(
        service.changePassword('u1', { currentPassword: 'wrong', newPassword: 'b' } as any),
      ).rejects.toThrow('Неверный текущий пароль');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('хеширует и сохраняет новый пароль', async () => {
      prisma.user.findUnique.mockResolvedValue({ passwordHash: 'hash' });
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      const out = await service.changePassword('u1', { currentPassword: 'ok', newPassword: 'newpw' } as any);

      expect(argon2.hash).toHaveBeenCalledWith('newpw', expect.objectContaining({ type: 2 }));
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' }, data: { passwordHash: 'new-hash' } }),
      );
      expect(out).toEqual({ message: 'Пароль успешно изменён' });
    });
  });

  describe('requestEmailChange', () => {
    it('бросает BadRequest при неверном пароле', async () => {
      prisma.user.findUnique.mockResolvedValue({ email: 'a@b.c', passwordHash: 'hash' });
      (argon2.verify as jest.Mock).mockResolvedValue(false);
      await expect(
        service.requestEmailChange('u1', { newEmail: 'new@b.c', password: 'wrong' } as any),
      ).rejects.toThrow('Неверный пароль');
    });

    it('запрещает смену на тот же самый email', async () => {
      prisma.user.findUnique.mockResolvedValue({ email: 'a@b.c', passwordHash: 'hash' });
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      await expect(
        service.requestEmailChange('u1', { newEmail: 'A@B.C', password: 'ok' } as any),
      ).rejects.toThrow('Это уже ваш текущий email');
    });

    it('бросает Conflict, если новый email занят', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ email: 'a@b.c', passwordHash: 'hash' }) // сам юзер
        .mockResolvedValueOnce({ id: 'other' }); // email занят
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      await expect(
        service.requestEmailChange('u1', { newEmail: 'new@b.c', password: 'ok' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('сохраняет pendingEmail+код и шлёт письмо на новый адрес', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ email: 'a@b.c', passwordHash: 'hash' })
        .mockResolvedValueOnce(null);
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      const out = await service.requestEmailChange('u1', { newEmail: 'New@B.c', password: 'ok' } as any);

      const data = prisma.user.update.mock.calls[0][0].data;
      expect(data.pendingEmail).toBe('new@b.c'); // нормализован в lowercase
      expect(data.emailChangeCode).toMatch(/^\d{6}$/);
      expect(mail.sendEmailChangeCode).toHaveBeenCalledWith('new@b.c', data.emailChangeCode);
      expect(out.message).toContain('Код отправлен');
    });
  });

  describe('confirmEmailChange', () => {
    const future = () => new Date(Date.now() + 10 * 60 * 1000);

    it('бросает BadRequest, если нет активного запроса', async () => {
      prisma.user.findUnique.mockResolvedValue({ pendingEmail: null, emailChangeCode: null, emailChangeCodeExpiresAt: null });
      await expect(
        service.confirmEmailChange('u1', { code: '123456' } as any),
      ).rejects.toThrow('Нет активного запроса');
    });

    it('бросает BadRequest при истёкшем коде', async () => {
      prisma.user.findUnique.mockResolvedValue({
        pendingEmail: 'new@b.c', emailChangeCode: '123456', emailChangeCodeExpiresAt: new Date(Date.now() - 1000),
      });
      await expect(
        service.confirmEmailChange('u1', { code: '123456' } as any),
      ).rejects.toThrow('Срок действия кода истёк. Запросите код заново');
    });

    it('бросает BadRequest при неверном коде', async () => {
      prisma.user.findUnique.mockResolvedValue({
        pendingEmail: 'new@b.c', emailChangeCode: '000000', emailChangeCodeExpiresAt: future(),
      });
      await expect(
        service.confirmEmailChange('u1', { code: '123456' } as any),
      ).rejects.toThrow('Неверный код');
    });

    it('применяет новый email и чистит pending-поля', async () => {
      prisma.user.findUnique.mockResolvedValue({
        pendingEmail: 'new@b.c', emailChangeCode: '123456', emailChangeCodeExpiresAt: future(),
      });
      prisma.user.findFirst.mockResolvedValue(null); // не занят
      prisma.user.update.mockResolvedValue({});

      const out = await service.confirmEmailChange('u1', { code: '123456' } as any);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'new@b.c', isVerified: true, pendingEmail: null, emailChangeCode: null }),
        }),
      );
      expect(out).toEqual({ message: 'Email успешно изменён', email: 'new@b.c' });
    });
  });
});
