import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private resend: Resend;

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(this.config.getOrThrow('RESEND_API_KEY'));
  }

  async sendVerificationCode(to: string, code: string): Promise<void> {
    const from = this.config.get('MAIL_FROM') ?? 'Infinity <noreply@infinity-vault.com>';

    const { data, error } = await this.resend.emails.send({
      from,
      to,
      subject: 'Подтверждение email — Infinity',
      html: `
        <div style="
          font-family: 'DM Sans', Arial, sans-serif;
          max-width: 480px;
          margin: 0 auto;
          background: #111111;
          border: 1px solid #222222;
          border-radius: 16px;
          overflow: hidden;
        ">
          <div style="padding: 32px 36px 24px;">
            <h1 style="
              font-size: 22px;
              font-weight: 700;
              color: #f0f0f0;
              margin: 0 0 8px;
              letter-spacing: -0.5px;
            ">Подтвердите email</h1>
            <p style="
              font-size: 14px;
              color: #888888;
              margin: 0 0 32px;
              line-height: 1.6;
            ">
              Введите этот код на странице регистрации.<br>
              Код действителен <strong style="color: #f0f0f0;">15 минут</strong>.
            </p>

            <div style="
              background: #1a1a1a;
              border: 1px solid #2e2e2e;
              border-radius: 12px;
              padding: 24px;
              text-align: center;
              letter-spacing: 10px;
              font-size: 36px;
              font-weight: 700;
              color: #f0f0f0;
              font-family: monospace;
            ">${code}</div>

            <p style="
              font-size: 12px;
              color: #444444;
              margin: 24px 0 0;
              line-height: 1.5;
            ">
              Если вы не регистрировались в Infinity — просто проигнорируйте это письмо.
            </p>
          </div>
          <div style="
            border-top: 1px solid #222222;
            padding: 16px 36px;
            font-size: 12px;
            color: #444444;
          ">
            © ${new Date().getFullYear()} Infinity
          </div>
        </div>
      `,
    });

    if (error) {
      this.logger.error(`Resend error (verification) → ${to}: ${JSON.stringify(error)}`);
      throw new ServiceUnavailableException('Не удалось отправить письмо. Попробуйте позже.');
    }
    this.logger.log(`Verification code sent to ${to} (id=${data?.id})`);
  }

  async sendEmailChangeCode(to: string, code: string): Promise<void> {
    const from = this.config.get('MAIL_FROM') ?? 'Infinity <noreply@infinity-vault.com>';

    const { data, error } = await this.resend.emails.send({
      from,
      to,
      subject: 'Смена email — Infinity',
      html: `
        <div style="
          font-family: 'DM Sans', Arial, sans-serif;
          max-width: 480px;
          margin: 0 auto;
          background: #111111;
          border: 1px solid #222222;
          border-radius: 16px;
          overflow: hidden;
        ">
          <div style="padding: 32px 36px 24px;">
            <h1 style="
              font-size: 22px;
              font-weight: 700;
              color: #f0f0f0;
              margin: 0 0 8px;
              letter-spacing: -0.5px;
            ">Подтвердите новый email</h1>
            <p style="
              font-size: 14px;
              color: #888888;
              margin: 0 0 32px;
              line-height: 1.6;
            ">
              Введите этот код, чтобы привязать этот адрес к вашему аккаунту.<br>
              Код действителен <strong style="color: #f0f0f0;">15 минут</strong>.
            </p>

            <div style="
              background: #1a1a1a;
              border: 1px solid #2e2e2e;
              border-radius: 12px;
              padding: 24px;
              text-align: center;
              letter-spacing: 10px;
              font-size: 36px;
              font-weight: 700;
              color: #f0f0f0;
              font-family: monospace;
            ">${code}</div>

            <p style="
              font-size: 12px;
              color: #444444;
              margin: 24px 0 0;
              line-height: 1.5;
            ">
              Если вы не запрашивали смену email — просто проигнорируйте это письмо.
            </p>
          </div>
          <div style="
            border-top: 1px solid #222222;
            padding: 16px 36px;
            font-size: 12px;
            color: #444444;
          ">
            © ${new Date().getFullYear()} Infinity
          </div>
        </div>
      `,
    });

    if (error) {
      this.logger.error(`Resend error (email-change) → ${to}: ${JSON.stringify(error)}`);
      throw new ServiceUnavailableException('Не удалось отправить письмо. Попробуйте позже.');
    }
    this.logger.log(`Email-change code sent to ${to} (id=${data?.id})`);
  }

  async sendResetCode(to: string, code: string): Promise<void> {
    const from = this.config.get('MAIL_FROM') ?? 'Infinity <noreply@infinity-vault.com>';

    const { data, error } = await this.resend.emails.send({
      from,
      to,
      subject: 'Сброс пароля — Infinity',
      html: `
        <div style="
          font-family: 'DM Sans', Arial, sans-serif;
          max-width: 480px;
          margin: 0 auto;
          background: #111111;
          border: 1px solid #222222;
          border-radius: 16px;
          overflow: hidden;
        ">
          <div style="padding: 32px 36px 24px;">
            <h1 style="
              font-size: 22px;
              font-weight: 700;
              color: #f0f0f0;
              margin: 0 0 8px;
              letter-spacing: -0.5px;
            ">Сброс пароля</h1>
            <p style="
              font-size: 14px;
              color: #888888;
              margin: 0 0 32px;
              line-height: 1.6;
            ">
              Введите этот код, чтобы задать новый пароль.<br>
              Код действителен <strong style="color: #f0f0f0;">15 минут</strong>.
            </p>

            <div style="
              background: #1a1a1a;
              border: 1px solid #2e2e2e;
              border-radius: 12px;
              padding: 24px;
              text-align: center;
              letter-spacing: 10px;
              font-size: 36px;
              font-weight: 700;
              color: #f0f0f0;
              font-family: monospace;
            ">${code}</div>

            <p style="
              font-size: 12px;
              color: #444444;
              margin: 24px 0 0;
              line-height: 1.5;
            ">
              Если вы не запрашивали сброс пароля — просто проигнорируйте это письмо, ваш пароль останется прежним.
            </p>
          </div>
          <div style="
            border-top: 1px solid #222222;
            padding: 16px 36px;
            font-size: 12px;
            color: #444444;
          ">
            © ${new Date().getFullYear()} Infinity
          </div>
        </div>
      `,
    });

    if (error) {
      this.logger.error(`Resend error (reset) → ${to}: ${JSON.stringify(error)}`);
      throw new ServiceUnavailableException('Не удалось отправить письмо. Попробуйте позже.');
    }
    this.logger.log(`Reset code sent to ${to} (id=${data?.id})`);
  }
}
