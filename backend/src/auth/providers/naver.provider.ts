import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CodeFlowProvider, SocialProfile } from './social-provider.interface';

const AUTHORIZE_URL = 'https://nid.naver.com/oauth2.0/authorize';
const TOKEN_URL = 'https://nid.naver.com/oauth2.0/token';
const PROFILE_URL = 'https://openapi.naver.com/v1/nid/me';

// 네이버도 카카오와 동일하게 client_secret 필수 + 토큰 엔드포인트 CORS 차단이라
// 프론트가 직접 토큰을 못 받는다 → 백엔드 콜백(코드) 플로우 전용.
// SocialProvider가 아니라 CodeFlowProvider만 구현한다.
@Injectable()
export class NaverProvider implements CodeFlowProvider {
  readonly name = 'naver' as const;

  // 네이버 개발자센터 > 애플리케이션 > 애플리케이션 정보의 Client ID.
  private readonly clientId: string;
  // 네이버 개발자센터 > 애플리케이션 정보의 Client Secret (필수).
  private readonly clientSecret: string;

  constructor(private readonly config: ConfigService) {
    this.clientId = (config.get<string>('NAVER_CLIENT_ID', '') || '').trim();
    this.clientSecret = (
      config.get<string>('NAVER_CLIENT_SECRET', '') || ''
    ).trim();
  }

  getAuthorizeUrl({
    redirectUri,
    state,
  }: {
    redirectUri: string;
    state: string;
  }): string {
    if (!this.clientId) {
      // 설정 누락은 콜백 이전(=start) 단계에서 명확한 500으로 드러내는 게 낫다.
      throw new ServiceUnavailableException({
        code: 'social_not_configured',
        message: 'NAVER_CLIENT_ID가 설정되지 않았습니다.',
      });
    }
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  async exchangeCode({
    code,
    redirectUri,
  }: {
    code: string;
    redirectUri: string;
  }): Promise<SocialProfile> {
    if (!this.clientId) {
      throw new ServiceUnavailableException({
        code: 'social_not_configured',
        message: 'NAVER_CLIENT_ID가 설정되지 않았습니다.',
      });
    }

    // 1) 코드 → 액세스 토큰 (application/x-www-form-urlencoded)
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: redirectUri,
      code,
    });

    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body: tokenBody.toString(),
    });
    if (!tokenRes.ok) {
      throw new UnauthorizedException('네이버 토큰 교환에 실패했습니다.');
    }
    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
    };
    if (tokenJson.error || !tokenJson.access_token) {
      throw new UnauthorizedException('네이버 토큰이 올바르지 않습니다.');
    }
    const accessToken = tokenJson.access_token;

    // 2) 액세스 토큰 → 프로필
    const profileRes = await fetch(PROFILE_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!profileRes.ok) {
      throw new UnauthorizedException('네이버 프로필 조회에 실패했습니다.');
    }
    const me = (await profileRes.json()) as {
      resultcode?: string;
      response?: {
        id?: string;
        email?: string;
        name?: string;
        nickname?: string;
      };
    };

    if (me.resultcode !== '00' || !me.response?.id) {
      throw new UnauthorizedException('네이버 프로필이 올바르지 않습니다.');
    }

    const profile = me.response;
    return {
      providerId: profile.id!,
      email: profile.email,
      // 네이버는 카카오처럼 별도 이메일 검증 플래그를 주지 않는다 — 네이버 계정 자체가
      // 이메일 인증을 거쳐야 발급되므로, 이메일이 내려오면 검증된 것으로 간주한다.
      emailVerified: !!profile.email,
      displayName: profile.name ?? profile.nickname,
    };
  }
}
