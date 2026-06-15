import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaDatabaseService } from '../prisma-database/prisma-database.service';
import { PLAN_LIMITS, PLAN_PRICES, PaidPlan, PlanType } from './plan.constants';
import { PlanInfoResponse } from './interfaces/plan-info.response ';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../services/files.service';

@Injectable()
export class PlanService {
  private readonly logger = new Logger('PlanService');

  constructor(
    private readonly prisma: PrismaDatabaseService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
  ) {}

  async getPlanInfo(userId: string): Promise<PlanInfoResponse> {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: {
        planType:      true,
        planExpiresAt: true,
        isFrozen:      true,
        frozenAt:      true,
        storageUsed:   true,
        cardBound:     true,
        cardLast4:     true,
        autoRenew:     true,
      },
    });

    if (!user) throw new NotFoundException('Пользователь не найден');

    const planType = (user.planType ?? 'spark') as PlanType;
    const limits   = PLAN_LIMITS[planType] ?? PLAN_LIMITS.spark;

    let daysLeft: number | null = null;
    if (planType === 'spark' && user.planExpiresAt) {
      const diff = user.planExpiresAt.getTime() - Date.now();
      daysLeft   = Math.max(0, Math.ceil(diff / 86_400_000));
    }

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
      cardBound: user.cardBound,
      cardLast4: user.cardLast4 ?? null,
      autoRenew: user.autoRenew,
    };
  }

  getPricing() {
    const order: PaidPlan[] = ['pulse', 'horizon', 'eternal'];
    return order.map((plan) => {
      const price  = PLAN_PRICES[plan];
      const limits = PLAN_LIMITS[plan];
      return {
        plan,
        label:     limits.label,
        amount:    price.amount,
        period:    price.period,            // month | year | once
        recurring: price.recurring,
        storageGb: Number(limits.storageBytes / (1024n * 1024n * 1024n)),
      };
    });
  }

  async checkStorageLimit(userId: string, fileSize: bigint): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { planType: true, storageUsed: true, isFrozen: true, planExpiresAt: true },
    });

    if (!user) throw new NotFoundException('Пользователь не найден');

    if (user.isFrozen) {
      throw new ForbiddenException(
        'Ваши данные заморожены. Оформите подписку для восстановления доступа.',
      );
    }

    if (user.planType !== 'eternal' && user.planExpiresAt && user.planExpiresAt < new Date()) {
      throw new ForbiddenException(
        'Ваша подписка истекла. Оформите подписку для продолжения загрузки файлов.',
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

  async checkTaskLimit(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { planType: true, isFrozen: true, planExpiresAt: true },
    });

    if (!user) throw new NotFoundException('Пользователь не найден');

    if (user.isFrozen) {
      throw new ForbiddenException(
        'Ваши данные заморожены. Оформите подписку для восстановления доступа.',
      );
    }

    if (user.planType !== 'eternal' && user.planExpiresAt && user.planExpiresAt < new Date()) {
      throw new ForbiddenException(
        'Ваша подписка истекла. Оформите подписку для создания новых задач.',
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

  async checkProjectLimit(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { planType: true, isFrozen: true, planExpiresAt: true },
    });

    if (!user) throw new NotFoundException('Пользователь не найден');

    if (user.isFrozen) {
      throw new ForbiddenException(
        'Ваши данные заморожены. Оформите подписку для восстановления доступа.',
      );
    }

    if (user.planType !== 'eternal' && user.planExpiresAt && user.planExpiresAt < new Date()) {
      throw new ForbiddenException(
        'Ваша подписка истекла. Оформите подписку для создания новых проектов.',
      );
    }

    const limits = PLAN_LIMITS[(user.planType as PlanType)] ?? PLAN_LIMITS.spark;

    if (limits.maxProjects === Infinity) return;

    const projectCount = await this.prisma.project.count({ where: { userId } });

    if (projectCount >= limits.maxProjects) {
      throw new ForbiddenException(
        `Достигнут лимит проектов (${limits.maxProjects}) для тарифа Spark. Перейдите на платный тариф.`,
      );
    }
  }

  async checkAndIncrementAiCalls(userId: string): Promise<{ used: number; limit: number }> {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: {
        planType:        true,
        isFrozen:        true,
        planExpiresAt:   true,
        aiCallsToday:    true,
        aiCallsResetAt:  true,
      },
    });

    if (!user) throw new NotFoundException('Пользователь не найден');

    if (user.isFrozen) {
      throw new ForbiddenException(
        'Ваши данные заморожены. Оформите подписку для восстановления доступа.',
      );
    }

    if (user.planType !== 'eternal' && user.planExpiresAt && user.planExpiresAt < new Date()) {
      throw new ForbiddenException(
        'Ваша подписка истекла. Оформите подписку для использования AI-генерации.',
      );
    }

    const limits = PLAN_LIMITS[(user.planType as PlanType)] ?? PLAN_LIMITS.spark;
    const limit  = limits.aiCallsPerDay;

    const now             = new Date();
    const startOfToday    = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const needsReset      = !user.aiCallsResetAt || user.aiCallsResetAt < startOfToday;
    const currentUsed     = needsReset ? 0 : user.aiCallsToday;

    if (limit !== Infinity && currentUsed >= limit) {
      throw new ForbiddenException(
        `Достигнут дневной лимит AI-генераций (${limit}). Попробуйте завтра или перейдите на тариф с большим лимитом.`,
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        aiCallsToday:   needsReset ? 1 : { increment: 1 },
        aiCallsResetAt: needsReset ? now : user.aiCallsResetAt ?? now,
      },
    });

    return {
      used:  currentUsed + 1,
      limit: limit === Infinity ? -1 : limit,
    };
  }

  async updateStorageUsed(userId: string, delta: bigint): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data:  { storageUsed: { increment: delta } },
    });

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

  async activatePromoCode(userId: string, code: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { planType: true },
    });

    if (!user) throw new NotFoundException('Пользователь не найден');

    if (user.planType === 'eternal') {
      throw new BadRequestException('У вас уже активирован тариф Eternal');
    }

    let activatedPlanType: string;

    await this.prisma.$transaction(async (tx) => {
      const promo = await tx.promoCode.findUnique({
        where:  { code },
        select: { usedById: true, planType: true, code: true },
      });

      if (!promo) {
        throw new BadRequestException('Промокод не найден или недействителен');
      }

      if (promo.usedById) {
        throw new BadRequestException('Этот промокод уже был использован');
      }

      activatedPlanType = promo.planType;

      await tx.promoCode.update({
        where: { code },
        data:  { usedById: userId, usedAt: new Date() },
      });

      await tx.user.update({
        where: { id: userId },
        data:  {
          planType:      promo.planType,
          planExpiresAt: null,
          isFrozen:      false,
          frozenAt:      null,
        },
      });
    });

    const label = PLAN_LIMITS[activatedPlanType! as PlanType]?.label ?? activatedPlanType!;

    await this.notifications.create(userId, {
      type:  'plan',
      title: 'Тариф активирован',
      body:  `Подключён план ${label}`,
      link:  '/profile',
    });

    return { message: `Тариф ${label} успешно активирован!` };
  }

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
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(8);
    const seg   = (offset: number, len: number) =>
      Array.from({ length: len }, (_, i) => chars[bytes[offset + i] % chars.length]).join('');
    return `INF-${seg(0, 4)}-${seg(4, 4)}`;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiredSpark(): Promise<void> {
    const now = new Date();

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
      for (const { id } of toFreeze) {
        await this.notifications.create(id, {
          type:  'plan',
          title: 'Аккаунт заморожен',
          body:  'Срок trial-плана Spark истёк. Данные удалятся через 14 дней — активируйте план, чтобы сохранить их.',
          link:  '/profile',
        });
      }
      process.stdout.write(`[PlanService] Заморожено: ${toFreeze.length} пользователей\n`);
    }

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
      // Сначала удаляем сами объекты из S3. Без этого строки в БД стираются,
      // а файлы остаются в хранилище — это и утечка места/денег, и нарушение
      // политики удаления данных (152-ФЗ обещает фактическое удаление).
      const files = await this.prisma.file.findMany({
        where:  { ownerId: id },
        select: { path: true },
      });
      for (const f of files) {
        await this.storage.deleteFile(f.path).catch(err =>
          this.logger.warn(`Не удалось удалить объект S3 "${f.path}" пользователя ${id}: ${err?.message}`),
        );
      }

      await this.prisma.$transaction([
        this.prisma.file.deleteMany({ where: { ownerId: id } }),
        this.prisma.folder.deleteMany({ where: { ownerId: id } }),
        this.prisma.project.deleteMany({ where: { userId: id } }),
        this.prisma.user.update({
          where: { id },
          data:  { storageUsed: 0n },
        }),
      ]);
    }

    if (toDelete.length > 0) {
      process.stdout.write(`[PlanService] Удалены данные: ${toDelete.length} пользователей\n`);
    }
  }
}
