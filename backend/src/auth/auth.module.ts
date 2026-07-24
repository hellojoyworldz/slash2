import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SocialAccount } from '../users/social-account.entity';
import { User } from '../users/user.entity';
import { AuthToken } from './auth-token.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailService } from './mail.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AppleProvider } from './providers/apple.provider';
import { GoogleProvider } from './providers/google.provider';
import { KakaoProvider } from './providers/kakao.provider';
import { NaverProvider } from './providers/naver.provider';
import { SocialProviderRegistry } from './providers/social-provider.registry';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([User, SocialAccount, AuthToken]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET', 'dev-secret'),
        signOptions: { expiresIn: '90d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    MailService,
    JwtAuthGuard,
    GoogleProvider,
    AppleProvider,
    KakaoProvider,
    NaverProvider,
    SocialProviderRegistry,
  ],
  exports: [JwtModule, JwtAuthGuard],
})
export class AuthModule {}
