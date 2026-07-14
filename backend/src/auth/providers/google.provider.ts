import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { SocialProvider, SocialProfile } from './social-provider.interface';

@Injectable()
export class GoogleProvider implements SocialProvider {
  readonly name = 'google' as const;

  private readonly client: OAuth2Client;
  // 허용할 클라이언트 ID 목록 (웹/iOS/안드로이드가 각각 다를 수 있다).
  private readonly audience: string[];

  constructor(config: ConfigService) {
    this.client = new OAuth2Client();
    this.audience = (config.get<string>('GOOGLE_CLIENT_IDS', '') || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }

  async verify(token: string): Promise<SocialProfile> {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken: token,
        // audience가 비어 있으면 검증에서 aud 체크를 생략한다(개발 편의).
        audience: this.audience.length ? this.audience : undefined,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub) {
        throw new UnauthorizedException('구글 토큰이 올바르지 않습니다.');
      }
      return {
        providerId: payload.sub,
        email: payload.email,
        emailVerified: payload.email_verified ?? false,
        displayName: payload.name,
      };
    } catch {
      throw new UnauthorizedException('구글 토큰 검증에 실패했습니다.');
    }
  }
}
