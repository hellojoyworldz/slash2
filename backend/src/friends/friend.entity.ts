import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

// "친구" = 링크를 분류하는 카테고리. UI에서는 친구처럼 보여준다.
@Entity('friends')
@Index(['userId', 'name'], { unique: true })
export class Friend {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 30 })
  name: string;

  // 채팅 목록 상단 고정 여부
  @Column({ default: false })
  pinned: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
