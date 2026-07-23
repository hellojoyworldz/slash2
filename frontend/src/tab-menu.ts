import { HideableTab, TabKey } from './api';

// 메뉴(탭) 커스터마이즈의 프론트 방어 정규화 — auto-filter.ts의 resolveAutoOrder와 같은 패턴.
// 서버가 항상 유효값을 주지만, 구버전/미배포/오염을 프론트에서도 방어한다.

// 재정렬 대상 5키의 기본(초기) 순서. tabOrder가 null·오염이면 이걸로 폴백.
// 탭바/레일 배열의 원천(더보기는 이 목록 밖에서 항상 맨끝에 붙는다).
export const TAB_ORDER_DEFAULT: TabKey[] = [
  'friends',
  'chats',
  'categories',
  'tags',
  'auto',
];

// 노출/숨김 토글 가능한 탭. 그룹(friends)·채팅(chats)·더보기는 항상 노출이라 여기 없다.
export const HIDEABLE_TABS: HideableTab[] = ['categories', 'tags', 'auto'];

// 저장된 tabOrder를 "유효한 5키 순열"로 정규화. null·길이 불일치·누락·중복이면 기본 순서.
export function resolveTabOrder(order?: TabKey[] | null): TabKey[] {
  if (!order || order.length !== TAB_ORDER_DEFAULT.length) return TAB_ORDER_DEFAULT;
  const seen = new Set(order);
  if (seen.size !== TAB_ORDER_DEFAULT.length) return TAB_ORDER_DEFAULT;
  if (TAB_ORDER_DEFAULT.some((k) => !seen.has(k))) return TAB_ORDER_DEFAULT;
  return order;
}

// 저장된 hiddenTabs를 "허용 3키의 부분집합"으로 정규화(허용 외·중복 제거). null/빈이면 빈 배열.
export function resolveHiddenTabs(hidden?: HideableTab[] | null): HideableTab[] {
  if (!hidden || hidden.length === 0) return [];
  const out: HideableTab[] = [];
  for (const h of hidden) {
    if (HIDEABLE_TABS.includes(h) && !out.includes(h)) out.push(h);
  }
  return out;
}

// 특정 탭이 토글로 숨김 가능한지(그룹·채팅·더보기는 항상 노출).
export function isHideableTab(key: TabKey): key is HideableTab {
  return (HIDEABLE_TABS as TabKey[]).includes(key);
}

// 그룹 탭 상단 캡슐 세그먼트(분류|태그|자동구분) 커스터마이즈 — 메뉴(tabOrder/hiddenTabs)와
// 완전히 별개인 캡슐 전용 상태. 캡슐 키는 TabKey의 부분집합이라 아래 별칭으로 재사용한다.

// 캡슐 순서/노출을 다루는 키(분류=categories). 순서엔 셋 다 참여.
export type CapsuleTab = Extract<TabKey, 'categories' | 'tags' | 'auto'>;

// 노출/숨김 토글 가능한 캡슐. 분류(categories)는 항상 노출이라 제외.
export type HideableCapsule = Extract<HideableTab, 'tags' | 'auto'>;

// 캡슐 3키의 기본(초기) 순서. capsuleOrder가 null·오염이면 이걸로 폴백.
export const CAPSULE_ORDER_DEFAULT: CapsuleTab[] = ['categories', 'tags', 'auto'];

// 노출/숨김 토글 가능한 캡슐(분류는 항상 노출이라 제외).
export const HIDEABLE_CAPSULES: HideableCapsule[] = ['tags', 'auto'];

// 저장된 capsuleOrder를 "유효한 3키 순열"로 정규화. null·길이 불일치·누락·중복이면 기본 순서.
export function resolveCapsuleOrder(order?: CapsuleTab[] | null): CapsuleTab[] {
  if (!order || order.length !== CAPSULE_ORDER_DEFAULT.length)
    return CAPSULE_ORDER_DEFAULT;
  const seen = new Set(order);
  if (seen.size !== CAPSULE_ORDER_DEFAULT.length) return CAPSULE_ORDER_DEFAULT;
  if (CAPSULE_ORDER_DEFAULT.some((k) => !seen.has(k))) return CAPSULE_ORDER_DEFAULT;
  return order;
}

// 저장된 hiddenCapsules를 "허용 2키의 부분집합"으로 정규화(허용 외·중복 제거). null/빈이면 빈 배열.
export function resolveHiddenCapsules(
  hidden?: HideableCapsule[] | null,
): HideableCapsule[] {
  if (!hidden || hidden.length === 0) return [];
  const out: HideableCapsule[] = [];
  for (const h of hidden) {
    if (HIDEABLE_CAPSULES.includes(h) && !out.includes(h)) out.push(h);
  }
  return out;
}
