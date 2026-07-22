// 태그 키워드 자동부착의 매칭 로직 공용 모듈.
// 매칭 대상(커버리지): content · ogTitle · ogDescription · siteName(단일 컬럼) +
// links jsonb 원소의 ogTitle/ogDescription/siteName. 키워드 중 하나라도(OR) 부분일치하면 매칭.
// 대소문자 무시(ILIKE '%kw%' == JS toLowerCase().includes). q 검색과 동일하게 %·_ 이스케이프는 안 한다.

export interface KeywordMatchSource {
  content?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  siteName?: string | null;
  links?: Array<{
    ogTitle?: string | null;
    ogDescription?: string | null;
    siteName?: string | null;
  }> | null;
}

/** 메시지의 매칭 대상 텍스트를 소문자로 이어붙인 건초더미(줄바꿈 구분). */
export function keywordHaystack(msg: KeywordMatchSource): string {
  const parts: string[] = [];
  const push = (v?: string | null) => {
    if (v) parts.push(v);
  };
  push(msg.content);
  push(msg.ogTitle);
  push(msg.ogDescription);
  push(msg.siteName);
  for (const l of msg.links ?? []) {
    push(l?.ogTitle);
    push(l?.ogDescription);
    push(l?.siteName);
  }
  return parts.join('\n').toLowerCase();
}

/** 주어진 태그들 중 이 메시지의 키워드에 매칭되는 것만 (신규 메시지 저장 시 in-JS 매칭). */
export function matchKeywordTags<T extends { keywords?: string[] | null }>(
  msg: KeywordMatchSource,
  tags: T[],
): T[] {
  const hay = keywordHaystack(msg);
  return tags.filter((t) =>
    (t.keywords ?? []).some((kw) => !!kw && hay.includes(kw.toLowerCase())),
  );
}

/** 소급 부착용 raw SQL: 키워드 매칭되는 본인 메시지에 태그를 message_tags로 삽입(중복은 스킵).
 *  message_tags PK(messageId, tagId) 덕에 ON CONFLICT DO NOTHING으로 중복 삽입을 막는다.
 *  keywords는 sanitize된 '1개 이상' 배열이라고 가정(빈 배열이면 호출하지 말 것). */
export function retroAttachSql(
  userId: string,
  tagId: string,
  keywords: string[],
): { sql: string; params: unknown[] } {
  const params: unknown[] = [tagId, userId];
  const ors: string[] = [];
  for (const kw of keywords) {
    params.push(`%${kw}%`);
    const p = `$${params.length}`;
    ors.push(
      `(m.content ILIKE ${p} OR m."ogTitle" ILIKE ${p} OR m."ogDescription" ILIKE ${p} OR m."siteName" ILIKE ${p} OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(m."links", '[]'::jsonb)) e WHERE e->>'ogTitle' ILIKE ${p} OR e->>'ogDescription' ILIKE ${p} OR e->>'siteName' ILIKE ${p}))`,
    );
  }
  const sql = `INSERT INTO message_tags ("messageId", "tagId")
    SELECT m.id, $1 FROM messages m
    WHERE m."userId" = $2 AND (${ors.join(' OR ')})
    ON CONFLICT DO NOTHING`;
  return { sql, params };
}
