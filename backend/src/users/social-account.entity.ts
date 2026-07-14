import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

// SNS provider 종류. 새 provider 추가는 여기에 문자열만 추가하면 된다.
export type SocialProviderName = 'google' | 'kakao' | 'naver' | 'apple';

@Entity('social_accounts')
// 같은 provider 안에서 providerId는 유일해야 한다. (구글 sub 등)
@Index(['provider', 'providerId'], { unique: true })
export class SocialAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  provider: SocialProviderName;

  // provider가 발급하는 고유 식별자 (구글의 sub, 카카오 id 등)
  @Column()
  providerId: string;

  @ManyToOne(() => User, (user) => user.socialAccounts, { onDelete: 'CASCADE' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
