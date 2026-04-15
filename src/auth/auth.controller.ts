import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import type { Response } from 'express';
import { RegisterDto } from './DTO/register.dto';
import { loginRequest } from './DTO/login.dto';
import { VerifyEmailDto } from './DTO/Verify-email.dto';
import { ConfigService } from '@nestjs/config/dist/config.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService:    AuthService,
    private readonly configService:  ConfigService,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // Подтверждение кода из письма
  @Post('verify-email')
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.verifyEmail(dto, res);
  }

  // Повторная отправка кода
  @Post('resend-code')
  async resendCode(@Body('email') email: string) {
    return this.authService.resendCode(email);
  }

  @Post('login')
  async login(
    @Body() dto: loginRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.login(dto, res);
  }

  @Post('refresh')
  async refresh(@Res({ passthrough: true }) res: Response) {
    return this.authService.refresh(res);
  }

  // ─── Google OAuth ───
  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    // Passport перенаправляет на Google
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(
    @Req() req,
    @Res() res: Response,
  ) {
    await this.authService.generateToken(req.user, res as any);
    // Редирект на фронтенд после успешного входа
    (res as any).redirect('http://localhost:4200/file-system');
  }

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