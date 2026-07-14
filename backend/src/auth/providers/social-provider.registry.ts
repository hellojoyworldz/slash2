import { BadRequestException, Injectable } from '@nestjs/common';
import { SocialProviderName } from '../../users/social-account.entity';
import { GoogleProvider } from './google.provider';
import { SocialProvider } from './social-provider.interface';

@Injectable()
export class SocialProviderRegistry {
  private readonly providers = new Map<SocialProviderName, SocialProvider>();

  // 새 provider(Kakao 등)는 여기에 주입받아 register만 하면 된다.
  constructor(google: GoogleProvider) {
    this.register(google);
  }

  private register(provider: SocialProvider) {
    this.providers.set(provider.name, provider);
  }

  get(name: string): SocialProvider {
    const provider = this.providers.get(name as SocialProviderName);
    if (!provider) {
      throw new BadRequestException(`지원하지 않는 provider입니다: ${name}`);
    }
    return provider;
  }
}
