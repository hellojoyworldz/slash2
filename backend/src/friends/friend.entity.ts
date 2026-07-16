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

  // 표시용 배경색 (hex, 예: #2563EB). 아바타 배경과 이 분류 말풍선 색의 원천.
  // null이면 프론트에서 기본 표면색으로 폴백(기존 데이터).
  @Column({ type: 'varchar', length: 9, nullable: true })
  color: string | null;

  // 채팅 목록 상단 고정 여부
  @Column({ default: false })
  pinned: boolean;

  // 분류 탭의 수동 정렬 순서 (작을수록 위). 기존 행은 default 0 → 이름순으로 유지되는 자연 마이그레이션.
  // 채팅 목록 방 정렬(고정→최신순)과는 무관 — 이 순서는 분류 탭 전용이다.
  @Column({ type: 'int', default: 0 })
  position: number;

  @CreateDateColumn()
  createdAt: Date;
}
