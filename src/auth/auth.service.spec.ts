import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';

jest.mock('argon2', () => ({
  argon2id: 2,
  hash: jest.fn().mockResolvedValue('hashed-password'),
  verify: jest.fn(),
}));

import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { createPrismaMock } from '../test-utils/prisma.mock';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let jwtService: { signAsync: jest.Mock };
  let config: { get: jest.Mock; getOrThrow: jest.Mock };
  let mail: { sendVerificationCode: jest.Mock; sendResetCode: jest.Mock };

  /** Мок express.Response с перехватом выставленных кук. */
  const makeRes = (cookies: Record<string, string> = {}) => {
    const set: Record<string, any> = {};
    return {
      cookie: jest.fn((name: string, value: string, opts: any) => {
        set[name] = { value, opts };
      }),
      req: { cookies },
      _cookies: set,
    } as any;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };
    config = {
      get: jest.fn((key: string) => {
        const map: Record<string, string> = {
          JWT_ACCESS_SECRET: 'access-secret',
          JWT_REFRESH_SECRET: 'refresh-secret',
          JWT_ACCESS_EXPIRATION: '15m',
          JWT_REFRESH_EXPIRATION: '7d',
          NODE_ENV: 'test',
        };
        return map[key];
      }),
      getOrThrow: jest.fn().mockReturnValue('refresh-secret'),
    };
    mail = {
      sendVerificationCode: jest.fn().mockResolvedValue(undefined),
      sendResetCode: jest.fn().mockResolvedValue(undefined),
    };
    service = new AuthService(prisma as any, jwtService as any, config as any, mail as any);
  });

  describe('register', () => {
    it('бросает Conflict, если email/username заняты', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(
        service.register({ email: 'a@b.c', username: 'john', passwordHash: 'pw' } as any),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('хеширует пароль, создаёт неподтверждённого юзера и шлёт код', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'u1' });

      const res = await service.register({
        email: 'a@b.c',
        username: 'john',
        passwordHash: 'plaintext',
      } as any);

      expect(argon2.hash).toHaveBeenCalledWith('plaintext', expect.objectContaining({ type: 2 }));
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'a@b.c',
            username: 'john',
            passwordHash: 'hashed-password',
            isVerified: false,
            planType: 'spark',
          }),
        }),
      );
      const createData = prisma.user.create.mock.calls[0][0].data;
      expect(createData.verificationCode).toMatch(/^\d{6}$/);
      expect(mail.sendVerificationCode).toHaveBeenCalledWith('a@b.c', createData.verificationCode);
      expect(res).toEqual({ message: expect.any(String), email: 'a@b.c' });
    });
  });

  describe('verifyEmail', () => {
    const future = () => new Date(Date.now() + 10 * 60 * 1000);

    it('бросает BadRequest, если пользователь не найден', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.verifyEmail({ email: 'a@b.c', code: '123456' }, makeRes()),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('бросает BadRequest, если email уже подтверждён', async () => {
      prisma.user.findUnique.mockResolvedValue({ isVerified: true });
      await expect(
        service.verifyEmail({ email: 'a@b.c', code: '123456' }, makeRes()),
      ).rejects.toThrow('Email уже подтверждён');
    });

    it('бросает BadRequest при неверном коде', async () => {
      prisma.user.findUnique.mockResolvedValue({
        isVerified: false,
        verificationCode: '000000',
        verificationCodeExpiresAt: future(),
      });
      await expect(
        service.verifyEmail({ email: 'a@b.c', code: '123456' }, makeRes()),
      ).rejects.toThrow('Неверный код подтверждения');
    });

    it('бросает BadRequest при истёкшем коде', async () => {
      prisma.user.findUnique.mockResolvedValue({
        isVerified: false,
        verificationCode: '123456',
        verificationCodeExpiresAt: new Date(Date.now() - 1000),
      });
      await expect(
        service.verifyEmail({ email: 'a@b.c', code: '123456' }, makeRes()),
      ).rejects.toThrow('Код истёк. Запросите новый');
    });

    it('подтверждает email и выдаёт токены (куки)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        isVerified: false,
        verificationCode: '123456',
        verificationCodeExpiresAt: future(),
      });
      prisma.user.update.mockResolvedValue({ id: 'u1', email: 'a@b.c', username: 'john' });

      const res = makeRes();
      const out = await service.verifyEmail({ email: 'a@b.c', code: '123456' }, res);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isVerified: true, verificationCode: null }) }),
      );
      expect(res._cookies.access_token).toBeDefined();
      expect(res._cookies.refresh_token).toBeDefined();
      expect(out).toEqual({ message: 'Успешная авторизация' });
    });
  });

  describe('login', () => {
    it('бросает Unauthorized, если пользователь не найден', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ username: 'john', passwordHash: 'pw' } as any, makeRes()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('бросает Unauthorized при неверном пароле', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1', email: 'a@b.c', username: 'john', passwordHash: 'hash', isVerified: true,
      });
      (argon2.verify as jest.Mock).mockResolvedValue(false);
      await expect(
        service.login({ username: 'john', passwordHash: 'wrong' } as any, makeRes()),
      ).rejects.toThrow('Неверный логин или пароль');
    });

    it('бросает Unauthorized, если email не подтверждён', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1', email: 'a@b.c', username: 'john', passwordHash: 'hash', isVerified: false,
      });
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      await expect(
        service.login({ username: 'john', passwordHash: 'pw' } as any, makeRes()),
      ).rejects.toThrow('Email не подтверждён. Проверьте почту');
    });

    it('успешно логинит и ставит куки', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1', email: 'a@b.c', username: 'john', passwordHash: 'hash', isVerified: true,
      });
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      const res = makeRes();
      const out = await service.login({ username: 'john', passwordHash: 'pw' } as any, res);

      expect(out).toEqual({ message: 'Успешная авторизация' });
      expect(res._cookies.access_token).toBeDefined();
      expect(res._cookies.refresh_token).toBeDefined();
    });
  });

  describe('forgotPassword', () => {
    it('возвращает обобщённый ответ и не пишет в БД для несуществующего email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const out = await service.forgotPassword({ email: 'ghost@b.c' } as any);
      expect(out.message).toContain('Если аккаунт');
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(mail.sendResetCode).not.toHaveBeenCalled();
    });

    it('шлёт код сброса для существующего email (тот же обобщённый ответ)', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      const out = await service.forgotPassword({ email: 'a@b.c' } as any);
      expect(out.message).toContain('Если аккаунт');
      expect(prisma.user.update).toHaveBeenCalled();
      expect(mail.sendResetCode).toHaveBeenCalledWith('a@b.c', expect.stringMatching(/^\d{6}$/));
    });
  });

  describe('resetPassword', () => {
    it('бросает BadRequest при неверном коде сброса', async () => {
      prisma.user.findUnique.mockResolvedValue({ resetCode: '000000', resetCodeExpiresAt: new Date(Date.now() + 1000) });
      await expect(
        service.resetPassword({ email: 'a@b.c', code: '123456', passwordHash: 'new' } as any, makeRes()),
      ).rejects.toThrow('Неверный код сброса');
    });

    it('бросает BadRequest при истёкшем коде', async () => {
      prisma.user.findUnique.mockResolvedValue({ resetCode: '123456', resetCodeExpiresAt: new Date(Date.now() - 1000) });
      await expect(
        service.resetPassword({ email: 'a@b.c', code: '123456', passwordHash: 'new' } as any, makeRes()),
      ).rejects.toThrow('Код истёк. Запросите новый');
    });

    it('меняет пароль, верифицирует email и выдаёт токены', async () => {
      prisma.user.findUnique.mockResolvedValue({ resetCode: '123456', resetCodeExpiresAt: new Date(Date.now() + 10000) });
      prisma.user.update.mockResolvedValue({ id: 'u1', email: 'a@b.c', username: 'john' });

      const res = makeRes();
      await service.resetPassword({ email: 'a@b.c', code: '123456', passwordHash: 'new' } as any, res);

      expect(argon2.hash).toHaveBeenCalledWith('new', expect.any(Object));
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ passwordHash: 'hashed-password', isVerified: true, resetCode: null }) }),
      );
      expect(res._cookies.access_token).toBeDefined();
    });
  });

  describe('validateGoogleUser', () => {
    const gdata = { googleId: 'g1', email: 'a@b.c', username: 'John Doe', avatarUrl: null };

    it('возвращает существующего пользователя по googleId', async () => {
      prisma.user.findUnique.mockImplementation(({ where }: any) =>
        where.googleId === 'g1' ? Promise.resolve({ id: 'u1', googleId: 'g1' }) : Promise.resolve(null),
      );
      const out = await service.validateGoogleUser(gdata);
      expect(out).toEqual(expect.objectContaining({ id: 'u1' }));
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('привязывает googleId к существующему аккаунту по email', async () => {
      prisma.user.findUnique.mockImplementation(({ where }: any) => {
        if (where.googleId) return Promise.resolve(null);
        if (where.email) return Promise.resolve({ id: 'u2' });
        return Promise.resolve(null);
      });
      prisma.user.update.mockResolvedValue({ id: 'u2', googleId: 'g1' });

      const out = await service.validateGoogleUser(gdata);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u2' }, data: { googleId: 'g1' } }),
      );
      expect(out).toEqual(expect.objectContaining({ googleId: 'g1' }));
    });

    it('создаёт нового пользователя с уникальным username при коллизии', async () => {
      prisma.user.findUnique.mockImplementation(({ where }: any) => {
        if (where.googleId) return Promise.resolve(null);
        if (where.email) return Promise.resolve(null);
        if (where.username === 'john_doe') return Promise.resolve({ id: 'taken' }); // занято
        return Promise.resolve(null); // 'john_doe_1' свободно
      });
      prisma.user.create.mockResolvedValue({ id: 'u3', username: 'john_doe_1' });

      await service.validateGoogleUser(gdata);
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ username: 'john_doe_1', googleId: 'g1', isVerified: true, planType: 'spark' }),
        }),
      );
    });
  });

  describe('generateToken (rememberMe)', () => {
    it('ставит persistent-куку с maxAge при rememberMe=true', async () => {
      const res = makeRes();
      await service.generateToken({ id: 'u1', email: 'a@b.c', username: 'john' }, res, true);
      expect(res._cookies.refresh_token.opts.maxAge).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it('ставит session-куку (без maxAge) при rememberMe=false', async () => {
      const res = makeRes();
      await service.generateToken({ id: 'u1', email: 'a@b.c', username: 'john' }, res, false);
      expect(res._cookies.refresh_token.opts.maxAge).toBeUndefined();
    });
  });

  describe('refresh', () => {
    it('бросает Unauthorized без refresh-куки', async () => {
      await expect(service.refresh(makeRes())).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('бросает Unauthorized при невалидном refresh-токене', async () => {
      // jwt.verify бросит, т.к. токен не подписан нашим секретом
      await expect(service.refresh(makeRes({ refresh_token: 'garbage' }))).rejects.toThrow(
        'Неверный или истекший refresh token',
      );
    });
  });
});
