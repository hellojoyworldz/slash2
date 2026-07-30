import Constants from 'expo-constants';
import { Platform } from 'react-native';
import i18n from './i18n';
import type { CapsuleTab, HideableCapsule } from './tab-menu';

export interface User {
  id: string;
  email: string;
  displayName?: string | null;
  emailVerified?: boolean;
  // "전체"(자기 자신) 방 프로필 색(hex). null이면 프론트가 기본 검정으로 표시.
  selfColor?: string | null;
  // "전체"(자기 자신) 방 설명(상태메시지). 없으면 null.
  selfDescription?: string | null;
  // "태그 전체" 방 프로필 색(hex). null이면 프론트가 기본 무채 # 타일로 표시. selfColor와 동일 계약.
  tagAllColor?: string | null;
  // "태그 전체" 방 설명(상태메시지). 없으면 null.
  tagAllDescription?: string | null;
  // 사용자가 저장한 커스텀 프로필 색 목록(hex). 편집기 스와치 그리드에 프리셋 다음에 나열.
  customColors?: string[];
  // 자동구분 표시 순서(5종 순열). null이면 프론트가 기본 순서로 표시.
  // 자동구분 탭·목록형 보드 섹션·자동구분 칩(전체 제외) 순서에 반영된다.
  autoOrder?: AutoKind[] | null;
  // 자동구분 즐겨찾기(5종의 부분집합, 배열 순서=즐겨찾기 순서). null/빈=없음.
  // 자동구분 탭 '즐겨찾기' 섹션의 원천. 종류가 정적이라 분류/태그와 달리 유저 프로필에 저장된다.
  autoFavorites?: AutoKind[] | null;
  // 탭(메뉴) 표시 순서(5키 순열). null이면 기본 순서. 더보기는 순서 밖(항상 맨끝).
  tabOrder?: TabKey[] | null;
  // 숨긴 탭 목록(HIDEABLE_TABS의 부분집합). null/빈=전부 노출. 숨겨도 라우트는 유효.
  hiddenTabs?: HideableTab[] | null;
  // 그룹 탭 캡슐 세그먼트(분류|태그|자동구분) 순서(3키 순열). null이면 기본 순서.
  // tabOrder(메뉴/레일)와 완전히 별개 — 캡슐만의 순서다.
  capsuleOrder?: CapsuleTab[] | null;
  // 숨긴 캡슐 목록(HIDEABLE_CAPSULES의 부분집합). null/빈=전부 노출.
  // hiddenTabs(메뉴/레일)와 완전히 별개 — 캡슐만의 노출 설정이다.
  hiddenCapsules?: HideableCapsule[] | null;
  // 접힌 섹션 키 목록(프론트가 키 체계 소유). null/빈=전부 펼침.
  // 본탭 즐겨찾기/목록 섹션·픽커 목록·목록형 보드 섹션의 접기 상태를 서버에 저장한다.
  // 키 예: friends.favorites, picker.tags, board.auto.place, board.category.<friendId>.
  collapsedSections?: string[] | null;
  // 연결된 소셜 provider 목록 (예: ['google']). /auth/me·로그인 응답에서 내려온다.
  providers?: string[];
}

// 탭(메뉴) 커스터마이즈: 순서를 바꿀 수 있는 5키(더보기는 순서 밖·맨끝 고정).
export type TabKey = 'friends' | 'chats' | 'categories' | 'tags' | 'auto';

// 노출/숨김 토글 가능한 탭(그룹·채팅·더보기는 항상 노출이라 제외).
export type HideableTab = 'categories' | 'tags' | 'auto';

// 링크 자동구분: 서버가 링크를 분류한 종류. 미분류/구버전 메시지는 null.
// (아티클은 제거됨 — 아티클이던 링크는 서버가 미분류 링크로 떨어뜨린다.)
export type LinkType = 'place' | 'video' | 'item';

// 자동구분 탭이 모아 보는 고정 종류(전 방 통합). link=미분류 링크, memo=순수 텍스트 메모까지 5종.
export type AutoKind = 'place' | 'video' | 'item' | 'memo' | 'link';

// 자동구분 개수: 다섯 키를 항상 포함(0이어도 키는 있다).
export type AutoCounts = Record<AutoKind, number>;

