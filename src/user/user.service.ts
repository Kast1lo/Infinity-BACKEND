import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaDatabaseService } from 'src/prisma-database/prisma-database.service';
import { updateProfile } from './DTO/update-profile.dto';
import { StorageService } from 'src/services/files.service';
import { ChangePasswordDto } from './DTO/change-password.dto';
import { RequestEmailChangeDto } from './DTO/request-email-change.dto';
import { ConfirmEmailChangeDto } from './DTO/confirm-email-change.dto';
import { MailService } from 'src/mail/mail.service';
import * as argon2 from 'argon2';

@Injectable()
export class UserService {
  constructor(
    private prisma:   PrismaDatabaseService,
    private storage:  StorageService,
    private mail:     MailService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { id: true, email: true, username: true, createdAt: true, avatarKey: true },
    });

    if (!user) throw new NotFoundException('Пользователь не найден');

    let avatarUrl: string | null = null;
    if (user.avatarKey) {
      avatarUrl = await this.storage.getPresignedUrl(user.avatarKey, 3600 * 24);
    }

    return { ...user, avatarUrl };
  }

  async updateProfile(userId: string, dto: updateProfile) {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data:  { username: dto.username },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException('Пользователь с таким именем уже существует');
      }
      throw e;
    }
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { passwordHash: true },
    });

    if (!user) throw new NotFoundException('Пользователь не найден');

    const isValid = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!isValid) {
      throw new BadRequestException('Неверный текущий пароль');
    }

    const newHash = await argon2.hash(dto.newPassword, {
      type:        argon2.argon2id,
      memoryCost:  19458,
      timeCost:    2,
      parallelism: 1,
    });

    await this.prisma.user.update({
      where: { id: userId },
      data:  { passwordHash: newHash },
    });

    return { message: 'Пароль успешно изменён' };
  }

  // Шаг 1: запросить смену email — проверяем пароль, занятость адреса, шлём код на новый email
  async requestEmailChange(userId: string, dto: RequestEmailChangeDto) {
    const newEmail = dto.newEmail.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { email: true, passwordHash: true },
    });
    if (!user) throw new NotFoundException('Пользователь не найден');

    const isValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isValid) throw new BadRequestException('Неверный пароль');

    if (newEmail === user.email.toLowerCase()) {
      throw new BadRequestException('Это уже ваш текущий email');
    }

    const taken = await this.prisma.user.findUnique({ where: { email: newEmail }, select: { id: true } });
    if (taken) throw new ConflictException('Этот email уже занят');

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: userId },
      data:  { pendingEmail: newEmail, emailChangeCode: code, emailChangeCodeExpiresAt: expiresAt },
    });

    await this.mail.sendEmailChangeCode(newEmail, code);

    return { message: 'Код отправлен на новый email' };
  }

  // Шаг 2: подтвердить смену email кодом
  async confirmEmailChange(userId: string, dto: ConfirmEmailChangeDto) {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { pendingEmail: true, emailChangeCode: true, emailChangeCodeExpiresAt: true },
    });
    if (!user) throw new NotFoundException('Пользователь не найден');

    if (!user.pendingEmail || !user.emailChangeCode || !user.emailChangeCodeExpiresAt) {
      throw new BadRequestException('Нет активного запроса на смену email');
    }
    if (user.emailChangeCodeExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Срок действия кода истёк. Запросите код заново');
    }
    if (user.emailChangeCode !== dto.code.trim()) {
      throw new BadRequestException('Неверный код');
    }

    // Email мог быть занят между шагами
    const taken = await this.prisma.user.findFirst({
      where:  { email: user.pendingEmail, NOT: { id: userId } },
      select: { id: true },
    });
    if (taken) throw new ConflictException('Этот email уже занят');

    try {
      await this.prisma.user.update({
        where: { id: userId },
        data:  {
          email: user.pendingEmail,
          isVerified: true,
          pendingEmail: null,
          emailChangeCode: null,
          emailChangeCodeExpiresAt: null,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new ConflictException('Этот email уже занят');
      throw e;
    }

    return { message: 'Email успешно изменён', email: user.pendingEmail };
  }

  async createAvatar(userId: string, file: Express.Multer.File) {
    if (!file) throw new NotFoundException('Файл не предоставлен');

    const uploadedKey = await this.storage.uploadAvatar(file, userId);

    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { avatarKey: true },
    });

    if (!user) throw new NotFoundException('Пользователь не найден');

    if (user.avatarKey) {
      await this.storage.deleteFile(user.avatarKey).catch(() => {});
    }

    await this.prisma.user.update({
      where: { id: userId },
      data:  { avatarKey: uploadedKey },
    });

    const avatarUrl = await this.storage.getPresignedUrl(uploadedKey, 3600 * 24);
    return { avatarKey: uploadedKey, avatarUrl };
  }
}
