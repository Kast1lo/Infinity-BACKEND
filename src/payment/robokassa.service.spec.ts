import * as crypto from 'crypto';
import { RobokassaService } from './robokassa.service';

const md5Upper = (input: string) =>
  crypto.createHash('md5').update(input, 'utf8').digest('hex').toUpperCase();

describe('RobokassaService', () => {
  let service: RobokassaService;

  const LOGIN = 'infinity_shop';
  const PASS1 = 'pass-one-secret';
  const PASS2 = 'pass-two-secret';

  const savedEnv = { ...process.env };

  beforeEach(() => {
    process.env.ROBOKASSA_LOGIN = LOGIN;
    process.env.ROBOKASSA_PASS1 = PASS1;
    process.env.ROBOKASSA_PASS2 = PASS2;
    delete process.env.ROBOKASSA_IS_TEST;
    service = new RobokassaService();
  });

  afterAll(() => {
    process.env = savedEnv;
  });

  describe('configured', () => {
    it('возвращает true, когда заданы login и оба пароля', () => {
      expect(service.configured()).toBe(true);
    });

    it('возвращает false, если не хватает любого из ключей', () => {
      delete process.env.ROBOKASSA_PASS2;
      expect(new RobokassaService().configured()).toBe(false);
    });
  });

  describe('buildPaymentUrl', () => {
    it('формирует ссылку на хостовую страницу Robokassa с корректной подписью', () => {
      const url = service.buildPaymentUrl({
        invId: 42,
        amount: 399,
        description: 'Infinity Pulse — месяц',
      });

      const parsed = new URL(url);
      expect(parsed.origin + parsed.pathname).toBe(
        'https://auth.robokassa.ru/Merchant/Index.aspx',
      );
      expect(parsed.searchParams.get('MerchantLogin')).toBe(LOGIN);
      expect(parsed.searchParams.get('OutSum')).toBe('399.00');
      expect(parsed.searchParams.get('InvId')).toBe('42');

      const expectedSig = md5Upper(`${LOGIN}:399.00:42:${PASS1}`);
      expect(parsed.searchParams.get('SignatureValue')).toBe(expectedSig);
    });

    it('форматирует сумму до двух знаков после запятой', () => {
      const url = service.buildPaymentUrl({ invId: 1, amount: 3599, description: 'x' });
      expect(new URL(url).searchParams.get('OutSum')).toBe('3599.00');
    });

    it('добавляет Recurring=true для инициирующего рекуррентного платежа', () => {
      const url = service.buildPaymentUrl({
        invId: 7,
        amount: 399,
        description: 'x',
        recurring: true,
      });
      expect(new URL(url).searchParams.get('Recurring')).toBe('true');
    });

    it('не добавляет Recurring для разового платежа', () => {
      const url = service.buildPaymentUrl({ invId: 7, amount: 4990, description: 'x' });
      expect(new URL(url).searchParams.has('Recurring')).toBe(false);
    });

    it('добавляет IsTest=1 в тестовом режиме', () => {
      process.env.ROBOKASSA_IS_TEST = '1';
      const url = new RobokassaService().buildPaymentUrl({
        invId: 1,
        amount: 1,
        description: 'x',
      });
      expect(new URL(url).searchParams.get('IsTest')).toBe('1');
    });
  });

  describe('verifyResult', () => {
    it('принимает корректную подпись ResultURL (md5 OutSum:InvId:Пароль#2)', () => {
      const sig = md5Upper(`399.00:42:${PASS2}`);
      expect(service.verifyResult('399.00', '42', sig)).toBe(true);
    });

    it('принимает подпись в любом регистре', () => {
      const sig = md5Upper(`399.00:42:${PASS2}`).toLowerCase();
      expect(service.verifyResult('399.00', '42', sig)).toBe(true);
    });

    it('отклоняет неверную подпись', () => {
      expect(service.verifyResult('399.00', '42', 'deadbeef')).toBe(false);
    });

    it('отклоняет пустую/отсутствующую подпись', () => {
      expect(service.verifyResult('399.00', '42', '')).toBe(false);
      expect(service.verifyResult('399.00', '42', undefined as any)).toBe(false);
    });

    it('отклоняет подпись, посчитанную с Паролем#1 (нельзя путать каналы)', () => {
      const sigWithPass1 = md5Upper(`399.00:42:${PASS1}`);
      expect(service.verifyResult('399.00', '42', sigWithPass1)).toBe(false);
    });
  });

  describe('verifySuccess', () => {
    it('принимает корректную подпись SuccessURL (md5 OutSum:InvId:Пароль#1)', () => {
      const sig = md5Upper(`399.00:42:${PASS1}`);
      expect(service.verifySuccess('399.00', '42', sig)).toBe(true);
    });

    it('отклоняет подпись с Паролем#2', () => {
      const sigWithPass2 = md5Upper(`399.00:42:${PASS2}`);
      expect(service.verifySuccess('399.00', '42', sigWithPass2)).toBe(false);
    });
  });
});
