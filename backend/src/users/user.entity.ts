import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SocialAccount } from './social-account.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // "이메일 1개 = 계정 1개"의 토대. 소셜이 이메일을 안 주면 null(여러 null 허용).
  @Column({ unique: true, nullable: true })
  email: string;

  // provider가 email_verified로 보증했는지. 추후 이메일 기준 통합의 안전장치.
  @Column({ default: false })
  emailVerified: boolean;

  @Column({ nullable: true })
  displayName: string;

  // 이 유저에게 보낼 메일·페이지 언어 (ko | en | ja). 앱이 보낸 언어로 갱신.
  @Column({ default: 'ko' })
  locale: string;

  // 추후 이메일/비밀번호 가입 대비. 소셜 전용 유저는 null.
  @Column({ nullable: true })
  passwordHash: string;

  @OneToMany(() => SocialAccount, (account) => account.user)
  socialAccounts: SocialAccount[];

  @CreateDateColumn()
  createdAt: Date;
}
