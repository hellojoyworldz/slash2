import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import { tr } from '../i18n/messages';

// 실제 메일 발송 담당. 개발에선 mailpit(가짜 메일함), 배포에선 Resend/SES 등
// SMTP 정보만 .env로 바꿔 끼우면 코드 수정 없이 동작한다.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const user = this.config.get<string>('MAIL_USER') || undefined;
    const pass = this.config.get<string>('MAIL_PASSWORD') || undefined;
    this.transporter = createTransport({
      host: this.config.get<string>('MAIL_HOST', 'localhost'),
      port: this.config.get<number>('MAIL_PORT', 1025),
      secure: this.config.get<string>('MAIL_SECURE') === 'true',
      // 인증 정보가 없으면(개발 mailpit) auth를 생략한다.
      auth: user ? { user, pass } : undefined,
    });
    this.from = this.config.get<string>(
      'MAIL_FROM',
      'slash <no-reply@slash.local>',
    );
  }

  async sendVerification(to: string, link: string, code: string, locale: string) {
    await this.send(
      to,
      tr(locale, 'mail.verifySubject'),
      `<p>${tr(locale, 'mail.verifyIntro')}</p>
       <p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p>
       <p><a href="${link}">${tr(locale, 'mail.verifyLinkText')}</a></p>
       <p>${tr(locale, 'mail.verifyExpire')}</p>`,
    );
  }

  async sendPasswordReset(to: string, link: string, code: string, locale: string) {
    await this.send(
      to,
      tr(locale, 'mail.resetSubject'),
      `<p>${tr(locale, 'mail.resetIntro')}</p>
       <p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p>
       <p><a href="${link}">${tr(locale, 'mail.resetLinkText')}</a></p>
       <p>${tr(locale, 'mail.resetIgnore')}</p>`,
    );
  }

  private async send(to: string, subject: string, html: string) {
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
    } catch (err) {
      // 메일 실패가 회원가입 전체를 막지 않도록 로깅만 하고 삼킨다.
      this.logger.error(`메일 발송 실패 (${to}): ${String(err)}`);
    }
  }
}
