import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomInt } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { isValidAutoFavorites, isValidAutoOrder } from '../users/auto-order';
import { isValidHiddenTabs, isValidTabOrder } from '../users/tab-order';
import { SocialAccount } from '../users/social-account.entity';
import { User } from '../users/user.entity';
import { AuthToken, AuthTokenPurpose } from './auth-token.entity';
import { MailService } from './mail.service';
import { SocialProviderRegistry } from './providers/social-provider.registry';

export interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(SocialAccount)
    private readonly socialAccounts: Repository<SocialAccount>,
    @InjectRepository(AuthToken)
    private readonly tokens: Repository<AuthToken>,
    private readonly jwt: JwtService,
    private readonly providers: SocialProviderRegistry,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  // ── 이메일 우선(identifier-first) 조회 ──────────────────────────

  // 이메일만 받아 다음 단계를 알려준다: 신규 가입 / 비번 로그인 / 소셜 안내.
  // 주의: 계정 존재 여부가 노출되므로(열거) 운영에선 rate limit 권장.
  async lookupEmail(
    rawEmail: string,
  ): Promise<{ status: 'new' | 'password' | 'social'; providers?: string[] }> {
    const email = rawEmail.trim().toLowerCase();
    const user = await this.users.findOne({
      where: { email },
      relations: { socialAccounts: true },
    });
    if (!user) return { status: 'new' };
    if (user.passwordHash) return { status: 'password' };
    return {
      status: 'social',
      providers: (user.socialAccounts ?? []).map((a) => a.provider),
    };
  }

  // ── 이메일/비밀번호 ─────────────────────────────────────────────

  async register(email: string, password: string, locale = 'ko') {
    email = email.trim().toLowerCase();
    const existing = await this.users.findOne({ where: { email } });
    if (existing) {
      // 프론트가 언어별로 번역하도록 code를 함께 보낸다. message는 폴백/비앱 소비자용.
      if (!existing.passwordHash) {
        throw new ConflictException({
          code: 'email_taken_social',
          message:
            '이미 소셜 로그인으로 가입된 이메일입니다. 소셜 로그인으로 이용해주세요.',
        });
      }
      throw new ConflictException({
        code: 'email_taken',
        message: '이미 가입된 이메일입니다.',
      });
    }

    const user = this.users.create({
      email,
      passwordHash: await bcrypt.hash(password, 10),
      emailVerified: false,
      locale,
    });
    await this.users.save(user);

    await this.sendVerificationEmail(user);
    return this.issueToken(user);
  }

  async login(email: string, password: string) {
    email = email.trim().toLowerCase();
    const user = await this.users.findOne({ where: { email } });
    if (user && !user.passwordHash) {
      throw new UnauthorizedException({
        code: 'social_only_account',
        message: '이 이메일은 소셜 로그인으로 가입되어 있습니다.',
      });
    }
    // 존재 여부를 숨기려 없는 계정/틀린 비번을 같은 code로 응답한다.
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException({
        code: 'invalid_credentials',
        message: '이메일 또는 비밀번호가 올바르지 않습니다.',
      });
    }
    return this.issueToken(user);
  }

  // 현재 로그인한 유저의 최신 프로필(인증 상태 + 연결된 소셜 provider 목록)을 돌려준다.
  async getProfile(userId: string) {
    const user = await this.users.findOne({
      where: { id: userId },
      relations: { socialAccounts: true },
    });
    if (!user) {
      throw new UnauthorizedException(
        '세션이 만료되었습니다. 다시 로그인해주세요.',
      );
    }
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      emailVerified: user.emailVerified,
      selfColor: user.selfColor ?? null,
      selfDescription: user.selfDescription ?? null,
      tagAllColor: user.tagAllColor ?? null,
      tagAllDescription: user.tagAllDescription ?? null,
      customColors: user.customColors ?? [],
      autoOrder: user.autoOrder ?? null,
      autoFavorites: user.autoFavorites ?? null,
      tabOrder: user.tabOrder ?? null,
      hiddenTabs: user.hiddenTabs ?? null,
      providers: (user.socialAccounts ?? []).map((a) => a.provider),
    };
  }

  // 프로필 부분 갱신: 표시 이름 / "전체" 방 프로필 색·설명 / 커스텀 프로필 색 목록 / 자동구분 순서. 보낸 필드만 반영한다.
  async updateProfile(
    userId: string,
    changes: {
      displayName?: string;
      selfColor?: string;
      selfDescription?: string;
      tagAllColor?: string;
      tagAllDescription?: string;
      customColors?: string[];
      autoOrder?: string[];
      autoFavorites?: string[];
      tabOrder?: string[];
      hiddenTabs?: string[];
    },
  ) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException(
        '세션이 만료되었습니다. 다시 로그인해주세요.',
      );
    }
    if (changes.displayName !== undefined) {
      user.displayName = changes.displayName.trim();
    }
    if (changes.selfColor !== undefined) {
      user.selfColor = changes.selfColor;
    }
    if (changes.selfDescription !== undefined) {
      // 빈 문자열은 저장하지 않고 null로 통일 — friends.description과 같은 관례.
      const trimmed = changes.selfDescription.trim();
      user.selfDescription = trimmed || null;
    }
    if (changes.tagAllColor !== undefined) {
      user.tagAllColor = changes.tagAllColor;
    }
    if (changes.tagAllDescription !== undefined) {
      // selfDescription과 같은 관례 — 빈 문자열은 null로 통일.
      const trimmed = changes.tagAllDescription.trim();
      user.tagAllDescription = trimmed || null;
    }
    if (changes.customColors !== undefined) {
      // 빈 배열은 null로 저장 — simple-array가 빈 문자열을 ['']로 되읽는 문제 회피.
      user.customColors = changes.customColors.length
        ? changes.customColors
        : null;
    }
    if (changes.autoOrder !== undefined) {
      if (!isValidAutoOrder(changes.autoOrder)) {
        throw new BadRequestException({
          code: 'invalid_auto_order',
          message: '자동구분 순서가 올바르지 않습니다.',
        });
      }
      user.autoOrder = changes.autoOrder;
    }
    if (changes.autoFavorites !== undefined) {
      if (!isValidAutoFavorites(changes.autoFavorites)) {
        throw new BadRequestException({
          code: 'invalid_order',
          message: '자동구분 즐겨찾기가 올바르지 않습니다.',
        });
      }
      user.autoFavorites = changes.autoFavorites.length
        ? changes.autoFavorites
        : null;
    }
    if (changes.tabOrder !== undefined) {
      if (!isValidTabOrder(changes.tabOrder)) {
        throw new BadRequestException({
          code: 'invalid_order',
          message: '메뉴 순서가 올바르지 않습니다.',
        });
      }
      user.tabOrder = changes.tabOrder;
    }
    if (changes.hiddenTabs !== undefined) {
      if (!isValidHiddenTabs(changes.hiddenTabs)) {
        throw new BadRequestException({
          code: 'invalid_order',
          message: '메뉴 노출 설정이 올바르지 않습니다.',
        });
      }
      // 빈 배열은 null로 저장 — simple-array가 빈 문자열을 ['']로 되읽는 문제 회피.
      user.hiddenTabs = changes.hiddenTabs.length ? changes.hiddenTabs : null;
    }
    await this.users.save(user);
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      emailVerified: user.emailVerified,
      selfColor: user.selfColor ?? null,
      selfDescription: user.selfDescription ?? null,
      tagAllColor: user.tagAllColor ?? null,
      tagAllDescription: user.tagAllDescription ?? null,
      customColors: user.customColors ?? [],
      autoOrder: user.autoOrder ?? null,
      autoFavorites: user.autoFavorites ?? null,
      tabOrder: user.tabOrder ?? null,
      hiddenTabs: user.hiddenTabs ?? null,
    };
  }

  // ── 이메일 인증 ─────────────────────────────────────────────────

  // 링크 방식: 메일의 토큰으로 인증.
  async verifyEmail(rawToken: string): Promise<boolean> {
    const record = await this.consumeToken(rawToken, 'email_verification');
    if (!record) return false;
    record.user.emailVerified = true;
    await this.users.save(record.user);
    return true;
  }

  // 코드 방식(멀티플랫폼): 로그인한 유저가 6자리 코드를 입력해 인증.
  async verifyEmailByCode(userId: string, code: string): Promise<boolean> {
    const record = await this.tokens.findOne({
      where: {
        user: { id: userId },
        purpose: 'email_verification',
        usedAt: IsNull(),
      },
      relations: { user: true },
      order: { createdAt: 'DESC' },
    });
    if (
      !record ||
      !record.codeHash ||
      record.expiresAt.getTime() < Date.now()
    ) {
      return false;
    }
    // 시도 한도 초과 → 토큰 무효화(재발송 유도).
    if (record.attempts >= AuthService.MAX_CODE_ATTEMPTS) {
      record.usedAt = new Date();
      await this.tokens.save(record);
      return false;
    }
    record.attempts += 1;
    if (this.hash(code) !== record.codeHash) {
      await this.tokens.save(record); // 시도 횟수만 반영
      return false;
    }
    record.usedAt = new Date();
    await this.tokens.save(record);
    record.user.emailVerified = true;
    await this.users.save(record.user);
    return true;
  }

  // 인증 메일 다시 보내기. 이미 인증됐거나 이메일이 없으면 조용히 통과.
  // 60초 이내 재요청은 스팸 방지로 실제 발송을 건너뛴다.
  async resendVerification(
    userId: string,
    locale?: string,
  ): Promise<{ ok: true }> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || user.emailVerified || !user.email) return { ok: true };
    if (locale && user.locale !== locale) {
      user.locale = locale;
      await this.users.save(user);
    }
    const recent = await this.tokens.findOne({
      where: { user: { id: userId }, purpose: 'email_verification' },
      order: { createdAt: 'DESC' },
    });
    if (recent && Date.now() - recent.createdAt.getTime() < 60_000) {
      return { ok: true };
    }
    await this.sendVerificationEmail(user);
    return { ok: true };
  }

  // ── 비밀번호 재설정 ─────────────────────────────────────────────

  // 존재 여부를 노출하지 않도록 항상 조용히 성공한다.
  async requestPasswordReset(email: string, locale?: string) {
    email = email.trim().toLowerCase();
    const user = await this.users.findOne({ where: { email } });
    if (user && user.passwordHash) {
      if (locale && user.locale !== locale) {
        user.locale = locale;
        await this.users.save(user);
      }
      // 링크(긴 랜덤) + 코드(6자리) 둘 다 발급. 1시간 만료.
      const { token, code } = await this.createToken(
        user,
        'password_reset',
        60,
        true,
      );
      const lang = user.locale || 'ko';
      const link = `${this.baseUrl()}/api/auth/reset-password?token=${token}&lang=${lang}`;
      await this.mail.sendPasswordReset(user.email, link, code!, lang);
    }
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<boolean> {
    const record = await this.consumeToken(rawToken, 'password_reset');
    if (!record) return false;
    record.user.passwordHash = await bcrypt.hash(newPassword, 10);
    // 비번 재설정 링크를 열었다는 건 이메일 소유를 증명한 것이므로 인증 처리.
    record.user.emailVerified = true;
    await this.users.save(record.user);
    return true;
  }

  // 코드 방식(멀티플랫폼): 앱 안에서 이메일+6자리 코드+새 비번으로 재설정.
  async resetPasswordByCode(
    email: string,
    code: string,
    newPassword: string,
  ): Promise<boolean> {
    email = email.trim().toLowerCase();
    const user = await this.users.findOne({ where: { email } });
    if (!user || !user.passwordHash) return false;
    const record = await this.tokens.findOne({
      where: {
        user: { id: user.id },
        purpose: 'password_reset',
        usedAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
    });
    if (!record || !record.codeHash || record.expiresAt.getTime() < Date.now()) {
      return false;
    }
    // 시도 한도 초과 → 토큰 무효화(재요청 유도).
    if (record.attempts >= AuthService.MAX_CODE_ATTEMPTS) {
      record.usedAt = new Date();
      await this.tokens.save(record);
      return false;
    }
    record.attempts += 1;
    if (this.hash(code) !== record.codeHash) {
      await this.tokens.save(record); // 시도 횟수만 반영
      return false;
    }
    record.usedAt = new Date();
    await this.tokens.save(record);
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    // 코드 입력 = 이메일 소유 증명이므로 인증 처리.
    user.emailVerified = true;
    await this.users.save(user);
    return true;
  }

  // ── 소셜 로그인 (B: 검증된 이메일 기준 통합) ────────────────────

  async socialLogin(providerName: string, token: string) {
    const provider = this.providers.get(providerName);
    const profile = await provider.verify(token);

    const existing = await this.socialAccounts.findOne({
      where: { provider: provider.name, providerId: profile.providerId },
      relations: { user: true },
    });
    if (existing) {
      // provider가 이메일을 검증했는데 우리 기록이 아직이면 갱신(과거 데이터 보정).
      if (profile.emailVerified && !existing.user.emailVerified) {
        existing.user.emailVerified = true;
        await this.users.save(existing.user);
      }
      return this.issueToken(existing.user);
    }

    let user: User | null = null;

    if (profile.email) {
      const email = profile.email.trim().toLowerCase();
      const owner = await this.users.findOne({ where: { email } });
      if (owner) {
        if (profile.emailVerified) {
          // 검증된 같은 이메일 → 같은 계정으로 통합(소셜 계정만 연결).
          if (!owner.emailVerified) {
            owner.emailVerified = true;
            await this.users.save(owner);
          }
          user = owner;
        } else {
          // 미검증이면 남의 이메일을 가로챌 수 없으므로 이메일 없이 새 계정.
          user = this.users.create({
            displayName: profile.displayName,
            emailVerified: false,
          });
          await this.users.save(user);
        }
      }
    }

    if (!user) {
      user = this.users.create({
        email: profile.email?.trim().toLowerCase(),
        displayName: profile.displayName,
        emailVerified: profile.emailVerified ?? false,
      });
      await this.users.save(user);
    }

    const account = this.socialAccounts.create({
      provider: provider.name,
      providerId: profile.providerId,
      user,
    });
    await this.socialAccounts.save(account);

    return this.issueToken(user);
  }

  // ── 내부 헬퍼 ───────────────────────────────────────────────────

  // 인증 코드 5회 오입력 시 토큰 무효화(무차별 대입 방지).
  private static readonly MAX_CODE_ATTEMPTS = 5;

  private async sendVerificationEmail(user: User) {
    // 링크(긴 랜덤) + 코드(6자리) 둘 다 발급. 30분 만료.
    const { token, code } = await this.createToken(
      user,
      'email_verification',
      30,
      true,
    );
    const lang = user.locale || 'ko';
    const link = `${this.baseUrl()}/api/auth/verify-email?token=${token}&lang=${lang}`;
    await this.mail.sendVerification(user.email, link, code!, lang);
  }

  // 원문 토큰을 만들고 해시만 저장한다. 만료는 분 단위.
  // withCode면 6자리 코드도 함께 생성해 해시로 저장하고 원문 코드를 돌려준다.
  private async createToken(
    user: User,
    purpose: AuthTokenPurpose,
    ttlMinutes: number,
    withCode = false,
  ): Promise<{ token: string; code?: string }> {
    const raw = randomBytes(32).toString('hex');
    const code = withCode
      ? randomInt(0, 1_000_000).toString().padStart(6, '0')
      : undefined;
    const now = Date.now();
    await this.tokens.save(
      this.tokens.create({
        tokenHash: this.hash(raw),
        codeHash: code ? this.hash(code) : null,
        attempts: 0,
        purpose,
        user,
        expiresAt: new Date(now + ttlMinutes * 60 * 1000),
        usedAt: null,
      }),
    );
    return { token: raw, code };
  }

  // 토큰을 검증하고 사용 처리한다. 유효하지 않으면 null.
  private async consumeToken(
    rawToken: string,
    purpose: AuthTokenPurpose,
  ): Promise<AuthToken | null> {
    if (!rawToken) return null;
    const record = await this.tokens.findOne({
      where: { tokenHash: this.hash(rawToken), purpose },
      relations: { user: true },
    });
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      return null;
    }
    record.usedAt = new Date();
    await this.tokens.save(record);
    return record;
  }

  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private baseUrl(): string {
    return this.config.get<string>('APP_BASE_URL', 'http://localhost:4000');
  }

  private async issueToken(user: User) {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    // 로그인 직후에도 연결된 소셜 provider를 앱에 내려준다(더보기 화면 배지 등).
    const accounts = await this.socialAccounts.find({
      where: { user: { id: user.id } },
    });
    return {
      token: this.jwt.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        emailVerified: user.emailVerified,
        selfColor: user.selfColor ?? null,
        selfDescription: user.selfDescription ?? null,
        customColors: user.customColors ?? [],
        autoOrder: user.autoOrder ?? null,
        autoFavorites: user.autoFavorites ?? null,
        tabOrder: user.tabOrder ?? null,
        hiddenTabs: user.hiddenTabs ?? null,
        providers: accounts.map((a) => a.provider),
      },
    };
  }
}