// 종류별 부가 메타데이터. 서버가 아직 값을 안 줄 수 있어 모든 필드가 optional.
export interface LinkMeta {
  placeName?: string;
  address?: string;
  lat?: number;
  lng?: number;
  phone?: string;
  hours?: string;
  price?: number;
  currency?: string;
  durationSec?: number;
  channel?: string;
  author?: string;
  reviews?: string;
}

// content에 등장한 링크별 미리보기. 등장 순서대로 저장되며, 중복 URL은 1회, 최대 5개.
// 프론트는 content를 각 url의 첫 등장 위치로 쪼개 [텍스트][카드]… 순서대로 렌더한다.
// 레거시 단일 필드(url/og*/linkType/linkMeta)는 links[0]과 동일 값. 구 메시지는 links가 null.
export interface MessageLink {
  url: string;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  siteName: string | null;
  linkType: LinkType | null;
  linkMeta: LinkMeta | null;
}

export interface Message {
  id: string;
  friendId: string | null;
  kind: 'text' | 'link';
  content: string;
  url: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  siteName: string | null;
  createdAt: string;
  // 자동구분 결과. 서버가 아직 안 줄 수 있어 optional/nullable — 없으면 일반 링크 카드로 렌더.
  linkType?: LinkType | null;
  linkMeta?: LinkMeta | null;
  // content에 등장한 모든 링크(등장 순서·최대 5개)의 미리보기. 링크 없거나 구 메시지면 null/없음.
  links?: MessageLink[] | null;
  // 이 메시지에 붙은 태그 id 목록(전체 교체·부분 의미론). 서버 미배포/구버전이면 없을 수 있어 optional.
  tagIds?: string[];
  // 이 메시지가 속한 방의 공지인지(방당 1개). 서버 미배포/구버전이면 없을 수 있어 optional.
  isNotice?: boolean;
}

// 사용자 정의 태그(메시지 다중 분류). 분류(friend)와 달리 색이 없다 — 색은 분류의 것.
export interface Tag {
  id: string;
  name: string;
  // 태그 프로필 색 (hex). # 타일 배경의 원천. null이면 기본 표면색. 말풍선 색은 분류의 것 — 태그는 자기 타일만.
  color?: string | null;
  position: number;
  // 태그 설명(분류 selfDescription/description과 같은 관례 — 빈 문자열은 null). 없으면 null.
  description?: string | null;
  // 태그 탭 상단 고정. GET /tags 정렬 = 고정 먼저 → position → name. 서버 미배포면 없을 수 있어 optional.
  pinned?: boolean;
  // 태그 탭 즐겨찾기(★). 고정(pinned)과 무관 — 본 목록 정렬엔 영향 없음. 분류 favorite과 동일 관례.
  favorite?: boolean;
  // 즐겨찾기 섹션 전용 순서(position과 독립). favorite=true 토글 시 서버가 맨 밑 위치 자동 부여, false 시 null.
  favoritePosition?: number | null;
  // 이 태그가 붙은 메시지 개수 (GET /tags에서 내려줌). 서버 미배포/구버전이면 없을 수 있어 optional.
  messageCount?: number;
  // 자동 부착 키워드(0~10개, 각 ≤30자). 저장 시 서버가 과거·신규 메시지에 이 태그를 실제 부착한다.
  // 삭제해도 이미 부착된 태그는 유지. 서버 미배포/구버전이면 없을 수 있어 optional(없으면 빈 배열로 취급).
  keywords?: string[];
}

export interface MessagePage {
  items: Message[];
  hasMore: boolean;
}

// "친구" = 링크를 분류하는 카테고리 (UI에서는 친구처럼 보여준다)
export interface Friend {
  id: string;
  name: string;
  // 분류 배경색 (hex). 아바타 배경·이 분류 말풍선 색의 원천. null이면 기본 표면색.
  color?: string | null;
  // 상태메시지 (카톡 프로필 상태메시지처럼). 선택 입력.
  description?: string | null;
  // 이 분류에 담긴 메시지 개수 (목록 API에서 내려줌)
  messageCount?: number;
  pinned: boolean;
  // 분류 탭 즐겨찾기(★). 채팅 탭 고정(pinned)과 무관 — 본 목록(분류) 정렬엔 영향 없음. 서버 미배포/구버전이면 없을 수 있어 optional.
  favorite?: boolean;
  // 즐겨찾기 섹션 전용 순서(분류 position과 독립). favorite=true 토글 시 서버가 맨 밑 위치 자동 부여,
  // false 시 null. 즐겨찾기 섹션은 이 값 오름차순(null이면 맨 뒤)으로 정렬한다. 서버 미배포/구버전이면 없을 수 있어 optional.
  favoritePosition?: number | null;
  createdAt: string;
}

