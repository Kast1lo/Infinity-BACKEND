import { Body, Controller, Post, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { Response } from 'express';
import { RegisterDto } from './DTO/register.dto';
import { loginRequest } from './DTO/login.dto';
import { ref } from 'process';
import { ConfigService } from '@nestjs/config/dist/config.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService
    , private readonly configService: ConfigService
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({passthrough: true}) res: Response) {
    return await this.authService.register(dto, res);
  }

  @Post('login')
  async login(@Body() dto: loginRequest, @Res({passthrough: true}) res: Response) {
    return await this.authService.login(dto, res);
  }

  @Post('refresh')
  async refresh(@Res({passthrough:true}) res: Response){
    return await this.authService.refresh(res);
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
  res.cookie('refresh_token', '', {
    httpOnly: true,
    secure: this.configService.get('NODE_ENV') === 'production',
    sameSite: 'strict',
    path: '/',                        
    maxAge: 0,                        
    expires: new Date(0),             
  });
  res.cookie('access_token', '', {
    httpOnly: true,
    secure: this.configService.get('NODE_ENV') === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });
  return { message: 'Успешный выход из системы' };
}
}
