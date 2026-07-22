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

  // "전체"(자기 자신) 방의 설명(상태메시지). friends.description과 같은 관례 —
  // 빈 문자열은 저장하지 않고 null로 통일. (nullable union이라 타입 명시 — 백엔드 규칙)
  @Column({ type: 'varchar', length: 80, nullable: true })
  selfDescription: string | null;

  // "태그 전체" 방(태그가 하나 이상 달린 메시지 모음)의 프로필 색(hex). selfColor와 동일 계약.
  // null이면 프론트가 기본 무채 # 타일로 표시. (nullable union이라 타입 명시 — 백엔드 규칙)
  @Column({ type: 'varchar', length: 9, nullable: true })
  tagAllColor: string | null;

  // "태그 전체" 방의 설명(상태메시지). selfDescription과 같은 관례 —
  // 빈 문자열은 저장하지 않고 null로 통일. (nullable union이라 타입 명시 — 백엔드 규칙)
  @Column({ type: 'varchar', length: 80, nullable: true })
  tagAllDescription: string | null;

  // 사용자가 직접선택 피커로 저장해 둔 "커스텀 프로필" 색 목록(hex). 편집기 스와치 그리드에
  // 기본 프리셋 다음에 나열된다. null/빈 = 없음. (콤마 join되는 simple-array — hex엔 콤마 없음)
  @Column({ type: 'simple-array', nullable: true })
  customColors: string[] | null;

  // "자동구분" 카테고리 표시 순서(설정에서 드래그 저장). AUTO_ORDER_CATEGORIES의 순열.
  // null이면 프론트가 기본 순서로 표시. (nullable union이라 타입 명시 — 백엔드 규칙)
  @Column({ type: 'jsonb', nullable: true })
  autoOrder: string[] | null;

  // 자동구분 즐겨찾기(AUTO_ORDER_CATEGORIES의 부분집합, 배열 순서=즐겨찾기 순서). null/빈=없음.
  @Column({ type: 'simple-array', nullable: true })
  autoFavorites: string[] | null;

  // 탭(메뉴) 표시 순서(더보기 화면에서 드래그 저장). TAB_ORDER_KEYS의 순열.
  // null이면 프론트가 기본 순서로 표시. 더보기는 순서 밖(항상 맨끝 고정).
  // (nullable union이라 타입 명시 — 백엔드 규칙. 콤마 join되는 simple-array — 키엔 콤마 없음)
  @Column({ type: 'simple-array', nullable: true })
  tabOrder: string[] | null;

  // 숨긴 탭 목록(더보기 화면 토글). HIDEABLE_TABS('categories'|'tags'|'auto')의 부분집합.
  // null/빈 = 전부 노출. 숨겨도 라우트는 살아있고 탭바/레일에서만 사라진다.
  // (nullable union이라 타입 명시 — 백엔드 규칙)
  @Column({ type: 'simple-array', nullable: true })
  hiddenTabs: string[] | null;

  // 접힌 섹션 키 목록(설정·보드 등 UI의 접기/펼치기 상태). 키 체계는 프론트가 소유
  // (동적 보드 섹션 키 포함이라 백엔드는 화이트리스트 검증하지 않는다). null/빈 = 전부 펼침.
  // (nullable union이라 타입 명시 — 백엔드 규칙)
  @Column({ type: 'jsonb', nullable: true })
  collapsedSections: string[] | null;

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
