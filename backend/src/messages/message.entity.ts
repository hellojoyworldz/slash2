import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Friend } from '../friends/friend.entity';
import { Tag } from '../tags/tag.entity';
import { User } from '../users/user.entity';

export type MessageKind = 'text' | 'link';

// 링크 자동구분 결과. 판단 불가면 null로 남는다.
export type LinkType = 'place' | 'video' | 'item' | 'article';

// "자동구분" 조회 필터. place|video|item|article은 LinkType 값 그대로,
// memo는 kind='text', link는 자동구분 안 된 링크(kind='link' AND linkType IS NULL)를 뜻한다.
export type AutoFilter = LinkType | 'memo' | 'link';
export const AUTO_FILTERS: AutoFilter[] = [
  'place',
  'video',
  'item',
  'article',
  'memo',
  'link',
];

// 태그/자동구분 "전체" 방을 뜻하는 특수 조회값. 태그 id는 uuid라 이 값과 충돌하지 않는다.
export const ROOM_ALL = 'all';

// "자동구분" 목록 조회 필터. 6종 + 특수값 'all'(자동구분(링크)이 하나라도 잡힌 전체).
// autoCounts는 AutoFilter(6종)만 세므로 'all'을 포함하지 않는 별도 타입으로 분리한다.
export type AutoQueryFilter = AutoFilter | typeof ROOM_ALL;
export const AUTO_QUERY_FILTERS: AutoQueryFilter[] = [...AUTO_FILTERS, ROOM_ALL];

export interface LinkMeta {
  placeName?: string; // 장소명 (og:title이 장소명인 경우 포함)
  address?: string;
  lat?: number;
  lng?: number;
  phone?: string;
  hours?: string; // 영업시간 사람이 읽는 한 줄
  price?: number;
  currency?: string; // 기본 'KRW'
  durationSec?: number; // 영상 길이(초)
  channel?: string; // 영상 채널/작성자
  author?: string; // 글 작성자
}

// content에 들어온 링크별 미리보기. 등장 순서대로 저장하며, 프론트가
// 본문을 텍스트/카드 세그먼트로 교차 렌더할 때 url 문자열로 매칭한다.
// 레거시 단일 필드(url/og*/linkType/linkMeta)는 links[0]과 동일 값을 유지한다.
export interface MessageLink {
  url: string;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  siteName: string | null;
  linkType: LinkType | null;
  linkMeta: LinkMeta | null;
}

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

  // 링크 자동구분 결과 (place|video|item|article). 구 데이터는 null.
  @Column({ type: 'varchar', nullable: true })
  linkType: LinkType | null;

  // 분류별 상세 메타(좌표·가격·영상길이 등). 스키마가 유동적이라 jsonb.
  @Column({ type: 'jsonb', nullable: true })
  linkMeta: LinkMeta | null;

  // content에 등장한 모든 링크(등장 순서·최대 5개)의 미리보기 배열.
  // 링크가 없으면 null. links[0]은 위 레거시 단일 필드와 동일 값이다.
  @Column({ type: 'jsonb', nullable: true })
  links: MessageLink[] | null;

  @Column({ default: false })
  archived: boolean;

  // 방(동일 friendId, null 포함)당 최대 1개의 공지. 등록 시 같은 방의 기존 공지는 자동 해제.
  @Column({ default: false })
  isNotice: boolean;

  // 메시지에 붙은 태그(M:N). 조인테이블 message_tags — 양쪽 삭제 시 조인행은 FK CASCADE로 정리된다.
  // 직렬화는 tagIds: string[]로만 노출한다(서비스에서 매핑).
  @ManyToMany(() => Tag)
  @JoinTable({
    name: 'message_tags',
    joinColumn: { name: 'messageId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tagId', referencedColumnName: 'id' },
  })
  tags: Tag[];

  @CreateDateColumn()
  createdAt: Date;
}