// 채팅 탭에 보여줄 방 목록 요약
export interface RoomsSummary {
  self: Message | null;
  friends: {
    id: string;
    name: string;
    color?: string | null;
    description?: string | null;
    pinned: boolean;
    lastMessage: Message | null;
  }[];
}

// 배포 빌드는 EXPO_PUBLIC_API_URL(루트 .env)로 서버 주소를 박아 넣는다
// (예: https://api.slash.example — 웹 정적 export·데스크톱 패키징·스토어 빌드 공통).
// 미설정 시 개발 폴백: Expo 개발 서버를 띄운 컴퓨터의 IP를 자동으로 사용한다.
// (폰과 컴퓨터가 같은 와이파이에 있으면 그대로 동작)
function resolveBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) return `${envUrl.replace(/\/+$/, '')}/api`;
  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:4000/api`;
  if (Platform.OS === 'android') return 'http://10.0.2.2:4000/api';
  return 'http://localhost:4000/api';
}

export const BASE_URL = resolveBaseUrl();

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    // 백엔드가 준 언어중립 에러 코드. 프론트가 언어별 문구로 매핑한다.
    public code?: string,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      // 백엔드가 메일·페이지를 이 언어로 발신하도록 현재 앱 언어를 알린다.
      'X-App-Lang': i18n.language,
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    let code: string | undefined;
    try {
      const data = await response.json();
      code = typeof data.code === 'string' ? data.code : undefined;
      message = Array.isArray(data.message) ? data.message[0] : data.message;
    } catch {
      // 응답 본문이 JSON이 아니면 기본 메시지 사용
    }
    throw new ApiError(response.status, message, code);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface LookupResult {
  status: 'new' | 'password' | 'social';
  providers?: string[];
}

export const api = {
  // 이메일만 보내 다음 단계를 확인 (identifier-first 로그인)
  lookup: (email: string) =>
    request<LookupResult>('/auth/lookup', { method: 'POST', body: { email } }),

  register: (email: string, password: string) =>
    request<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: { email, password },
    }),

  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    }),

  // 비밀번호 재설정 메일 요청. 가입 여부와 무관하게 항상 성공 응답.
  forgotPassword: (email: string) =>
    request<{ ok: true }>('/auth/forgot-password', {
      method: 'POST',
      body: { email },
    }),

  // 메일로 받은 6자리 코드로 앱 안에서 비밀번호 재설정.
  resetPasswordWithCode: (email: string, code: string, password: string) =>
    request<{ reset: boolean }>('/auth/reset-password-code', {
      method: 'POST',
      body: { email, code, password },
    }),

  // SNS 로그인/회원가입. token = provider(구글·애플 등)에서 받은 idToken.
  // name은 애플이 최초 1회만 주는 실명(fullName) — 있을 때만 body에 포함.
  socialLogin: (provider: 'google' | 'apple', token: string, name?: string) =>
    request<{ token: string; user: User }>(`/auth/social/${provider}`, {
      method: 'POST',
      body: name ? { token, name } : { token },
    }),

  me: (token: string) => request<User>('/auth/me', { token }),

  // 프로필 부분 갱신 (표시 이름 / "전체" 방 프로필 색·설명 / 커스텀 프로필 목록 / 자동구분 순서).
  // 보낸 필드만 반영된다. autoOrder는 6종 순열이어야 하며, 잘못되면 400 code 'invalid_auto_order'.
  updateProfile: (
    token: string,
    changes: {
      displayName?: string;
      selfColor?: string | null;
      selfDescription?: string;
      // "태그 전체" 방 프로필 색·설명 (selfColor/selfDescription과 동일 계약).
      tagAllColor?: string | null;
      tagAllDescription?: string;
      customColors?: string[];
      autoOrder?: AutoKind[];
      // 자동구분 즐겨찾기(5종 부분집합). 잘못되면 400 code 'invalid_order'.
      autoFavorites?: AutoKind[];
      // 탭 순서(5키 순열)·숨김 탭(HIDEABLE_TABS 부분집합). 잘못되면 400 code 'invalid_order'.
      tabOrder?: TabKey[];
      hiddenTabs?: HideableTab[];
      // 캡슐 순서(3키 순열)·숨김 캡슐(HIDEABLE_CAPSULES 부분집합). 잘못되면 400 code 'invalid_order'.
      // tabOrder/hiddenTabs와 별개 — 캡슐 전용.
      capsuleOrder?: CapsuleTab[];
      hiddenCapsules?: HideableCapsule[];
      // 접힌 섹션 키 목록(각 ≤64자, 최대 100개). 서버가 중복 제거·빈 배열→null.
      // 잘못되면 400 code 'invalid_collapsed_sections'.
      collapsedSections?: string[] | null;
    },
  ) =>
    request<User>('/auth/me', {
      method: 'PATCH',
      body: changes,
      token,
    }),

  // 6자리 코드로 이메일 인증 (로그인 상태, 멀티플랫폼)
  verifyEmailCode: (token: string, code: string) =>
    request<{ verified: boolean }>('/auth/verify-email-code', {
      method: 'POST',
      body: { code },
      token,
    }),

  // 인증 메일 다시 보내기 (로그인 상태)
  resendVerification: (token: string) =>
    request<{ ok: true }>('/auth/resend-verification', {
      method: 'POST',
      token,
    }),

  listMessages: (
    token: string,
    params: {
      q?: string;
      before?: string;
      friendId?: string;
      // 자동구분 통합 조회. 있으면 서버가 friendId를 무시하고 전 방에서 이 종류만 모은다.
      // 특수값 'all' = 자동구분(링크)이 하나라도 잡힌 전체 방.
      auto?: AutoKind | 'all';
      // 태그 통합 조회. 있으면 서버가 friendId를 무시하고 이 태그가 붙은 메시지를 전 방에서 모은다.
      // 특수값 'all' = 태그가 하나 이상 달린 전체 방.
      tagId?: string;
    } = {},
  ) => {
    const query = new URLSearchParams();
    if (params.q) query.set('q', params.q);
    if (params.before) query.set('before', params.before);
    // auto·tagId가 있으면 전 방 통합이라 friendId는 보내지 않는다(서버도 무시).
    if (params.auto) query.set('auto', params.auto);
    else if (params.tagId) query.set('tagId', params.tagId);
    else if (params.friendId) query.set('friendId', params.friendId);
    const suffix = query.size ? `?${query.toString()}` : '';
    return request<MessagePage>(`/messages${suffix}`, { token });
  },

  // 자동구분 탭의 종류별 개수(다섯 키 항상 포함). 화면 포커스 시 갱신.
  autoCounts: (token: string) =>
    request<AutoCounts>('/messages/auto-counts', { token }),

  // tagIds: 태그 방에서 전송할 때 그 태그를 자동 부착한다(분류 없는 새 메시지 + 태그).
  // 보낸 필드만 실린다 — friendId/tagIds가 없으면 body에서 생략.
  createMessage: (
    token: string,
    content: string,
    friendId?: string,
    tagIds?: string[],
  ) =>
    request<Message>('/messages', {
      method: 'POST',
      body: {
        content,
        ...(friendId ? { friendId } : {}),
        ...(tagIds && tagIds.length ? { tagIds } : {}),
      },
      token,
    }),

  // 본인 메시지 단건 조회. 링크 전송 직후 비동기 미리보기(언퍼얼)가 채워졌는지 폴링으로 재조회할 때 쓴다.
  getMessage: (token: string, id: string) =>
    request<Message>(`/messages/${id}`, { token }),

  listRooms: (token: string) => request<RoomsSummary>('/messages/rooms', { token }),

  deleteMessage: (token: string, id: string) =>
    request<void>(`/messages/${id}`, { method: 'DELETE', token }),

  // 메시지를 친구(카테고리)로 분류하거나 해제(null)한다.
  updateMessageFriend: (token: string, id: string, friendId: string | null) =>
    request<Message>(`/messages/${id}`, {
      method: 'PATCH',
      body: { friendId },
      token,
    }),

  // 메시지 내용(content) 수정.
  // 주의: 현재 백엔드 PATCH /messages/:id 는 friendId만 반영한다(UpdateMessageDto에 content가 없어
  // ValidationPipe whitelist가 content를 떨궈내고, 서비스는 dto.friendId ?? null로 분류를 덮어쓴다).
  // 그래서 content만 보내면 분류가 풀리는 사고가 난다 — 현재 friendId를 함께 실어 분류를 보존한다.
  // 백엔드가 content를 지원하도록 확장되면(UpdateMessageDto + 서비스) 이 호출이 그대로 내용을 수정한다.
  updateMessageContent: (
    token: string,
    id: string,
    content: string,
    friendId: string | null,
  ) =>
    request<Message>(`/messages/${id}`, {
      method: 'PATCH',
      body: { content, friendId },
      token,
    }),

  // 메시지 통합 부분 갱신 — content·friendId·tagIds를 한 번의 PATCH로 보낸다(백엔드가 부분
  // 의미론 지원: 보낸 필드만 반영). 수정 모드 [저장]이 내용·스테이징된 분류·태그를 함께 적용한다.
  updateMessage: (
    token: string,
    id: string,
    changes: { content?: string; friendId?: string | null; tagIds?: string[] },
  ) =>
    request<Message>(`/messages/${id}`, {
      method: 'PATCH',
      body: changes,
      token,
    }),

  // 메시지의 링크 미리보기(og·자동구분)를 다시 불러온다. 간헐적 봇 차단으로 미리보기가
  // 비어 왔을 때 수동 재시도용. 멀티링크면 서버가 전부 재시도해 갱신된 메시지를 반환한다.
  refreshMessagePreview: (token: string, id: string) =>
    request<Message>(`/messages/${id}/refresh-preview`, {
      method: 'POST',
      token,
    }),

  listFriends: (token: string) => request<Friend[]>('/friends', { token }),

  createFriend: (
    token: string,
    name: string,
    color?: string | null,
    description?: string,
  ) =>
    request<Friend>('/friends', {
      method: 'POST',
      // 색은 있을 때만 보낸다 — 없으면(무채) 서버가 null로 생성.
      body: { name, ...(color ? { color } : {}), ...(description ? { description } : {}) },
      token,
    }),

  deleteFriend: (token: string, id: string) =>
    request<void>(`/friends/${id}`, { method: 'DELETE', token }),

  // 분류 수정 (이름·프로필색·설명). 부분 갱신이라 바뀐 필드만 보낸다.
  // color: 키 없음=미변경, null=무채(색 없음)로 변경, hex=그 색으로 변경.
  updateFriend: (
    token: string,
    id: string,
    changes: { name?: string; color?: string | null; description?: string },
  ) =>
    request<Friend>(`/friends/${id}`, {
      method: 'PATCH',
      body: changes,
      token,
    }),

  // 채팅 목록 상단 고정 토글
  updateFriendPinned: (token: string, id: string, pinned: boolean) =>
    request<Friend>(`/friends/${id}`, { method: 'PATCH', body: { pinned }, token }),

  // 분류 탭 즐겨찾기(★) 토글. 정렬에는 영향 없음(수동 드래그 순서 유지).
  updateFriendFavorite: (token: string, id: string, favorite: boolean) =>
    request<Friend>(`/friends/${id}`, { method: 'PATCH', body: { favorite }, token }),

  // 분류 탭 수동 정렬 저장. ids = 화면에 보이는 순서 그대로. 응답은 204(본문 없음).
  reorderFriends: (token: string, ids: string[]) =>
    request<void>('/friends/order', { method: 'PATCH', body: { ids }, token }),

  // 즐겨찾기 섹션 수동 정렬 저장(분류 순서와 독립). ids = 즐겨찾기 섹션에 보이는 순서 그대로.
  // 서버가 favoritePosition을 이 순서로 재부여한다. 응답은 204(본문 없음).
  reorderFavorites: (token: string, ids: string[]) =>
    request<void>('/friends/favorite-order', { method: 'PATCH', body: { ids }, token }),

  // ── 태그 ──────────────────────────────────────────────────────────
  listTags: (token: string) => request<Tag[]>('/tags', { token }),

  // 새 태그 생성. 이름 중복은 409 code 'tag_name_taken'.
  // 색·설명(선택)은 있을 때만 보낸다 — 빈 문자열은 서버가 null로 저장(friends 생성과 같은 관례).
  // keywords(선택)는 있을 때만 보낸다(0~10개). 저장 시 서버가 매칭 메시지에 이 태그를 실제 부착한다.
  createTag: (
    token: string,
    name: string,
    color?: string | null,
    description?: string,
    keywords?: string[],
  ) =>
    request<Tag>('/tags', {
      method: 'POST',
      body: {
        name,
        ...(color ? { color } : {}),
        ...(description ? { description } : {}),
        ...(keywords ? { keywords } : {}),
      },
      token,
    }),

  // 태그 수정 (이름·프로필색·설명·키워드). 부분 갱신이라 바뀐 필드만 보낸다. 설명 빈 문자열은 서버가 null로 저장.
  // color: 키 없음=미변경, null=무채(색 없음)로 변경, hex=그 색으로 변경.
  // keywords: 전체 교체(0~10개). 저장 시 서버가 매칭 메시지에 이 태그를 실제 부착한다(각·중복은 서버가 정규화).
  updateTag: (
    token: string,
    id: string,
    changes: { name?: string; color?: string | null; description?: string; keywords?: string[] },
  ) => request<Tag>(`/tags/${id}`, { method: 'PATCH', body: changes, token }),

  // 태그 탭 상단 고정 토글(분류 고정과 동일 관례).
  updateTagPinned: (token: string, id: string, pinned: boolean) =>
    request<Tag>(`/tags/${id}`, { method: 'PATCH', body: { pinned }, token }),

  // 태그 탭 즐겨찾기(★) 토글. 정렬에는 영향 없음(수동 드래그 순서 유지). 분류 favorite과 동일 관례.
  updateTagFavorite: (token: string, id: string, favorite: boolean) =>
    request<Tag>(`/tags/${id}`, { method: 'PATCH', body: { favorite }, token }),

  // 태그 삭제(모든 메시지에서 제거된다).
  deleteTag: (token: string, id: string) =>
    request<void>(`/tags/${id}`, { method: 'DELETE', token }),

  // 태그 탭 수동 정렬 저장. ids = 화면에 보이는 순서 그대로. 응답은 204(본문 없음).
  // 분류 재정렬(reorderFriends)과 동일 관례 — 엔드포인트만 다르다. GET /tags는 position ASC.
  reorderTags: (token: string, ids: string[]) =>
    request<void>('/tags/order', { method: 'PATCH', body: { ids }, token }),

  // 태그 즐겨찾기 섹션 수동 정렬 저장(태그 순서와 독립). ids = 즐겨찾기 섹션에 보이는 순서 그대로.
  // 서버가 favoritePosition을 이 순서로 재부여한다. 응답은 204. 분류 reorderFavorites와 동일 관례.
  reorderFavoriteTags: (token: string, ids: string[]) =>
    request<void>('/tags/favorite-order', { method: 'PATCH', body: { ids }, token }),

  // 메시지 태그 전체 교체(부분 의미론 — tagIds만 반영).
  updateMessageTags: (token: string, id: string, tagIds: string[]) =>
    request<Message>(`/messages/${id}`, { method: 'PATCH', body: { tagIds }, token }),

  // 공지 설정/해제. true=이 방 공지(방당 1개, 기존 자동 해제), false=해제.
  updateMessageNotice: (token: string, id: string, notice: boolean) =>
    request<Message>(`/messages/${id}`, { method: 'PATCH', body: { notice }, token }),

  // 방 공지 조회. friendId 없으면 전체(self) 방. 응답 래핑이 확정 전이라 방어적으로 언랩:
  // Message 자체 / { notice: Message|null } / null 을 모두 Message|null로 정규화한다.
  getNoticeMessage: async (
    token: string,
    friendId: string | null,
  ): Promise<Message | null> => {
    const query = friendId ? `?friendId=${encodeURIComponent(friendId)}` : '';
    const res = await request<
      Message | { notice: Message | null } | null
    >(`/messages/notice${query}`, { token });
    if (!res || typeof res !== 'object') return null;
    if ('notice' in res) return res.notice ?? null;
    if ('id' in res) return res as Message;
    return null;
  },
};
