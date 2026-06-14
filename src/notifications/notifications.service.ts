import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaDatabaseService } from 'src/prisma-database/prisma-database.service';

export interface CreateNotificationInput {
  type?: string;          // 'share' | 'plan' | 'system' | ...
  title: string;
  body?: string | null;
  link?: string | null;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaDatabaseService) {}

  // Создать уведомление. Безопасно «проглатывает» ошибки — побочное действие
  // не должно ломать основную операцию (шаринг, активацию промокода и т.п.).
  async create(userId: string, input: CreateNotificationInput) {
    try {
      return await this.prisma.notification.create({
        data: {
          userId,
          type:  input.type ?? 'system',
          title: input.title,
          body:  input.body ?? null,
          link:  input.link ?? null,
        },
      });
    } catch {
      return null;
    }
  }

  async list(userId: string, limit = 30) {
    return this.prisma.notification.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      take:    Math.min(Math.max(limit, 1), 100),
    });
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({ where: { userId, isRead: false } });
    return { count };
  }

  async markRead(userId: string, id: string) {
    const n = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!n) throw new NotFoundException('Уведомление не найдено');
    if (n.isRead) return n;
    return this.prisma.notification.update({
      where: { id },
      data:  { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data:  { isRead: true, readAt: new Date() },
    });
    return { message: 'Все уведомления отмечены прочитанными' };
  }

  async remove(userId: string, id: string) {
    const n = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!n) throw new NotFoundException('Уведомление не найдено');
    await this.prisma.notification.delete({ where: { id } });
    return { message: 'Уведомление удалено' };
  }

  async clear(userId: string) {
    await this.prisma.notification.deleteMany({ where: { userId } });
    return { message: 'Уведомления очищены' };
  }
}
