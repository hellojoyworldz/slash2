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

  // 상태메시지 (카톡 프로필 상태메시지처럼). 빈 문자열은 저장하지 않고 null로 통일.
  @Column({ type: 'varchar', length: 80, nullable: true })
  description: string | null;

  // 채팅 목록 상단 고정 여부
  @Column({ default: false })
  pinned: boolean;

  // 즐겨찾기 표시 여부. pinned(채팅 목록 정렬)와는 무관한 별개 필드 — 정렬에 영향 없이 표시용으로만 쓴다.
  @Column({ default: false })
  favorite: boolean;

  // 분류 탭의 수동 정렬 순서 (작을수록 위). 기존 행은 default 0 → 이름순으로 유지되는 자연 마이그레이션.
  // 채팅 목록 방 정렬(고정→최신순)과는 무관 — 이 순서는 분류 탭 전용이다.
  @Column({ type: 'int', default: 0 })
  position: number;

  // 즐겨찾기 목록 전용 독립 순서 (작을수록 위). favorite=false면 null.
  // position(분류 탭 순서)과 무관하게 즐겨찾기 목록에서만 쓰는 별도 순서.
  @Column({ type: 'int', nullable: true })
  favoritePosition: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
