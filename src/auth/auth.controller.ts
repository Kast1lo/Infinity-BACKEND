import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
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

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-email')
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.verifyEmail(dto, res);
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('resend-code')
  async resendCode(@Body('email') email: string) {
    return this.authService.resendCode(email);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
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

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {

  }

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
