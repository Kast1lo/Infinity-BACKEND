/**
 * Лёгкий мок PrismaDatabaseService для unit-тестов.
 * Каждый метод — jest.fn(); `$transaction` поддерживает оба вызова:
 *   - с колбэком: prisma.$transaction(async (tx) => ...) — tx === сам мок;
 *   - с массивом промисов: prisma.$transaction([...]).
 */
export type PrismaMock = ReturnType<typeof createPrismaMock>;

export function createPrismaMock() {
  const model = () => ({
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn(),
  });

  const mock: any = {
    user: model(),
    payment: model(),
    promoCode: model(),
    task: model(),
    project: model(),
    file: model(),
    folder: model(),
  };

  mock.$transaction = jest.fn((arg: any) => {
    if (typeof arg === 'function') return arg(mock);
    return Promise.all(arg);
  });

  return mock;
}

/** Заглушка NotificationsService с no-op create. */
export function createNotificationsMock() {
  return { create: jest.fn().mockResolvedValue(undefined) };
}
