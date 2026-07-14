import { SocialProviderName } from '../../users/social-account.entity';

// provider가 검증 후 돌려주는 표준 프로필. 모든 provider가 이 형태로 정규화한다.
export interface SocialProfile {
  providerId: string;
  email?: string;
  // provider가 이메일을 검증했는지. 추후 이메일 기준 통합의 안전장치.
  emailVerified?: boolean;
  displayName?: string;
}

// 새 SNS provider는 이 인터페이스만 구현해서 registry에 등록하면 된다.
export interface SocialProvider {
  readonly name: SocialProviderName;
  // 앱이 보낸 토큰을 검증하고 표준 프로필로 변환한다.
  verify(token: string): Promise<SocialProfile>;
}
