import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PaymentService } from './payment.service';
import { createPrismaMock, createNotificationsMock } from '../test-utils/prisma.mock';

describe('PaymentService', () => {
  let service: PaymentService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let notifications: ReturnType<typeof createNotificationsMock>;
  let robokassa: {
    configured: jest.Mock;
    buildPaymentUrl: jest.Mock;
    verifyResult: jest.Mock;
    chargeRecurring: jest.Mock;
  };

  beforeEach(() => {
    prisma = createPrismaMock();
    notifications = createNotificationsMock();
    robokassa = {
      configured: jest.fn().mockReturnValue(true),
      buildPaymentUrl: jest.fn().mockReturnValue('https://pay.example/redirect'),
      verifyResult: jest.fn().mockReturnValue(true),
      chargeRecurring: jest.fn(),
    };
    service = new PaymentService(prisma as any, robokassa as any, notifications as any);
  });

  describe('createSubscription', () => {
    it('бросает ServiceUnavailable, если Robokassa не сконфигурирована', async () => {
      robokassa.configured.mockReturnValue(false);
      await expect(service.createSubscription('u1', 'pulse')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('создаёт платёж Pulse как инициирующий рекуррент и возвращает ссылку', async () => {
      prisma.payment.create.mockResolvedValue({ invId: 100, description: 'Infinity Pulse — месяц' });

      const res = await service.createSubscription('u1', 'pulse');

      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'u1',
            planType: 'pulse',
            period: 'month',
            amount: 399,
            isRecurringInit: true,
          }),
        }),
      );
      expect(robokassa.buildPaymentUrl).toHaveBeenCalledWith(
        expect.objectContaining({ invId: 100, amount: 399, recurring: true }),
      );
      expect(res).toEqual({ url: 'https://pay.example/redirect' });
    });
  });

  describe('createEternal', () => {
    it('бросает NotFound, если пользователь не найден', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.createEternal('u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('бросает BadRequest, если Eternal уже активирован', async () => {
      prisma.user.findUnique.mockResolvedValue({ planType: 'eternal' });
      await expect(service.createEternal('u1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('создаёт разовый платёж без рекуррента', async () => {
      prisma.user.findUnique.mockResolvedValue({ planType: 'spark' });
      prisma.payment.create.mockResolvedValue({ invId: 200, description: 'Infinity Eternal — навсегда' });

      const res = await service.createEternal('u1');

      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ planType: 'eternal', period: 'once', isRecurringInit: false }),
        }),
      );
      expect(robokassa.buildPaymentUrl).toHaveBeenCalledWith(
        expect.objectContaining({ recurring: false }),
      );
      expect(res).toEqual({ url: 'https://pay.example/redirect' });
    });
  });

  describe('handleResult', () => {
    it('возвращает false при нечисловом InvId', async () => {
      expect(await service.handleResult('399.00', 'abc', 'sig')).toBe(false);
      expect(robokassa.verifyResult).not.toHaveBeenCalled();
    });

    it('возвращает false при неверной подписи', async () => {
      robokassa.verifyResult.mockReturnValue(false);
      expect(await service.handleResult('399.00', '100', 'bad')).toBe(false);
      expect(prisma.payment.findUnique).not.toHaveBeenCalled();
    });

    it('возвращает false, если платёж не найден', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);
      expect(await service.handleResult('399.00', '100', 'sig')).toBe(false);
    });

    it('идемпотентен: повторный коллбэк по success не активирует тариф второй раз', async () => {
      prisma.payment.findUnique.mockResolvedValue({ invId: 100, status: 'success' });
      const res = await service.handleResult('399.00', '100', 'sig');
      expect(res).toBe(true);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it('активирует тариф и атомарно помечает платёж success при первом коллбэке', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        invId: 100,
        status: 'pending',
        userId: 'u1',
        planType: 'pulse',
        period: 'month',
        isRecurringInit: true,
      });
      prisma.payment.updateMany.mockResolvedValue({ count: 1 }); // захват платежа удался
      prisma.user.findUnique.mockResolvedValue({ planType: 'spark', planExpiresAt: null });

      const res = await service.handleResult('399.00', '100', 'sig');

      expect(res).toBe(true);
      // захват — условный апдейт pending→success
      expect(prisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { invId: 100, status: 'pending' },
          data: expect.objectContaining({ status: 'success' }),
        }),
      );
      // тариф активирован + карта привязана (рекуррент-инициатор)
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: expect.objectContaining({
            planType: 'pulse',
            isFrozen: false,
            cardBound: true,
            autoRenew: true,
            recurringParentInvId: 100,
          }),
        }),
      );
      expect(notifications.create).toHaveBeenCalled();
    });

    it('НЕ активирует тариф, если платёж уже забрал параллельный коллбэк (claim.count === 0)', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        invId: 100,
        status: 'pending',
        userId: 'u1',
        planType: 'pulse',
        period: 'month',
        isRecurringInit: true,
      });
      prisma.payment.updateMany.mockResolvedValue({ count: 0 }); // захват не удался — гонка проиграна

      const res = await service.handleResult('399.00', '100', 'sig');

      expect(res).toBe(true); // идемпотентно: коллбэк успешен, но активации нет
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('откатывает статус в pending и возвращает false, если активация упала', async () => {
      prisma.payment.findUnique.mockResolvedValue({
        invId: 100,
        status: 'pending',
        userId: 'u1',
        planType: 'pulse',
        period: 'month',
        isRecurringInit: true,
      });
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findUnique.mockResolvedValue({ planType: 'spark', planExpiresAt: null });
      prisma.user.update.mockRejectedValue(new Error('db down')); // активация падает

      const res = await service.handleResult('399.00', '100', 'sig');

      expect(res).toBe(false);
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { invId: 100 }, data: expect.objectContaining({ status: 'pending', paidAt: null }) }),
      );
    });

    it('продлевает плановую дату на месяц от текущего срока для подписки Pulse', async () => {
      const base = new Date(Date.now() + 5 * 86_400_000); // подписка ещё активна (в будущем)
      prisma.payment.findUnique.mockResolvedValue({
        invId: 101,
        status: 'pending',
        userId: 'u1',
        planType: 'pulse',
        period: 'month',
        isRecurringInit: false,
      });
      prisma.payment.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findUnique.mockResolvedValue({ planType: 'pulse', planExpiresAt: base });

      await service.handleResult('399.00', '101', 'sig');

      const data = prisma.user.update.mock.calls[0][0].data;
      const expiresAt: Date = data.planExpiresAt;
      const expected = new Date(base);
      expected.setMonth(expected.getMonth() + 1);
      expect(expiresAt.getMonth()).toBe(expected.getMonth()); // продлено ровно на месяц от base
      // не инициирующий рекуррент — карту не трогаем
      expect(data.cardBound).toBeUndefined();
    });
  });

  describe('setAutoRenew', () => {
    it('бросает NotFound, если пользователь не найден', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.setAutoRenew('u1', true)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('запрещает включить автопродление без привязанной карты', async () => {
      prisma.user.findUnique.mockResolvedValue({ cardBound: false });
      await expect(service.setAutoRenew('u1', true)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('включает автопродление при наличии карты', async () => {
      prisma.user.findUnique.mockResolvedValue({ cardBound: true });
      const res = await service.setAutoRenew('u1', true);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' }, data: { autoRenew: true } }),
      );
      expect(res).toEqual({ autoRenew: true });
    });

    it('позволяет выключить автопродление без проверки карты', async () => {
      prisma.user.findUnique.mockResolvedValue({ cardBound: false });
      const res = await service.setAutoRenew('u1', false);
      expect(res).toEqual({ autoRenew: false });
    });
  });

  describe('unbindCard', () => {
    it('сбрасывает привязку карты и автопродление', async () => {
      const res = await service.unbindCard('u1');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: expect.objectContaining({
            cardBound: false,
            autoRenew: false,
            recurringParentInvId: null,
            cardLast4: null,
          }),
        }),
      );
      expect(res).toEqual({ cardBound: false });
    });
  });
});
