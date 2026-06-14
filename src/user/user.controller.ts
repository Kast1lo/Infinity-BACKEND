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
import { RequestEmailChangeDto } from './DTO/request-email-change.dto';
import { ConfirmEmailChangeDto } from './DTO/confirm-email-change.dto';
import { FileInterceptor } from '@nestjs/platform-express/multer/interceptors/file.interceptor';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiCookieAuth,
  ApiConsumes,
} from '@nestjs/swagger';

@ApiTags('User')
@ApiCookieAuth('access_token')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @ApiOperation({ summary: 'Получить профиль текущего пользователя' })
  @ApiResponse({
    status: 200,
    description: 'Данные профиля',
    schema: {
      example: {
        id: 'uuid', email: 'user@example.com', username: 'john_doe',
        createdAt: '2025-01-01T00:00:00.000Z', avatarKey: 'avatars/uuid.jpg',
        avatarUrl: 'https://storage.example.com/signed-url',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Не аутентифицирован' })
  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  async getProfile(@Req() req) {
    if (!req.user) throw new UnauthorizedException('Пользователь не аутентифицирован');
    return this.userService.getProfile(req.user.userId);
  }

  @ApiOperation({ summary: 'Обновить имя пользователя / email' })
  @ApiBody({ type: updateProfile })
  @ApiResponse({ status: 200, description: 'Профиль обновлён' })
  @ApiResponse({ status: 400, description: 'Некорректные данные' })
  @Patch('updateProfile')
  @UseGuards(AuthGuard('jwt'))
  async updateProfile(@Req() req, @Body() dto: updateProfile) {
    return this.userService.updateProfile(req.user.userId, dto);
  }

  @ApiOperation({ summary: 'Сменить пароль' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 200, description: 'Пароль успешно изменён', schema: { example: { message: 'Пароль успешно изменён' } } })
  @ApiResponse({ status: 400, description: 'Неверный текущий пароль' })
  @Patch('changePassword')
  @UseGuards(AuthGuard('jwt'))
  async changePassword(@Req() req, @Body() dto: ChangePasswordDto) {
    return this.userService.changePassword(req.user.userId, dto);
  }

  @ApiOperation({ summary: 'Запросить смену email (отправляет код на новый адрес)' })
  @ApiBody({ type: RequestEmailChangeDto })
  @ApiResponse({ status: 200, description: 'Код отправлен на новый email' })
  @ApiResponse({ status: 400, description: 'Неверный пароль или email' })
  @ApiResponse({ status: 409, description: 'Email уже занят' })
  @Post('request-email-change')
  @UseGuards(AuthGuard('jwt'))
  async requestEmailChange(@Req() req, @Body() dto: RequestEmailChangeDto) {
    return this.userService.requestEmailChange(req.user.userId, dto);
  }

  @ApiOperation({ summary: 'Подтвердить смену email кодом' })
  @ApiBody({ type: ConfirmEmailChangeDto })
  @ApiResponse({ status: 200, description: 'Email изменён' })
  @ApiResponse({ status: 400, description: 'Неверный или просроченный код' })
  @Post('confirm-email-change')
  @UseGuards(AuthGuard('jwt'))
  async confirmEmailChange(@Req() req, @Body() dto: ConfirmEmailChangeDto) {
    return this.userService.confirmEmailChange(req.user.userId, dto);
  }

  @ApiOperation({ summary: 'Загрузить аватар пользователя' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary', description: 'Файл изображения (JPEG, PNG, GIF, WebP, BMP)' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Аватар загружен', schema: { example: { avatarKey: 'avatars/uuid.jpg', avatarUrl: 'https://...' } } })
  @Post('createAvatar')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('file'))
  async createAvatar(@Req() req, @UploadedFile() file: Express.Multer.File) {
    return this.userService.createAvatar(req.user.userId, file);
  }
}
