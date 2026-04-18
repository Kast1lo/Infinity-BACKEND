import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaDatabaseService } from '../prisma-database/prisma-database.service';
import { PLAN_LIMITS, PlanType } from './plan.constants';
import { PlanInfoResponse } from './interfaces/plan-info.response ';


@Injectable()
export class PlanService {
  constructor(private readonly prisma: PrismaDatabaseService) {}

  // ─── Получить информацию о тарифе ───

  async getPlanInfo(userId: string): Promise<PlanInfoResponse> {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: {
        planType:      true,
        planExpiresAt: true,
        isFrozen:      true,
        frozenAt:      true,
        storageUsed:   true,
      },
    });

    if (!user) throw new NotFoundException('Пользователь не найден');

    const planType = (user.planType ?? 'spark') as PlanType;
    const limits   = PLAN_LIMITS[planType] ?? PLAN_LIMITS.spark;

    // Дней до конца триала (spark)
    let daysLeft: number | null = null;
    if (planType === 'spark' && user.planExpiresAt) {
      const diff = user.planExpiresAt.getTime() - Date.now();
      daysLeft   = Math.max(0, Math.ceil(diff / 86_400_000));
    }

    // Дней до удаления данных (frozen)
    let freezeDaysLeft: number | null = null;
    if (user.isFrozen && user.frozenAt) {
      const deleteAt     = new Date(user.frozenAt.getTime() + 14 * 86_400_000);
      const diff         = deleteAt.getTime() - Date.now();
      freezeDaysLeft     = Math.max(0, Math.ceil(diff / 86_400_000));
    }

    const usedBytes  = Number(user.storageUsed ?? 0n);
    const limitBytes = Number(limits.storageBytes);

    return {
      planType,
      planLabel:      limits.label,
      planExpiresAt:  user.planExpiresAt ?? null,
      isFrozen:       user.isFrozen,
      frozenAt:       user.frozenAt ?? null,
      daysLeft,
      freezeDaysLeft,
      storage: {
        usedBytes,
        limitBytes,
        percent: limitBytes > 0
          ? Math.min(100, Math.round((usedBytes / limitBytes) * 100))
          : 0,
      },
    };
  }

  // ─── Проверить лимит хранилища ───

  async checkStorageLimit(userId: string, fileSize: bigint): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { planType: true, storageUsed: true, isFrozen: true },
    });

    if (!user) throw new NotFoundException('Пользователь не найден');

    if (user.isFrozen) {
      throw new ForbiddenException(
        'Ваши данные заморожены. Оформите подписку для восстановления доступа.',
      );
    }

    const limits   = PLAN_LIMITS[(user.planType as PlanType)] ?? PLAN_LIMITS.spark;
    const newTotal = (user.storageUsed ?? 0n) + fileSize;

    if (newTotal > limits.storageBytes) {
      const limitGb = (Number(limits.storageBytes) / 1024 ** 3).toFixed(0);
      throw new ForbiddenException(
        `Превышен лимит хранилища (${limitGb} ГБ). Перейдите на другой тариф.`,
      );
    }
  }

  // ─── Проверить лимит задач ───

  async checkTaskLimit(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { planType: true, isFrozen: true },
    });

    if (!user) throw new NotFoundException('Пользователь не найден');

    if (user.isFrozen) {
      throw new ForbiddenException(
        'Ваши данные заморожены. Оформите подписку для восстановления доступа.',
      );
    }

    const limits = PLAN_LIMITS[(user.planType as PlanType)] ?? PLAN_LIMITS.spark;

    if (limits.maxTasks === Infinity) return;

    const taskCount = await this.prisma.task.count({ where: { userId } });

    if (taskCount >= limits.maxTasks) {
      throw new ForbiddenException(
        `Достигнут лимит задач (${limits.maxTasks}) для тарифа Spark. Перейдите на платный тариф.`,
      );
    }
  }

  // ─── Обновить занятое хранилище ───

  async updateStorageUsed(userId: string, delta: bigint): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data:  { storageUsed: { increment: delta } },
    });

    // Защита от отрицательного значения
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { storageUsed: true },
    });

    if (user && user.storageUsed < 0n) {
      await this.prisma.user.update({
        where: { id: userId },
        data:  { storageUsed: 0n },
      });
    }
  }

  // ─── Активировать промокод ───

  async activatePromoCode(userId: string, code: string): Promise<{ message: string }> {
    const promo = await this.prisma.promoCode.findUnique({
      where: { code },
    });

    if (!promo) {
      throw new BadRequestException('Промокод не найден или недействителен');
    }

    if (promo.usedById) {
      throw new BadRequestException('Этот промокод уже был использован');
    }

    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { planType: true },
    });

    if (!user) throw new NotFoundException('Пользователь не найден');

    if (user.planType === 'eternal') {
      throw new BadRequestException('У вас уже активирован тариф Eternal');
    }

    await this.prisma.$transaction([
      this.prisma.promoCode.update({
        where: { code: promo.code },
        data:  { usedById: userId, usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data:  {
          planType:      promo.planType,
          planExpiresAt: null,
          isFrozen:      false,
          frozenAt:      null,
        },
      }),
    ]);

    const label = PLAN_LIMITS[promo.planType as PlanType]?.label ?? promo.planType;
    return { message: `Тариф ${label} успешно активирован!` };
  }

  // ─── Сгенерировать промокоды (только для админа) ───

  async generatePromoCodes(
    count:   number,
    note?:   string,
    source:  string = 'manual',
  ): Promise<{ codes: string[]; count: number }> {
    const codes = Array.from({ length: count }, () => this.generateCode());

    await this.prisma.promoCode.createMany({
      data: codes.map(code => ({
        code,
        planType: 'eternal',
        source,
        note: note ?? null,
      })),
    });

    return { codes, count: codes.length };
  }

  private generateCode(): string {
    // Формат: INF-XXXX-XXXX
    const chars   = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const segment = (len: number) =>
      Array.from(
        { length: len },
        () => chars[Math.floor(Math.random() * chars.length)],
      ).join('');

    return `INF-${segment(4)}-${segment(4)}`;
  }

  // ─── CRON: заморозка и удаление истёкших Spark ───

  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiredSpark(): Promise<void> {
    const now = new Date();

    // 1. Заморозить пользователей у которых истёк spark
    const toFreeze = await this.prisma.user.findMany({
      where: {
        planType:      'spark',
        isFrozen:      false,
        planExpiresAt: { lte: now },
      },
      select: { id: true },
    });

    if (toFreeze.length > 0) {
      await this.prisma.user.updateMany({
        where: { id: { in: toFreeze.map(u => u.id) } },
        data:  { isFrozen: true, frozenAt: now },
      });
      console.log(`[PlanService] Заморожено: ${toFreeze.length} пользователей`);
    }

    // 2. Удалить данные пользователей заморожённых > 14 дней
    const deleteThreshold = new Date(now.getTime() - 14 * 86_400_000);

    const toDelete = await this.prisma.user.findMany({
      where: {
        planType: 'spark',
        isFrozen: true,
        frozenAt: { lte: deleteThreshold },
      },
      select: { id: true },
    });

    for (const { id } of toDelete) {
      await this.prisma.$transaction([
        this.prisma.file.deleteMany({ where: { ownerId: id } }),
        this.prisma.folder.deleteMany({ where: { ownerId: id } }),
        this.prisma.task.deleteMany({ where: { userId: id } }),
        this.prisma.taskColumn.deleteMany({ where: { userId: id } }),
        this.prisma.user.update({
          where: { id },
          data:  { storageUsed: 0n },
        }),
      ]);
    }

    if (toDelete.length > 0) {
      console.log(`[PlanService] Удалены данные: ${toDelete.length} пользователей`);
    }
  }
}