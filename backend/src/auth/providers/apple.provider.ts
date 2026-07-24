import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { SocialProvider, SocialProfile } from './social-provider.interface';

const APPLE_ISSUER = 'https://appleid.apple.com';

@Injectable()
export class AppleProvider implements SocialProvider {
  readonly name = 'apple' as const;

  private readonly jwks = createRemoteJWKSet(
    new URL('https://appleid.apple.com/auth/keys'),
  );
  // 허용할 클라이언트 ID(번들 ID) 목록 (iOS/Expo Go 등이 다를 수 있다).
  private readonly audience: string[];

  constructor(config: ConfigService) {
    this.audience = (config.get<string>('APPLE_CLIENT_IDS', '') || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }

  async verify(token: string): Promise<SocialProfile> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: APPLE_ISSUER,
        // audience가 비어 있으면 검증에서 aud 체크를 생략한다(개발 편의).
        audience: this.audience.length ? this.audience : undefined,
      });
      if (!payload.sub) {
        throw new UnauthorizedException('애플 토큰이 올바르지 않습니다.');
      }
      return {
        providerId: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : undefined,
        // 애플은 email_verified를 boolean이 아닌 문자열 'true'로 줄 때가 있다.
        emailVerified:
          payload.email_verified === true || payload.email_verified === 'true',
        // identity token에는 이름이 없다(최초 인증 1회만 별도로 내려온다).
        displayName: undefined,
      };
    } catch {
      throw new UnauthorizedException('애플 토큰 검증에 실패했습니다.');
    }
  }
}
