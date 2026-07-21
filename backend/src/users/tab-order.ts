// 메뉴(탭) 커스터마이즈 — 사용자가 더보기 화면에서 순서·노출을 저장한다.
// 재정렬 대상 5키. 그룹·채팅·더보기는 항상 노출이지만, 그룹·채팅은 순서에는 참여한다
// (더보기만 순서 밖·항상 맨끝 고정이라 여기 없다).
export const TAB_ORDER_KEYS = [
  'friends',
  'chats',
  'categories',
  'tags',
  'auto',
] as const;

export type TabOrderKey = (typeof TAB_ORDER_KEYS)[number];

// 노출/숨김 토글 가능한 탭. 그룹·채팅·더보기는 항상 노출이라 여기 없다.
export const HIDEABLE_TABS = ['categories', 'tags', 'auto'] as const;

export type HideableTab = (typeof HIDEABLE_TABS)[number];

// TAB_ORDER_KEYS의 순열(개수 일치 + 중복 없음 + 전부 허용된 값)인지 검증.
export function isValidTabOrder(value: unknown): value is TabOrderKey[] {
  if (!Array.isArray(value)) return false;
  if (value.length !== TAB_ORDER_KEYS.length) return false;
  const set = new Set(value);
  if (set.size !== TAB_ORDER_KEYS.length) return false;
  return TAB_ORDER_KEYS.every((k) => set.has(k));
}

// HIDEABLE_TABS의 부분집합(중복 없음 + 전부 허용된 값)인지 검증. 빈 배열도 유효(전부 노출).
export function isValidHiddenTabs(value: unknown): value is HideableTab[] {
  if (!Array.isArray(value)) return false;
  const set = new Set(value);
  if (set.size !== value.length) return false;
  return value.every((v) => (HIDEABLE_TABS as readonly unknown[]).includes(v));
}
