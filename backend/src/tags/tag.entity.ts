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

// 메시지에 붙이는 태그(라벨). 유저당 이름 유니크. 메시지와는 M:N(message_tags).
@Entity('tags')
@Index(['userId', 'name'], { unique: true })
export class Tag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // 계약상 길이 제한 없음(프론트가 트림·빈이름만 검증). PG varchar = 가변 길이.
  @Column({ type: 'varchar' })
  name: string;

  // 태그 프로필 색 (hex, 예: #2563EB). # 타일 배경의 원천. friends.color와 같은 관례.
  // null이면 프론트에서 기본 표면색으로 폴백(기존 데이터). 말풍선 색은 분류가 소유 — 태그는 자기 타일만 칠한다.
  @Column({ type: 'varchar', length: 9, nullable: true })
  color: string | null;

  // 태그 목록 상단 고정 여부. friends.pinned와 같은 관례.
  @Column({ default: false })
  pinned: boolean;

  // 상태메시지 (카톡 프로필 상태메시지처럼). 빈 문자열은 저장하지 않고 null로 통일.
  @Column({ type: 'varchar', length: 80, nullable: true })
  description: string | null;

  // 즐겨찾기 표시 여부. pinned(태그 목록 정렬)와는 무관한 별개 필드 — 정렬에 영향 없이 표시용으로만 쓴다.
  @Column({ default: false })
  favorite: boolean;

  // 태그 목록의 수동 정렬 순서 (작을수록 위). 새 태그는 맨 아래(최대+1).
  @Column({ type: 'int', default: 0 })
  position: number;

  // 즐겨찾기 목록 전용 독립 순서 (작을수록 위). favorite=false면 null.
  // position(태그 목록 순서)과 무관하게 즐겨찾기 목록에서만 쓰는 별도 순서.
  @Column({ type: 'int', nullable: true })
  favoritePosition: number | null;

  @CreateDateColumn()
  createdAt: Date;
}
