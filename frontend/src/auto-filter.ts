import { AutoKind, LinkType, Message } from './api';

// 자동구분 칩 필터: 전체 + 자동구분 4칩(장소·영상·상품·메모). 미분류 링크는
// 별도 칩 없이 "전체"에서만 보인다(사양). memo=text 메시지, 나머지=그 linkType의 링크.
// 채팅 뷰(ChatScreen)의 자동구분 칩·목록형 보드(ListBoardScreen)가 공유한다.
export type ListFilter = 'all' | LinkType | 'memo';
export const AUTO_FILTERS: ListFilter[] = ['all', 'place', 'video', 'item', 'memo'];

// 칩 필터 매칭(클라이언트 사이드). 이미 로드된 메시지 배열에서만 거른다.
export function matchesAutoFilter(m: Message, f: ListFilter): boolean {
  if (f === 'all') return true;
  if (f === 'memo') return m.kind === 'text';
  return m.kind === 'link' && m.linkType === f;
}

// 메시지를 자동구분 5종 중 하나로 귀속(자동구분 보드 그룹핑용). AutoScreen 매핑과 동일:
// 메모=text, 장소/영상/상품=그 linkType, 그 외 링크(타입 미상)=link.
export function messageAutoKind(m: Message): AutoKind {
  if (m.kind === 'text') return 'memo';
  return m.linkType ?? 'link';
}

// 자동구분 5종의 기본(초기) 순서 — users.autoOrder가 null이거나 잘못된 순열일 때 쓴다.
// 자동구분 탭·목록형 보드 섹션·자동구분 칩('전체' 제외) 순서의 원천.
export const AUTO_KINDS_DEFAULT: AutoKind[] = ['place', 'video', 'item', 'memo', 'link'];

// 저장된 autoOrder를 "유효한 5종 순열"로 정규화한다. null·길이 불일치·누락·중복·무효값이면 기본 순서.
// (아티클 제거 전 저장된 'article'이 섞여 있어도 무효값으로 떨어져 기본 순서로 방어된다.)
export function resolveAutoOrder(order?: AutoKind[] | null): AutoKind[] {
  if (!order || order.length !== AUTO_KINDS_DEFAULT.length) return AUTO_KINDS_DEFAULT;
  const valid = new Set<string>(AUTO_KINDS_DEFAULT);
  const seen = new Set<AutoKind>();
  for (const k of order) {
    // 무효값(구 'article' 등)·중복이 하나라도 있으면 기본 순서로 방어.
    if (!valid.has(k) || seen.has(k)) return AUTO_KINDS_DEFAULT;
    seen.add(k);
  }
  return order;
}

// 저장된 autoFavorites를 "유효한 5종의 부분집합"으로 정규화한다(배열 순서=즐겨찾기 순서).
// null/빈은 빈 배열. 알 수 없는 값(구 'article' 등)·중복은 제거하되 나머지 순서는 보존한다.
export function resolveAutoFavorites(favorites?: AutoKind[] | null): AutoKind[] {
  if (!favorites || favorites.length === 0) return [];
  const seen = new Set<AutoKind>();
  const out: AutoKind[] = [];
  for (const k of favorites) {
    if (AUTO_KINDS_DEFAULT.includes(k) && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}
