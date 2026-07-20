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

  // 태그 목록 상단 고정 여부. friends.pinned와 같은 관례.
  @Column({ default: false })
  pinned: boolean;

  // 태그 목록의 수동 정렬 순서 (작을수록 위). 새 태그는 맨 아래(최대+1).
  @Column({ type: 'int', default: 0 })
  position: number;

  @CreateDateColumn()
  createdAt: Date;
}
