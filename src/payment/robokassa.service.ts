import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * Низкоуровневый клиент Robokassa: формирование платёжных ссылок,
 * проверка подписей коллбэков и рекуррентные списания.
 *
 * Env:
 *   ROBOKASSA_LOGIN   — MerchantLogin
 *   ROBOKASSA_PASS1   — Пароль #1 (формирование платежа / SuccessURL)
 *   ROBOKASSA_PASS2   — Пароль #2 (проверка ResultURL)
 *   ROBOKASSA_IS_TEST — '1' для тестового режима
 */
@Injectable()
export class RobokassaService {
  private readonly logger = new Logger('Robokassa');
  private static readonly BASE = 'https://auth.robokassa.ru/Merchant/Index.aspx';
  private static readonly RECURRING = 'https://auth.robokassa.ru/Merchant/Recurring';

  private get login(): string { return process.env.ROBOKASSA_LOGIN ?? ''; }
  private get pass1(): string { return process.env.ROBOKASSA_PASS1 ?? ''; }
  private get pass2(): string { return process.env.ROBOKASSA_PASS2 ?? ''; }
  get isTest(): boolean { return process.env.ROBOKASSA_IS_TEST === '1'; }

  configured(): boolean {
    return !!this.login && !!this.pass1 && !!this.pass2;
  }

  private md5(input: string): string {
    return crypto.createHash('md5').update(input, 'utf8').digest('hex').toUpperCase();
  }

  private outSum(amount: number): string {
    return amount.toFixed(2);
  }

  /** Ссылка для редиректа пользователя на страницу оплаты (инициирующий платёж). */
  buildPaymentUrl(opts: {
    invId: number;
    amount: number;
    description: string;
    recurring?: boolean;
  }): string {
    const out = this.outSum(opts.amount);
    const signature = this.md5(`${this.login}:${out}:${opts.invId}:${this.pass1}`);

    const params = new URLSearchParams({
      MerchantLogin:  this.login,
      OutSum:         out,
      InvId:          String(opts.invId),
      Description:    opts.description,
      SignatureValue: signature,
      Encoding:       'utf-8',
      Culture:        'ru',
    });
    if (opts.recurring) params.set('Recurring', 'true');
    if (this.isTest)    params.set('IsTest', '1');

    return `${RobokassaService.BASE}?${params.toString()}`;
  }

  /** Проверка подписи ResultURL: md5(OutSum:InvId:Пароль#2). */
  verifyResult(outSum: string, invId: string, signature: string): boolean {
    const expected = this.md5(`${outSum}:${invId}:${this.pass2}`);
    return expected === (signature ?? '').toUpperCase();
  }

  /** Проверка подписи SuccessURL: md5(OutSum:InvId:Пароль#1). */
  verifySuccess(outSum: string, invId: string, signature: string): boolean {
    const expected = this.md5(`${outSum}:${invId}:${this.pass1}`);
    return expected === (signature ?? '').toUpperCase();
  }

  /**
   * Рекуррентное списание по ранее привязанной карте.
   * previousInvId — InvId первого (привязочного) платежа.
   * Результат подтверждается асинхронно через ResultURL.
   */
  async chargeRecurring(opts: {
    invId: number;
    previousInvId: number;
    amount: number;
    description: string;
  }): Promise<{ ok: boolean; raw: string }> {
    const out = this.outSum(opts.amount);
    const signature = this.md5(`${this.login}:${out}:${opts.invId}:${this.pass1}`);

    const body = new URLSearchParams({
      MerchantLogin:     this.login,
      InvoiceID:         String(opts.invId),
      PreviousInvoiceID: String(opts.previousInvId),
      OutSum:            out,
      Description:       opts.description,
      SignatureValue:    signature,
    });
    if (this.isTest) body.set('IsTest', '1');

    try {
      const res = await fetch(RobokassaService.RECURRING, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    body.toString(),
      });
      const raw = await res.text();
      const ok = res.ok && raw.trim().startsWith('OK');
      if (!ok) this.logger.warn(`Рекуррент InvId=${opts.invId}: ответ "${raw}"`);
      return { ok, raw };
    } catch (e: any) {
      this.logger.error(`Рекуррент InvId=${opts.invId} ошибка: ${e?.message}`);
      return { ok: false, raw: e?.message ?? 'error' };
    }
  }
}
