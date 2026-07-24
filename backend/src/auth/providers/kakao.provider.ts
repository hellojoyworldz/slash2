import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CodeFlowProvider, SocialProfile } from './social-provider.interface';

const AUTHORIZE_URL = 'https://kauth.kakao.com/oauth/authorize';
const TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
const PROFILE_URL = 'https://kapi.kakao.com/v2/user/me';

// 카카오는 client_secret 기본 활성 + 토큰 엔드포인트 CORS 차단이라 프론트가 직접 토큰을
// 못 받는다 → 백엔드 콜백(코드) 플로우 전용. verify(id_token) 경로가 없으므로
// SocialProvider가 아니라 CodeFlowProvider만 구현한다.
@Injectable()
export class KakaoProvider implements CodeFlowProvider {
  readonly name = 'kakao' as const;

  // REST API 키(= OAuth client_id). 카카오 콘솔 > 앱 > 앱 키의 REST API 키.
  private readonly clientId: string;
  // 콘솔에서 client_secret을 켰다면 필수(기본 활성). 비워두면 파라미터를 생략한다.
  private readonly clientSecret: string;
  // 동의항목(scope). 콘솔에서 해당 항목을 활성화해 둬야 실제로 내려온다.
  // 미설정 항목을 요청하면 카카오가 에러를 내므로, 콘솔 설정과 맞춰 env로 덮어쓸 수 있게 한다.
  private readonly scope: string;

  constructor(private readonly config: ConfigService) {
    this.clientId = (config.get<string>('KAKAO_CLIENT_ID', '') || '').trim();
    this.clientSecret = (
      config.get<string>('KAKAO_CLIENT_SECRET', '') || ''
    ).trim();
    this.scope = (
      config.get<string>('KAKAO_SCOPE', 'profile_nickname,account_email') || ''
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
        message: 'KAKAO_CLIENT_ID가 설정되지 않았습니다.',
      });
    }
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
    });
    if (this.scope) params.set('scope', this.scope);
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
        message: 'KAKAO_CLIENT_ID가 설정되지 않았습니다.',
      });
    }

    // 1) 코드 → 액세스 토큰 (application/x-www-form-urlencoded)
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      redirect_uri: redirectUri,
      code,
    });
    if (this.clientSecret) tokenBody.set('client_secret', this.clientSecret);

    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body: tokenBody.toString(),
    });
    if (!tokenRes.ok) {
      throw new UnauthorizedException('카카오 토큰 교환에 실패했습니다.');
    }
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    const accessToken = tokenJson.access_token;
    if (!accessToken) {
      throw new UnauthorizedException('카카오 토큰이 올바르지 않습니다.');
    }

    // 2) 액세스 토큰 → 프로필
    const profileRes = await fetch(PROFILE_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!profileRes.ok) {
      throw new UnauthorizedException('카카오 프로필 조회에 실패했습니다.');
    }
    const me = (await profileRes.json()) as {
      id?: number | string;
      kakao_account?: {
        email?: string;
        is_email_valid?: boolean;
        is_email_verified?: boolean;
        profile?: { nickname?: string };
      };
      properties?: { nickname?: string };
    };

    if (me.id === undefined || me.id === null) {
      throw new UnauthorizedException('카카오 프로필이 올바르지 않습니다.');
    }

    const account = me.kakao_account;
    return {
      providerId: String(me.id),
      email: account?.email,
      // 카카오는 유효성(is_email_valid)과 인증(is_email_verified)을 나눠 준다 — 둘 다여야 검증됨.
      emailVerified: !!(account?.is_email_valid && account?.is_email_verified),
      displayName: account?.profile?.nickname ?? me.properties?.nickname,
    };
  }
}
