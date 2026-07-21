// "자동구분" 카테고리의 기본 순서. 사용자가 설정에서 드래그로 재배열해 저장할 수 있다.
export const AUTO_ORDER_CATEGORIES = [
  'place',
  'video',
  'item',
  'article',
  'memo',
  'link',
] as const;

export type AutoOrderCategory = (typeof AUTO_ORDER_CATEGORIES)[number];

// AUTO_ORDER_CATEGORIES의 순열(개수 일치 + 중복 없음 + 전부 허용된 값)인지 검증.
export function isValidAutoOrder(
  value: unknown,
): value is AutoOrderCategory[] {
  if (!Array.isArray(value)) return false;
  if (value.length !== AUTO_ORDER_CATEGORIES.length) return false;
  const set = new Set(value);
  if (set.size !== AUTO_ORDER_CATEGORIES.length) return false;
  return AUTO_ORDER_CATEGORIES.every((c) => set.has(c));
}

// AUTO_ORDER_CATEGORIES의 부분집합(중복 없음 + 전부 허용된 값)인지 검증. 빈 배열도 유효(즐겨찾기 없음).
export function isValidAutoFavorites(
  value: unknown,
): value is AutoOrderCategory[] {
  if (!Array.isArray(value)) return false;
  const set = new Set(value);
  if (set.size !== value.length) return false;
  return value.every((v) =>
    (AUTO_ORDER_CATEGORIES as readonly unknown[]).includes(v),
  );
}
