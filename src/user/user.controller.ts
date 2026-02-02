import { Body, Controller, Get, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth-guard.guard';
import { AuthGuard } from '@nestjs/passport';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  async getProfile(@Req() req) {
    console.log('req.user в профиле:', req.user);

    if (!req.user) {
      throw new UnauthorizedException('Пользователь не аутентифицирован');
    }

    return this.userService.getProfile(req.user.userId);
  }


}
