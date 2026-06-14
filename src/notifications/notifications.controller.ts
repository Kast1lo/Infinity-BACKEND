import { Controller, Get, Patch, Delete, Param, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiCookieAuth } from '@nestjs/swagger';

@ApiTags('Notifications')
@ApiCookieAuth('access_token')
@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @ApiOperation({ summary: 'Список уведомлений' })
  @ApiResponse({ status: 200, description: 'Последние уведомления пользователя' })
  @Get()
  async list(@Req() req) {
    return this.notifications.list(req.user.userId);
  }

  @ApiOperation({ summary: 'Количество непрочитанных' })
  @ApiResponse({ status: 200, description: '{ count }' })
  @Get('unread-count')
  async unreadCount(@Req() req) {
    return this.notifications.unreadCount(req.user.userId);
  }

  @ApiOperation({ summary: 'Отметить все прочитанными' })
  @Patch('read-all')
  async markAllRead(@Req() req) {
    return this.notifications.markAllRead(req.user.userId);
  }

  @ApiOperation({ summary: 'Отметить уведомление прочитанным' })
  @ApiParam({ name: 'id', description: 'UUID уведомления' })
  @Patch(':id/read')
  async markRead(@Req() req, @Param('id') id: string) {
    return this.notifications.markRead(req.user.userId, id);
  }

  @ApiOperation({ summary: 'Очистить все уведомления' })
  @Delete()
  async clear(@Req() req) {
    return this.notifications.clear(req.user.userId);
  }

  @ApiOperation({ summary: 'Удалить уведомление' })
  @ApiParam({ name: 'id', description: 'UUID уведомления' })
  @Delete(':id')
  async remove(@Req() req, @Param('id') id: string) {
    return this.notifications.remove(req.user.userId, id);
  }
}
