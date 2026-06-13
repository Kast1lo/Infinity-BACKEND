import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import type { Response } from 'express';
import { RegisterDto } from './DTO/register.dto';
import { loginRequest } from './DTO/login.dto';
import { VerifyEmailDto } from './DTO/Verify-email.dto';
import { ForgotPasswordDto } from './DTO/forgot-password.dto';
import { ResetPasswordDto } from './DTO/reset-password.dto';
import { ConfigService } from '@nestjs/config/dist/config.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiCookieAuth,
} from '@nestjs/swagger';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService:    AuthService,
    private readonly configService:  ConfigService,
  ) {}

  @ApiOperation({ summary: 'Регистрация нового пользователя' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: 'Пользователь создан, код отправлен на email', schema: { example: { message: 'Код отправлен на почту', email: 'user@example.com' } } })
  @ApiResponse({ status: 409, description: 'Email или имя пользователя уже заняты' })
  @ApiResponse({ status: 429, description: 'Превышен лимит запросов (5/мин)' })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @ApiOperation({ summary: 'Подтверждение email по 6-значному коду' })
  @ApiBody({ type: VerifyEmailDto })
  @ApiResponse({ status: 200, description: 'Email подтверждён, токены установлены в cookie' })
  @ApiResponse({ status: 400, description: 'Неверный или просроченный код' })
  @ApiResponse({ status: 429, description: 'Превышен лимит запросов (10/мин)' })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-email')
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.verifyEmail(dto, res);
  }

  @ApiOperation({ summary: 'Повторная отправка кода верификации' })
  @ApiBody({ schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', example: 'user@example.com' } } } })
  @ApiResponse({ status: 200, description: 'Код отправлен повторно' })
  @ApiResponse({ status: 404, description: 'Пользователь не найден' })
  @ApiResponse({ status: 429, description: 'Превышен лимит запросов (3/мин)' })
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('resend-code')
  async resendCode(@Body('email') email: string) {
    return this.authService.resendCode(email);
  }

  @ApiOperation({ summary: 'Запрос кода для сброса пароля' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({ status: 200, description: 'Код отправлен (ответ одинаков независимо от существования аккаунта)' })
  @ApiResponse({ status: 429, description: 'Превышен лимит запросов (3/мин)' })
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @ApiOperation({ summary: 'Сброс пароля по коду из письма' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 200, description: 'Пароль изменён, токены установлены в cookie' })
  @ApiResponse({ status: 400, description: 'Неверный или просроченный код' })
  @ApiResponse({ status: 429, description: 'Превышен лимит запросов (5/мин)' })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  async resetPassword(
    @Body() dto: ResetPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.resetPassword(dto, res);
  }

  @ApiOperation({ summary: 'Вход в систему' })
  @ApiBody({ type: loginRequest })
  @ApiResponse({ status: 200, description: 'Успешный вход. Токены установлены в httpOnly-cookie (`access_token`, `refresh_token`)' })
  @ApiResponse({ status: 401, description: 'Неверные учётные данные' })
  @ApiResponse({ status: 429, description: 'Превышен лимит запросов (5/мин)' })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body() dto: loginRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.login(dto, res);
  }

  @ApiOperation({ summary: 'Обновление access-токена по refresh-токену из cookie' })
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, description: 'Новый access_token установлен в cookie' })
  @ApiResponse({ status: 401, description: 'Refresh-токен отсутствует или недействителен' })
  @Post('refresh')
  async refresh(@Res({ passthrough: true }) res: Response) {
    return this.authService.refresh(res);
  }

  @ApiOperation({ summary: 'Инициация OAuth через Google' })
  @ApiResponse({ status: 302, description: 'Перенаправление на страницу Google для авторизации' })
  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {

  }

  @ApiOperation({ summary: 'Callback Google OAuth — устанавливает токены и перенаправляет на фронтенд' })
  @ApiResponse({ status: 302, description: 'Перенаправление на /file-system с установленными cookie' })
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(
    @Req() req,
    @Res() res: Response,
  ) {
    await this.authService.generateToken(req.user, res as any);
    const frontendOrigin = this.configService.get<string>('ALLOWED_ORIGIN') || 'http://localhost:4200';
    (res as any).redirect(`${frontendOrigin}/file-system`);
  }

  @ApiOperation({ summary: 'Выход из системы' })
  @ApiCookieAuth('access_token')
  @ApiResponse({ status: 200, description: 'Токены удалены из cookie', schema: { example: { message: 'Успешный выход из системы' } } })
  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    const cookieOptions = {
      httpOnly: true,
      secure:   this.configService.get('NODE_ENV') === 'production',
      sameSite: 'strict' as const,
      path:     '/',
      maxAge:   0,
      expires:  new Date(0),
    };
    res.cookie('refresh_token', '', cookieOptions);
    res.cookie('access_token',  '', cookieOptions);
    return { message: 'Успешный выход из системы' };
  }
}
