import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

// 이메일 인증 / 비밀번호 재설정에 쓰는 일회용 토큰.
export type AuthTokenPurpose = 'email_verification' | 'password_reset';

@Entity('auth_tokens')
export class AuthToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 원문 토큰이 아니라 해시를 저장한다(유출 시 그대로 못 쓰게).
  // 링크 방식 인증/재설정에 쓴다(추측 불가한 긴 랜덤).
  @Index()
  @Column()
  tokenHash: string;

  // 이메일 인증용 6자리 코드의 해시(멀티플랫폼 수동 입력). 링크 전용 토큰은 null.
  @Column({ type: 'varchar', nullable: true })
  codeHash: string | null;

  // 코드 무차별 대입 방지용 시도 횟수. 한도 초과 시 토큰을 무효화한다.
  @Column({ default: 0 })
  attempts: number;

  @Column()
  purpose: AuthTokenPurpose;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @Column()
  expiresAt: Date;

  // 사용된 토큰은 재사용 못 하도록 시각을 기록한다.
  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
