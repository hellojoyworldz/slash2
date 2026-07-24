import { BadRequestException, Injectable } from '@nestjs/common';
import { SocialProviderName } from '../../users/social-account.entity';
import { AppleProvider } from './apple.provider';
import { GoogleProvider } from './google.provider';
import { KakaoProvider } from './kakao.provider';
import { NaverProvider } from './naver.provider';
import {
  CodeFlowProvider,
  SocialProvider,
} from './social-provider.interface';

@Injectable()
export class SocialProviderRegistry {
  // 토큰 방식(구글·애플): 프론트가 id_token을 직접 획득해 보낸다.
  private readonly providers = new Map<SocialProviderName, SocialProvider>();
  // 코드 방식(카카오·네이버): 백엔드 콜백 플로우로 코드를 토큰·프로필로 교환한다.
  private readonly codeFlow = new Map<SocialProviderName, CodeFlowProvider>();

  // 새 provider는 여기에 주입받아 방식에 맞는 register만 하면 된다.
  // (네이버도 카카오처럼 registerCodeFlow 한 줄로 붙는다.)
  constructor(
    google: GoogleProvider,
    apple: AppleProvider,
    kakao: KakaoProvider,
    naver: NaverProvider,
  ) {
    this.register(google);
    this.register(apple);
    this.registerCodeFlow(kakao);
    this.registerCodeFlow(naver);
  }

  private register(provider: SocialProvider) {
    this.providers.set(provider.name, provider);
  }

  private registerCodeFlow(provider: CodeFlowProvider) {
    this.codeFlow.set(provider.name, provider);
  }

  // 토큰 방식 provider 조회 (POST /auth/social/:provider).
  get(name: string): SocialProvider {
    const provider = this.providers.get(name as SocialProviderName);
    if (!provider) {
      throw new BadRequestException(`지원하지 않는 provider입니다: ${name}`);
    }
    return provider;
  }

  // 코드 방식 provider 조회 (GET /auth/social/:provider/start·/callback).
  getCodeFlow(name: string): CodeFlowProvider {
    const provider = this.codeFlow.get(name as SocialProviderName);
    if (!provider) {
      throw new BadRequestException(`지원하지 않는 provider입니다: ${name}`);
    }
    return provider;
  }
}
