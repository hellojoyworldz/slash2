import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Friend } from '../friends/friend.entity';
import { User } from '../users/user.entity';

export type MessageKind = 'text' | 'link';

@Entity('messages')
@Index(['userId', 'createdAt'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  // 어느 친구(카테고리) 방의 메시지인지. null이면 "나에게" 방.
  // 친구를 삭제하면 메시지는 "나에게"로 돌아간다(SET NULL).
  @Column({ type: 'uuid', nullable: true })
  friendId: string | null;

  @ManyToOne(() => Friend, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'friendId' })
  friend: Friend | null;

  @Column({ type: 'varchar', default: 'text' })
  kind: MessageKind;

  @Column('text')
  content: string;

  @Column({ type: 'text', nullable: true })
  url: string | null;

  @Column({ type: 'text', nullable: true })
  ogTitle: string | null;

  @Column({ type: 'text', nullable: true })
  ogDescription: string | null;

  @Column({ type: 'text', nullable: true })
  ogImage: string | null;

  @Column({ type: 'text', nullable: true })
  siteName: string | null;

  @Column({ default: false })
  archived: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
