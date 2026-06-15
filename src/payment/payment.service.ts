import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaDatabaseService } from '../prisma-database/prisma-database.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RobokassaService } from './robokassa.service';
import { PLAN_LIMITS, PLAN_PRICES, PaidPlan } from '../plan/plan.constants';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger('Payment');

  constructor(
    private readonly prisma: PrismaDatabaseService,
    private readonly robokassa: RobokassaService,
    private readonly notifications: NotificationsService,
  ) {}

  private frontendUrl(): string {
    return process.env.ALLOWED_ORIGIN || 'http://localhost:4200';
  }

  private periodLabel(period: string): string {
    return period === 'month' ? 'месяц' : period === 'year' ? 'год' : 'навсегда';
  }

  /** Новая дата окончания подписки от текущей (продлеваем, если ещё активна). */
  private extendFrom(base: Date | null, period: string): Date | null {
    if (period === 'once') return null;
    const start = base && base.getTime() > Date.now() ? new Date(base) : new Date();
    if (period === 'month') start.setMonth(start.getMonth() + 1);
    else if (period === 'year') start.setFullYear(start.getFullYear() + 1);
    return start;
  }

  // ─────────────────────────── Создание платежей ───────────────────────────

  /** Подписка Pulse/Horizon — первый платёж привязывает карту (Recurring). */
  async createSubscription(userId: string, plan: 'pulse' | 'horizon'): Promise<{ url: string }> {
    if (!this.robokassa.configured()) {
      throw new ServiceUnavailableException('Оплата временно недоступна. Попробуйте позже.');
    }

    const price = PLAN_PRICES[plan];
    const label = PLAN_LIMITS[plan].label;

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        planType:        plan,
        period:          price.period,
        amount:          price.amount,
        isRecurringInit: price.recurring,
        description:     `${label} — ${this.periodLabel(price.period)}`,
      },
    });

    const url = this.robokassa.buildPaymentUrl({
      invId:       payment.invId,
      amount:      price.amount,
      description: payment.description!,
      recurring:   price.recurring,
    });

    return { url };
  }

  /** Eternal — разовая оплата (СБП выбирается на странице Robokassa), без привязки. */
  async createEternal(userId: string): Promise<{ url: string }> {
    if (!this.robokassa.configured()) {
      throw new ServiceUnavailableException('Оплата временно недоступна. Попробуйте позже.');
    }

    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { planType: true },
    });
    if (!user) throw new NotFoundException('Пользователь не найден');
    if (user.planType === 'eternal') {
      throw new BadRequestException('У вас уже активирован тариф Eternal');
    }

    const price = PLAN_PRICES.eternal;
    const label = PLAN_LIMITS.eternal.label;

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        planType:        'eternal',
        period:          price.period,
        amount:          price.amount,
        isRecurringInit: false,
        description:     `${label} — навсегда`,
      },
    });

    const url = this.robokassa.buildPaymentUrl({
      invId:       payment.invId,
      amount:      price.amount,
      description: payment.description!,
      recurring:   false,
    });

    return { url };
  }

  // ─────────────────────────── Коллбэки Robokassa ──────────────────────────

  /** ResultURL: подтверждение оплаты server-to-server. Возвращает true при успехе. */
  async handleResult(outSum: string, invIdRaw: string, signature: string): Promise<boolean> {
    const invId = Number(invIdRaw);
    if (!Number.isInteger(invId)) {
      this.logger.warn(`ResultURL: некорректный InvId="${invIdRaw}"`);
      return false;
    }

    if (!this.robokassa.verifyResult(outSum, invIdRaw, signature)) {
      this.logger.warn(`ResultURL: неверная подпись для InvId=${invId}`);
      return false;
    }

    const payment = await this.prisma.payment.findUnique({ where: { invId } });
    if (!payment) {
      this.logger.warn(`ResultURL: платёж InvId=${invId} не найден`);
      return false;
    }

    // Быстрый путь идемпотентности — платёж уже обработан.
    if (payment.status === 'success') return true;

    // Атомарный «захват» платежа: условный апдейт pending→success выполняется
    // одним запросом, поэтому из нескольких параллельных/повторных коллбэков
    // Robokassa ровно один получит count=1 и активирует тариф — гонки двойной
    // активации больше нет.
    const claim = await this.prisma.payment.updateMany({
      where: { invId, status: 'pending' },
      data:  { status: 'success', paidAt: new Date() },
    });
    if (claim.count === 0) {
      // Платёж уже забрал другой коллбэк — повторно тариф не активируем.
      return true;
    }

    try {
      await this.activatePlan(payment.userId, payment.planType as PaidPlan, payment.period, {
        isRecurringInit: payment.isRecurringInit,
        invId:           payment.invId,
      });
    } catch (e: any) {
      // Активация не удалась — откатываем захват, чтобы повторный коллбэк
      // (или сверка) обработал платёж заново, а не оставил «оплачено без тарифа».
      await this.prisma.payment.update({
        where: { invId },
        data:  { status: 'pending', paidAt: null },
      });
      this.logger.error(`ResultURL: активация InvId=${invId} не удалась (${e?.message}) — статус возвращён в pending`);
      return false;
    }

    return true;
  }

  /** Активация/продление тарифа после успешной оплаты. */
  private async activatePlan(
    userId: string,
    plan: PaidPlan,
    period: string,
    opts: { isRecurringInit: boolean; invId: number },
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { planExpiresAt: true, planType: true },
    });
    if (!user) return;

    // Продлеваем от текущей даты, если это тот же тариф и он ещё активен.
    const base = user.planType === plan ? user.planExpiresAt : null;
    const expiresAt = this.extendFrom(base, period);

    const data: any = {
      planType:      plan,
      planExpiresAt: expiresAt,
      isFrozen:      false,
      frozenAt:      null,
    };

    // Первый платёж рекуррента привязывает карту.
    if (opts.isRecurringInit) {
      data.cardBound            = true;
      data.autoRenew            = true;
      data.recurringParentInvId = opts.invId;
    }

    await this.prisma.user.update({ where: { id: userId }, data });

    const label = PLAN_LIMITS[plan].label;
    await this.notifications.create(userId, {
      type:  'plan',
      title: 'Тариф активирован',
      body:  period === 'once'
        ? `Подключён план ${label}`
        : `Подключён план ${label}. Активен до ${expiresAt?.toLocaleDateString('ru-RU')}.`,
      link:  '/profile',
    });
  }

  successRedirect(): string {
    return `${this.frontendUrl()}/profile?payment=success`;
  }

  failRedirect(): string {
    return `${this.frontendUrl()}/profile?payment=fail`;
  }

  // ─────────────────────────── Управление картой ───────────────────────────

  async setAutoRenew(userId: string, enabled: boolean): Promise<{ autoRenew: boolean }> {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { cardBound: true },
    });
    if (!user) throw new NotFoundException('Пользователь не найден');
    if (enabled && !user.cardBound) {
      throw new BadRequestException('Карта не привязана. Оформите тариф, чтобы включить автопродление.');
    }

    await this.prisma.user.update({ where: { id: userId }, data: { autoRenew: enabled } });
    return { autoRenew: enabled };
  }

  /** Отвязать карту: прекращаем рекуррентные списания. Тариф доживает оплаченный период. */
  async unbindCard(userId: string): Promise<{ cardBound: boolean }> {
    await this.prisma.user.update({
      where: { id: userId },
      data:  { cardBound: false, autoRenew: false, recurringParentInvId: null, cardLast4: null },
    });
    return { cardBound: false };
  }

  // ─────────────────────────── Автопродление (cron) ────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_NOON)
  async processRecurring(): Promise<void> {
    if (!this.robokassa.configured()) return;

    const soon = new Date(Date.now() + 24 * 3_600_000); // продлеваем за сутки до истечения

    const users = await this.prisma.user.findMany({
      where: {
        autoRenew:            true,
        cardBound:            true,
        recurringParentInvId: { not: null },
        planType:             { in: ['pulse', 'horizon'] },
        planExpiresAt:        { lte: soon },
      },
      select: { id: true, planType: true, recurringParentInvId: true },
    });

    for (const u of users) {
      // не дёргаем повторно, если уже есть незавершённое автопродление
      const pending = await this.prisma.payment.count({
        where: { userId: u.id, status: 'pending', isRecurringInit: false },
      });
      if (pending > 0) continue;

      const plan  = u.planType as PaidPlan;
      const price = PLAN_PRICES[plan];
      const label = PLAN_LIMITS[plan].label;

      const payment = await this.prisma.payment.create({
        data: {
          userId:          u.id,
          planType:        plan,
          period:          price.period,
          amount:          price.amount,
          isRecurringInit: false,
          description:     `Автопродление ${label}`,
        },
      });

      const res = await this.robokassa.chargeRecurring({
        invId:         payment.invId,
        previousInvId: u.recurringParentInvId!,
        amount:        price.amount,
        description:   payment.description!,
      });

      if (!res.ok) {
        await this.prisma.payment.update({
          where: { invId: payment.invId },
          data:  { status: 'fail' },
        });
        await this.notifications.create(u.id, {
          type:  'plan',
          title: 'Не удалось продлить подписку',
          body:  'Списание по карте не прошло. Проверьте карту или оплатите тариф вручную.',
          link:  '/profile',
        });
      }
      // Успех подтвердит ResultURL — там тариф и продлится.
    }
  }
}
