// 섹션 접기/펼치기 상태(설정·보드 등 UI) — 사용자가 접어둔 섹션 키 목록을 저장한다.
// 키 값 자체는 화이트리스트 검증하지 않는다(프론트가 키 체계를 소유 — 동적 보드 섹션 키 포함).
const COLLAPSED_SECTIONS_MAX = 100;
const COLLAPSED_SECTION_KEY_MAX_LEN = 64;

// 배열이고, 개수 ≤100, 각 원소가 string이며 트림 후 1~64자인지 검증.
export function isValidCollapsedSections(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  if (value.length > COLLAPSED_SECTIONS_MAX) return false;
  return value.every((v) => {
    if (typeof v !== 'string') return false;
    const len = v.trim().length;
    return len >= 1 && len <= COLLAPSED_SECTION_KEY_MAX_LEN;
  });
}

// 트림 + 중복 제거. 빈 배열은 null로 정규화(전부 펼침과 동일 의미이므로 저장 안 함).
export function normalizeCollapsedSections(value: string[]): string[] | null {
  const trimmed = value.map((v) => v.trim());
  const deduped = Array.from(new Set(trimmed));
  return deduped.length ? deduped : null;
}
