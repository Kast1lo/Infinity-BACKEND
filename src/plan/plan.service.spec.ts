import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PlanService } from './plan.service';
import { createPrismaMock, createNotificationsMock } from '../test-utils/prisma.mock';

describe('PlanService', () => {
  let service: PlanService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let notifications: ReturnType<typeof createNotificationsMock>;
  let storage: { deleteFile: jest.Mock };

  const GB = 1024 ** 3;

  beforeEach(() => {
    prisma = createPrismaMock();
    notifications = createNotificationsMock();
    storage = { deleteFile: jest.fn().mockResolvedValue(undefined) };
    service = new PlanService(prisma as any, notifications as any, storage as any);
  });

  describe('getPlanInfo', () => {
    it('бросает NotFound, если пользователь отсутствует', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getPlanInfo('u1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('считает процент занятого хранилища и метку плана', async () => {
      prisma.user.findUnique.mockResolvedValue({
        planType: 'pulse',
        planExpiresAt: null,
        isFrozen: false,
        frozenAt: null,
        storageUsed: BigInt(125 * GB), // половина от 250 ГБ
        cardBound: true,
        cardLast4: '4242',
        autoRenew: true,
      });

      const info = await service.getPlanInfo('u1');

      expect(info.planType).toBe('pulse');
      expect(info.planLabel).toBe('Infinity Pulse');
      expect(info.storage.percent).toBe(50);
      expect(info.cardLast4).toBe('4242');
    });

    it('считает daysLeft для Spark на основе planExpiresAt', async () => {
      const inThreeDays = new Date(Date.now() + 3 * 86_400_000 - 3_600_000); // ~2.96 дня → ceil = 3
      prisma.user.findUnique.mockResolvedValue({
        planType: 'spark',
        planExpiresAt: inThreeDays,
        isFrozen: false,
        frozenAt: null,
        storageUsed: 0n,
        cardBound: false,
        cardLast4: null,
        autoRenew: false,
      });

      const info = await service.getPlanInfo('u1');
      expect(info.daysLeft).toBe(3);
    });

    it('считает freezeDaysLeft (14 дней с момента заморозки)', async () => {
      const frozenAt = new Date(Date.now() - 4 * 86_400_000); // заморожен 4 дня назад
      prisma.user.findUnique.mockResolvedValue({
        planType: 'spark',
        planExpiresAt: null,
        isFrozen: true,
        frozenAt,
        storageUsed: 0n,
        cardBound: false,
        cardLast4: null,
        autoRenew: false,
      });

      const info = await service.getPlanInfo('u1');
      expect(info.freezeDaysLeft).toBe(10); // 14 - 4
    });
  });

  describe('getPricing', () => {
    it('возвращает три платных тарифа с объёмом в ГБ', () => {
      const pricing = service.getPricing();
      expect(pricing.map(p => p.plan)).toEqual(['pulse', 'horizon', 'eternal']);
      expect(pricing[0]).toEqual(
        expect.objectContaining({ plan: 'pulse', amount: 399, period: 'month', storageGb: 250 }),
      );
      expect(pricing[2]).toEqual(
        expect.objectContaining({ plan: 'eternal', amount: 4990, period: 'once', storageGb: 1024 }),
      );
    });
  });

  describe('checkStorageLimit', () => {
    it('бросает NotFound, если пользователь отсутствует', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.checkStorageLimit('u1', 1n)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('запрещает загрузку для замороженного аккаунта', async () => {
      prisma.user.findUnique.mockResolvedValue({ planType: 'spark', storageUsed: 0n, isFrozen: true, planExpiresAt: null });
      await expect(service.checkStorageLimit('u1', 1n)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('запрещает загрузку при истёкшей подписке', async () => {
      prisma.user.findUnique.mockResolvedValue({
        planType: 'pulse',
        storageUsed: 0n,
        isFrozen: false,
        planExpiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.checkStorageLimit('u1', 1n)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('запрещает превышение квоты хранилища', async () => {
      prisma.user.findUnique.mockResolvedValue({
        planType: 'spark',
        storageUsed: BigInt(5 * GB),
        isFrozen: false,
        planExpiresAt: null,
      });
      await expect(service.checkStorageLimit('u1', 1n)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('пропускает загрузку в пределах квоты', async () => {
      prisma.user.findUnique.mockResolvedValue({
        planType: 'spark',
        storageUsed: BigInt(1 * GB),
        isFrozen: false,
        planExpiresAt: null,
      });
      await expect(service.checkStorageLimit('u1', BigInt(GB))).resolves.toBeUndefined();
    });

    it('не считает истёкшей подписку Eternal (planExpiresAt в прошлом игнорируется)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        planType: 'eternal',
        storageUsed: 0n,
        isFrozen: false,
        planExpiresAt: new Date(Date.now() - 86_400_000),
      });
      await expect(service.checkStorageLimit('u1', 1n)).resolves.toBeUndefined();
    });
  });

  describe('checkTaskLimit', () => {
    it('пропускает безлимитные тарифы без обращения к count', async () => {
      prisma.user.findUnique.mockResolvedValue({ planType: 'pulse', isFrozen: false, planExpiresAt: null });
      await expect(service.checkTaskLimit('u1')).resolves.toBeUndefined();
      expect(prisma.task.count).not.toHaveBeenCalled();
    });

    it('запрещает превышение лимита задач на Spark', async () => {
      prisma.user.findUnique.mockResolvedValue({ planType: 'spark', isFrozen: false, planExpiresAt: null });
      prisma.task.count.mockResolvedValue(30);
      await expect(service.checkTaskLimit('u1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('пропускает создание задачи под лимитом', async () => {
      prisma.user.findUnique.mockResolvedValue({ planType: 'spark', isFrozen: false, planExpiresAt: null });
      prisma.task.count.mockResolvedValue(10);
      await expect(service.checkTaskLimit('u1')).resolves.toBeUndefined();
    });
  });

  describe('activatePromoCode', () => {
    it('запрещает активацию, если у пользователя уже Eternal', async () => {
      prisma.user.findUnique.mockResolvedValue({ planType: 'eternal' });
      await expect(service.activatePromoCode('u1', 'INF-XXXX-YYYY')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('бросает BadRequest для несуществующего промокода', async () => {
      prisma.user.findUnique.mockResolvedValue({ planType: 'spark' });
      prisma.promoCode.findUnique.mockResolvedValue(null);
      await expect(service.activatePromoCode('u1', 'NOPE')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('бросает BadRequest, если промокод уже использован', async () => {
      prisma.user.findUnique.mockResolvedValue({ planType: 'spark' });
      prisma.promoCode.findUnique.mockResolvedValue({ usedById: 'someone', planType: 'eternal', code: 'C' });
      await expect(service.activatePromoCode('u1', 'C')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('активирует тариф по валидному промокоду и шлёт уведомление', async () => {
      prisma.user.findUnique.mockResolvedValue({ planType: 'spark' });
      prisma.promoCode.findUnique.mockResolvedValue({ usedById: null, planType: 'eternal', code: 'C' });

      const res = await service.activatePromoCode('u1', 'C');

      expect(prisma.promoCode.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { code: 'C' }, data: expect.objectContaining({ usedById: 'u1' }) }),
      );
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ planType: 'eternal', isFrozen: false }) }),
      );
      expect(notifications.create).toHaveBeenCalled();
      expect(res.message).toContain('Eternal');
    });
  });

  describe('generatePromoCodes', () => {
    it('генерирует запрошенное число кодов в формате INF-XXXX-YYYY', async () => {
      prisma.promoCode.createMany.mockResolvedValue({ count: 3 });
      const { codes, count } = await service.generatePromoCodes(3, 'тест');
      expect(count).toBe(3);
      expect(codes).toHaveLength(3);
      for (const code of codes) {
        expect(code).toMatch(/^INF-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      }
      expect(prisma.promoCode.createMany).toHaveBeenCalled();
    });
  });

  describe('handleExpiredSpark (зачистка просроченных Spark)', () => {
    it('удаляет объекты S3 покинутых аккаунтов перед зачисткой БД', async () => {
      prisma.user.findMany
        .mockResolvedValueOnce([]) // toFreeze — новых заморозок нет
        .mockResolvedValueOnce([{ id: 'u1' }]); // toDelete — один просроченный 14+ дней
      prisma.file.findMany.mockResolvedValue([
        { path: 'users/u1/a.png' },
        { path: 'users/u1/b.pdf' },
      ]);

      await service.handleExpiredSpark();

      expect(storage.deleteFile).toHaveBeenCalledTimes(2);
      expect(storage.deleteFile).toHaveBeenCalledWith('users/u1/a.png');
      expect(storage.deleteFile).toHaveBeenCalledWith('users/u1/b.pdf');
      expect(prisma.$transaction).toHaveBeenCalled(); // строки БД тоже зачищены
    });

    it('best-effort: зачищает БД, даже если удаление объекта S3 упало', async () => {
      prisma.user.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'u1' }]);
      prisma.file.findMany.mockResolvedValue([{ path: 'users/u1/x' }]);
      storage.deleteFile.mockRejectedValue(new Error('S3 unavailable'));

      await service.handleExpiredSpark();

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('не трогает S3, если удалять некого', async () => {
      prisma.user.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      await service.handleExpiredSpark();
      expect(storage.deleteFile).not.toHaveBeenCalled();
    });
  });

  describe('updateStorageUsed', () => {
    it('инкрементит storageUsed и зажимает отрицательное значение в 0', async () => {
      prisma.user.findUnique.mockResolvedValue({ storageUsed: -5n });
      await service.updateStorageUsed('u1', -10n);
      expect(prisma.user.update).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ data: { storageUsed: { increment: -10n } } }),
      );
      expect(prisma.user.update).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ data: { storageUsed: 0n } }),
      );
    });
  });
});
