import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { UserService } from './user.service';
import { AuthGuard } from '@nestjs/passport';
import { updateProfile } from './DTO/update-profile.dto';
import { ChangePasswordDto } from './DTO/change-password.dto';
import { FileInterceptor } from '@nestjs/platform-express/multer/interceptors/file.interceptor';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  async getProfile(@Req() req) {
    if (!req.user) throw new UnauthorizedException('Пользователь не аутентифицирован');
    return this.userService.getProfile(req.user.userId);
  }

  @Patch('updateProfile')
  @UseGuards(AuthGuard('jwt'))
  async updateProfile(@Req() req, @Body() dto: updateProfile) {
    return this.userService.updateProfile(req.user.userId, dto);
  }

  // ─── Смена пароля ───
  @Patch('changePassword')
  @UseGuards(AuthGuard('jwt'))
  async changePassword(@Req() req, @Body() dto: ChangePasswordDto) {
    return this.userService.changePassword(req.user.userId, dto);
  }

  @Post('createAvatar')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('file'))
  async createAvatar(@Req() req, @UploadedFile() file: Express.Multer.File) {
    return this.userService.createAvatar(req.user.userId, file);
  }
}