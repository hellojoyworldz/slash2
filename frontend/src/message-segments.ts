import { Message, MessageLink } from './api';

// 본문 세그먼트: 텍스트 조각 또는 링크 카드. 입력 순서 그대로 교차 렌더한다.
// (MessageBubble·MessageDetail·NoticeBanner 공용 — 분할 로직 중복 구현 금지.)
export type Segment =
  | { type: 'text'; value: string }
  | { type: 'card'; link: MessageLink };

// content를 각 링크 url의 "첫 등장 위치" 기준으로 잘라 [텍스트][카드]… 세그먼트로 만든다.
// - 같은 url이 여러 번이면 첫 위치에만 카드, 이후 등장은 url 문자열째 제거(카드도 안 붙인다).
// - 같은 위치에서 겹치는 url(접두어 관계)은 더 긴 url을 택해 온전한 링크를 카드로 만든다.
export function splitSegments(content: string, links: MessageLink[]): Segment[] {
  const urls = links.map((l) => l.url).filter((u): u is string => !!u);
  const linkByUrl = new Map(links.map((l) => [l.url, l]));
  const segs: Segment[] = [];
  const carded = new Set<string>();
  let cursor = 0;
  while (cursor < content.length) {
    let bestIdx = -1;
    let bestUrl: string | null = null;
    for (const url of urls) {
      const idx = content.indexOf(url, cursor);
      if (idx < 0) continue;
      if (
        bestIdx === -1 ||
        idx < bestIdx ||
        (idx === bestIdx && bestUrl != null && url.length > bestUrl.length)
      ) {
        bestIdx = idx;
        bestUrl = url;
      }
    }
    if (bestIdx === -1 || bestUrl == null) {
      segs.push({ type: 'text', value: content.slice(cursor) });
      break;
    }
    if (bestIdx > cursor) {
      segs.push({ type: 'text', value: content.slice(cursor, bestIdx) });
    }
    if (!carded.has(bestUrl)) {
      const link = linkByUrl.get(bestUrl);
      if (link) segs.push({ type: 'card', link });
      carded.add(bestUrl);
    }
    cursor = bestIdx + bestUrl.length;
  }
  return segs;
}

// 렌더에 쓸 링크 배열을 정규화한다.
// - 서버가 준 links(등장 순서·중복 제거)가 있으면 그대로.
// - 없으면(구 메시지·단일 링크 폴백) 레거시 단일 필드로 MessageLink 하나를 합성.
// - 순수 텍스트(메모)면 빈 배열.
export function effectiveLinks(message: Message): MessageLink[] {
  if (Array.isArray(message.links) && message.links.length > 0) {
    return message.links;
  }
  if (message.kind === 'link' && message.url) {
    return [
      {
        url: message.url,
        ogTitle: message.ogTitle,
        ogDescription: message.ogDescription,
        ogImage: message.ogImage,
        siteName: message.siteName,
        linkType: message.linkType ?? null,
        linkMeta: message.linkMeta ?? null,
      },
    ];
  }
  return [];
}

// 공지 배너 한 줄 문구 = "입력 순서 기준 첫 내용".
// content의 첫 텍스트 세그먼트(공백 제외)가 있으면 그것, 없으면(링크로 시작) 첫 링크의 ogTitle??url.
// 링크가 아예 없으면 content 전체(메모).
export function bannerPreviewText(message: Message): string {
  const links = effectiveLinks(message);
  if (links.length > 0) {
    for (const seg of splitSegments(message.content, links)) {
      if (seg.type === 'text') {
        const v = seg.value.trim();
        if (v) return v;
      } else {
        return seg.link.ogTitle ?? seg.link.url;
      }
    }
  }
  return message.content.trim();
}
