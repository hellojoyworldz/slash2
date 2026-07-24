import { SocialProviderName } from '../../users/social-account.entity';

// provider가 검증 후 돌려주는 표준 프로필. 모든 provider가 이 형태로 정규화한다.
export interface SocialProfile {
  providerId: string;
  email?: string;
  // provider가 이메일을 검증했는지. 추후 이메일 기준 통합의 안전장치.
  emailVerified?: boolean;
  displayName?: string;
}

// 토큰 방식 provider(구글·애플): 앱이 프론트에서 직접 id_token을 획득해 보낸다.
// 새 토큰 방식 provider는 이 인터페이스만 구현해서 registry.register로 등록하면 된다.
export interface SocialProvider {
  readonly name: SocialProviderName;
  // 앱이 보낸 토큰을 검증하고 표준 프로필로 변환한다.
  verify(token: string): Promise<SocialProfile>;
}

// 코드(Authorization Code) 방식 provider(카카오·네이버): 프론트가 토큰을 직접 못 받는
// (client_secret 필수 + 토큰 엔드포인트 CORS 차단) 경우, 백엔드 콜백 플로우로 처리한다.
// 흐름: /start → getAuthorizeUrl로 302 → provider 콜백 → exchangeCode(코드→토큰→프로필).
// 새 코드 방식 provider(네이버 등)는 이 인터페이스만 구현해 registry.registerCodeFlow로 등록.
export interface CodeFlowProvider {
  readonly name: SocialProviderName;
  // provider의 authorize 엔드포인트로 보낼 URL을 만든다(redirect_uri·state 포함).
  // client_id 등 필수 설정이 없으면 명확한 에러를 던진다.
  getAuthorizeUrl(params: { redirectUri: string; state: string }): string;
  // 콜백에서 받은 code를 토큰으로 교환하고 프로필까지 조회해 표준 프로필로 변환한다.
  // redirectUri는 authorize 때와 반드시 동일해야 한다(provider 검증 규칙).
  exchangeCode(params: {
    code: string;
    redirectUri: string;
  }): Promise<SocialProfile>;
}
