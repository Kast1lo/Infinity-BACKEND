import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host:   this.config.getOrThrow('MAIL_HOST'),
      port:   Number(this.config.get('MAIL_PORT') ?? 587),
      secure: this.config.get('MAIL_SECURE') === 'true',
      auth: {
        user: this.config.getOrThrow('MAIL_USER'),
        pass: this.config.getOrThrow('MAIL_PASS'),
      },
    });
  }

  async sendVerificationCode(to: string, code: string): Promise<void> {
    const from = `"Infinity" <${this.config.get('MAIL_FROM') ?? this.config.get('MAIL_USER')}>`;

    await this.transporter.sendMail({
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

    this.logger.log(`Verification code sent to ${to}`);
  }
}