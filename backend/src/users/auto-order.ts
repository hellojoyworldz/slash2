// "자동구분" 카테고리의 고정 순서/집합. 사용자가 설정에서 드래그로 재배열해 저장할 수 있다.
// (article은 자동구분에서 제거됨 — 레거시 저장값은 읽기/쓰기 정규화로 드롭한다.)
export const AUTO_ORDER_CATEGORIES = [
  'place',
  'video',
  'item',
  'memo',
  'link',
] as const;

export type AutoOrderCategory = (typeof AUTO_ORDER_CATEGORIES)[number];

function isCategory(value: unknown): value is AutoOrderCategory {
  return (
    typeof value === 'string' &&
    (AUTO_ORDER_CATEGORIES as readonly string[]).includes(value)
  );
}

/** 고정 카테고리만 남기고 중복 제거(순서 보존). 레거시 'article'·무효값은 조용히 드롭한다. */
function keepCategories(value: unknown): AutoOrderCategory[] {
  if (!Array.isArray(value)) return [];
  const out: AutoOrderCategory[] = [];
  const seen = new Set<string>();
  for (const v of value) {
    if (isCategory(v) && !seen.has(v)) {
      out.push(v);
      seen.add(v);
    }
  }
  return out;
}

/** 읽기용 정규화: 고정 카테고리만 남기고 중복 제거. 레거시 'article'은 여기서 사라진다.
 *  결과가 비면 null(기본 순서를 뜻함) — 저장된 기존 값이 깨지지 않는다. */
export function normalizeStoredAutoOrder(
  value: unknown,
): AutoOrderCategory[] | null {
  const out = keepCategories(value);
  return out.length ? out : null;
}

// autoFavorites도 같은 필터(부분집합)라 읽기 정규화는 동일하다.
export const normalizeStoredAutoFavorites = normalizeStoredAutoOrder;

/** autoOrder 쓰기 해석: 정규화 후 '고정 5종의 순열'이면 그 배열, 아니면 null(→ 400).
 *  무효 항목('article' 등)은 정규화로 드롭되므로 순열 판정에 영향을 주지 않는다. */
export function resolveAutoOrder(value: unknown): AutoOrderCategory[] | null {
  const out = keepCategories(value);
  return out.length === AUTO_ORDER_CATEGORIES.length ? out : null;
}

/** autoFavorites 쓰기 해석: 고정 5종의 부분집합 — 정규화 결과 그대로(빈 배열 허용). */
export function resolveAutoFavorites(value: unknown): AutoOrderCategory[] {
  return keepCategories(value);
}
