import { AutoKind, LinkType, Message } from './api';

// 자동구분 칩 필터: 전체 + 자동구분 5종(장소·영상·상품·글·메모). 미분류 링크는
// 별도 칩 없이 "전체"에서만 보인다(사양). memo=text 메시지, 나머지=그 linkType의 링크.
// 채팅 뷰(ChatScreen)의 자동구분 칩·목록형 보드(ListBoardScreen)가 공유한다.
export type ListFilter = 'all' | LinkType | 'memo';
export const AUTO_FILTERS: ListFilter[] = ['all', 'place', 'video', 'item', 'article', 'memo'];

// 칩 필터 매칭(클라이언트 사이드). 이미 로드된 메시지 배열에서만 거른다.
export function matchesAutoFilter(m: Message, f: ListFilter): boolean {
  if (f === 'all') return true;
  if (f === 'memo') return m.kind === 'text';
  return m.kind === 'link' && m.linkType === f;
}

// 메시지를 자동구분 6종 중 하나로 귀속(자동구분 보드 그룹핑용). AutoScreen 매핑과 동일:
// 메모=text, 장소/영상/상품/글=그 linkType, 그 외 링크(타입 미상)=link.
export function messageAutoKind(m: Message): AutoKind {
  if (m.kind === 'text') return 'memo';
  return m.linkType ?? 'link';
}

// 자동구분 6종의 기본(초기) 순서 — users.autoOrder가 null이거나 잘못된 순열일 때 쓴다.
// 자동구분 탭·목록형 보드 섹션·자동구분 칩('전체' 제외) 순서의 원천.
export const AUTO_KINDS_DEFAULT: AutoKind[] = [
  'place',
  'video',
  'item',
  'article',
  'memo',
  'link',
];

// 저장된 autoOrder를 "유효한 6종 순열"로 정규화한다. null·길이 불일치·누락·중복이면 기본 순서.
// (서버가 항상 유효 순열을 주지만, 구버전/미배포/오염을 프론트에서도 방어한다.)
export function resolveAutoOrder(order?: AutoKind[] | null): AutoKind[] {
  if (!order || order.length !== AUTO_KINDS_DEFAULT.length) return AUTO_KINDS_DEFAULT;
  const seen = new Set(order);
  if (seen.size !== AUTO_KINDS_DEFAULT.length) return AUTO_KINDS_DEFAULT;
  if (AUTO_KINDS_DEFAULT.some((k) => !seen.has(k))) return AUTO_KINDS_DEFAULT;
  return order;
}
