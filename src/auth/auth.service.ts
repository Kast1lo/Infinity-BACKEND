import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RegisterDto } from './DTO/register.dto';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { loginRequest } from './DTO/login.dto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config/dist/config.service';
import { Response } from 'express';
import { PrismaDatabaseService } from 'src/prisma-database/prisma-database.service';
import * as jwt from 'jsonwebtoken';
import { VerifyEmailDto } from './DTO/Verify-email.dto';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma:        PrismaDatabaseService,
    private readonly jwtsService:   JwtService,
    private readonly configService: ConfigService,
    private readonly mailService:   MailService,
  ) {}

  private getSparkExpiresAt(): Date {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }

  async validateGoogleUser(data: {
    googleId:  string;
    email:     string;
    username:  string;
    avatarUrl: string | null;
  }) {

    let user = await this.prisma.user.findUnique({
      where: { googleId: data.googleId },
    });

    if (user) return user;

    user = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (user) {

      return this.prisma.user.update({
        where: { id: user.id },
        data:  { googleId: data.googleId },
      });
    }

    const username = await this.generateUniqueUsername(data.username);

    return this.prisma.user.create({
      data: {
        googleId:      data.googleId,
        email:         data.email,
        username:      username,
        passwordHash:  '',
        isVerified:    true,
        planType:      'spark',
        planExpiresAt: this.getSparkExpiresAt(),
      },
    });
  }

  private async generateUniqueUsername(base: string): Promise<string> {
    const cleaned = base.replace(/\s+/g, '_').toLowerCase().slice(0, 25);
    let username  = cleaned;
    let attempt   = 0;

    while (true) {
      const exists = await this.prisma.user.findUnique({ where: { username } });
      if (!exists) return username;
      attempt++;
      username = `${cleaned}_${attempt}`;
    }
  }

  private generateCode(): string {
    return crypto.randomInt(100_000, 1_000_000).toString();
  }

  async register(dto: RegisterDto) {
    const existUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.email }, { username: dto.username }],
      },
    });

    if (existUser) {
      throw new ConflictException(
        'Пользователь с таким email или username уже существует',
      );
    }

    const passwordHash = await argon2.hash(dto.passwordHash, {
      type:        argon2.argon2id,
      memoryCost:  19458,
      timeCost:    2,
      parallelism: 1,
    });

    const code      = this.generateCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.user.create({
      data: {
        username:                  dto.username,
        email:                     dto.email,
        passwordHash:              passwordHash,
        isVerified:                false,
        verificationCode:          code,
        verificationCodeExpiresAt: expiresAt,
        planType:                  'spark',
        planExpiresAt:             this.getSparkExpiresAt(),
      },
    });

    await this.mailService.sendVerificationCode(dto.email, code);

    return { message: 'Код подтверждения отправлен на почту', email: dto.email };
  }

  async verifyEmail(dto: VerifyEmailDto, res: Response) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new BadRequestException('Пользователь не найден');
    }

    if (user.isVerified) {
      throw new BadRequestException('Email уже подтверждён');
    }

    if (!user.verificationCode || user.verificationCode !== dto.code) {
      throw new BadRequestException('Неверный код подтверждения');
    }

    if (
      !user.verificationCodeExpiresAt ||
      user.verificationCodeExpiresAt < new Date()
    ) {
      throw new BadRequestException('Код истёк. Запросите новый');
    }

    const verified = await this.prisma.user.update({
      where: { email: dto.email },
      data: {
        isVerified:                true,
        verificationCode:          null,
        verificationCodeExpiresAt: null,
      },
      select: { id: true, email: true, username: true },
    });

    return this.generateToken(verified, res);
  }

  async resendCode(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new BadRequestException('Пользователь не найден');
    }

    if (user.isVerified) {
      throw new BadRequestException('Email уже подтверждён');
    }

    const code      = this.generateCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.prisma.user.update({
      where: { email },
      data: {
        verificationCode:          code,
        verificationCodeExpiresAt: expiresAt,
      },
    });

    await this.mailService.sendVerificationCode(email, code);

    return { message: 'Новый код отправлен' };
  }

  async login(dto: loginRequest, res: Response) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
      select: {
        id:           true,
        email:        true,
        username:     true,
        passwordHash: true,
        isVerified:   true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }

    const isValidPassword = await argon2.verify(user.passwordHash, dto.passwordHash);

    if (!isValidPassword) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }

    if (!user.isVerified) {
      throw new UnauthorizedException('Email не подтверждён. Проверьте почту');
    }

    const { passwordHash, isVerified, ...safeUser } = user;
    return this.generateToken(safeUser, res);
  }

  async refresh(res: Response) {
    const refreshToken = res.req.cookies['refresh_token'];

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token отсутствует');
    }

    try {
      const payload = jwt.verify(
        refreshToken,
        this.configService.getOrThrow('JWT_REFRESH_SECRET'),
      ) as { sub: string };

      const user = await this.prisma.user.findUnique({
        where:  { id: payload.sub },
        select: { id: true, email: true, username: true },
      });

      if (!user) {
        throw new UnauthorizedException('Пользователь не найден');
      }

      const newAccessToken = await this.jwtsService.signAsync(
        { sub: user.id, email: user.email, username: user.username },
        {
          secret:    this.configService.get('JWT_ACCESS_SECRET'),
          expiresIn: this.configService.get('JWT_ACCESS_EXPIRATION') || '15m',
        },
      );

      res.cookie('access_token', newAccessToken, {
        httpOnly: true,
        secure:   this.configService.get('NODE_ENV') === 'production',
        sameSite: 'strict',
        path:     '/',
        maxAge:   15 * 60 * 1000,
      });

      return { message: 'Токен обновлён' };
    } catch {
      throw new UnauthorizedException('Неверный или истекший refresh token');
    }
  }

  async generateToken(
    user: { id: string; email: string; username: string | null },
    res: Response,
  ) {
    const payload = { sub: user.id, email: user.email, username: user.username };

    const accessToken = await this.jwtsService.signAsync(payload, {
      secret:    this.configService.get('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get('JWT_ACCESS_EXPIRATION'),
    });

    const refreshToken = await this.jwtsService.signAsync(
      { sub: user.id },
      {
        secret:    this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get('JWT_REFRESH_EXPIRATION'),
      },
    );

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure:   this.configService.get('NODE_ENV') === 'production',
      sameSite: 'strict',
      path:     '/',
      maxAge:   7 * 24 * 60 * 60 * 1000,
    });

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure:   this.configService.get('NODE_ENV') === 'production',
      sameSite: 'strict',
      path:     '/',
      maxAge:   15 * 60 * 1000,
    });

    return { message: 'Успешная авторизация' };
  }
}
