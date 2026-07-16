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

  // "전체"(자기 자신) 방의 프로필 색(hex). null이면 프론트가 기본 검정(SELF_DEFAULT_COLOR)으로 표시.
  // 미분류 메시지 말풍선 색의 원천이기도 하다. (nullable union이라 타입 명시 — 백엔드 규칙)
  @Column({ type: 'varchar', length: 9, nullable: true })
  selfColor: string | null;

  // 사용자가 직접선택 피커로 저장해 둔 "커스텀 프로필" 색 목록(hex). 편집기 스와치 그리드에
  // 기본 프리셋 다음에 나열된다. null/빈 = 없음. (콤마 join되는 simple-array — hex엔 콤마 없음)
  @Column({ type: 'simple-array', nullable: true })
  customColors: string[] | null;

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
