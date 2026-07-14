import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { FriendsModule } from './friends/friends.module';
import { MessagesModule } from './messages/messages.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // .env는 레포 루트에서 관리한다. (backend 폴더 실행 기준의 폴백도 유지)
      envFilePath: [
        join(__dirname, '../../.env'),
        join(__dirname, '../.env'),
        '.env',
      ],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DATABASE_HOST', 'localhost'),
        port: config.get<number>('DATABASE_PORT', 5432),
        username: config.get('DATABASE_USER', 'app'),
        password: config.get('DATABASE_PASSWORD', 'app'),
        database: config.get('DATABASE_NAME', 'app'),
        autoLoadEntities: true,
        // 개발 편의용. 운영에서는 false로 두고 마이그레이션을 사용할 것.
        synchronize: config.get('NODE_ENV') !== 'production',
      }),
    }),
    AuthModule,
    FriendsModule,
    MessagesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
