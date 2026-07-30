// 링크 URL → "카드 안에서 바로 보는" 공식 임베드 정보.
// 백엔드는 관여하지 않는다 — URL 문자열만 보고 프론트에서 계산한다(API 키·토큰 불필요).
// 지원: 유튜브(일반·쇼츠·라이브) · 인스타그램(게시물·릴스·IGTV) · X(트윗).
// 그 외 도메인은 null → 카드는 기존대로 탭하면 원본을 연다.

export type EmbedProvider = 'youtube' | 'instagram' | 'x';

export interface EmbedInfo {
  provider: EmbedProvider;
  /** iframe(웹)·WebView(네이티브)에 그대로 넣을 임베드 주소. */
  embedUrl: string;
  /** 유튜브 전용 — og:image가 없을 때 쓸 썸네일 폴백용 비디오 ID. */
  videoId?: string;
  /** 세로 화면 콘텐츠(유튜브 쇼츠·인스타 릴스) — 카드가 진짜 9:16 프레임을 쓴다. */
  vertical?: boolean;
  /** 인스타그램 전용 — 게시물 종류(p=피드 게시물, reel=릴스, tv=IGTV). */
  igKind?: 'p' | 'reel' | 'tv';
}

// 프로바이더 표시명(브랜드명이라 번역 대상이 아니다) — 썸네일 없는 접힌 카드의 자리 표시에 쓴다.
export const EMBED_PROVIDER_LABEL: Record<EmbedProvider, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  x: 'X',
};

// 임베드 주소에 그대로 박히는 값이라 문자셋을 좁게 검증한다(주입 방지).
const YT_ID = /^[A-Za-z0-9_-]{6,32}$/;
const IG_CODE = /^[A-Za-z0-9_-]{4,32}$/;
const TWEET_ID = /^\d{1,25}$/;

// 스킴이 빠진 값("youtu.be/xxx")도 받아들인다. 파싱 실패는 조용히 null.
function parseUrl(raw: string): URL | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
}

// www. · m. · mobile. 를 걷어낸 소문자 호스트.
function baseHost(u: URL): string {
  return u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
}

// 빈 조각을 뺀 경로 세그먼트(트레일링 슬래시·중복 슬래시 허용).
function segments(u: URL): string[] {
  return u.pathname.split('/').filter(Boolean);
}

// youtube.com/watch?v= · youtu.be/ · /shorts/ · /live/ · /embed/ · /v/
function youtubeEmbed(u: URL): EmbedInfo | null {
  const host = baseHost(u);
  const seg = segments(u);
  let id: string | null = null;
  let vertical = false;

  if (host === 'youtu.be') {
    id = seg[0] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const head = (seg[0] ?? '').toLowerCase();
    if (head === 'watch') id = u.searchParams.get('v');
    else if (head === 'shorts') {
      id = seg[1] ?? null;
      vertical = true;
    } else if (head === 'live' || head === 'embed' || head === 'v') id = seg[1] ?? null;
  } else {
    return null;
  }

  if (!id || !YT_ID.test(id)) return null;
  return {
    provider: 'youtube',
    videoId: id,
    vertical,
    // nocookie 도메인 = 재생 전까지 추적 쿠키를 심지 않는 공식 임베드 호스트.
    // 카드 탭이 곧 "재생" 의사표시라 autoplay, 모바일 전체화면 전환 방지는 playsinline.
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0`,
  };
}

// instagram.com/p|reel|reels|tv/<code> (계정 경로가 앞에 붙은 /<user>/p/<code> 형태 포함)
const IG_KIND: Record<string, 'p' | 'reel' | 'tv'> = {
  p: 'p',
  reel: 'reel',
  reels: 'reel',
  tv: 'tv',
};

function instagramEmbed(u: URL): EmbedInfo | null {
  if (baseHost(u) !== 'instagram.com') return null;
  const seg = segments(u);
  for (let i = 0; i < seg.length - 1; i += 1) {
    const kind = IG_KIND[seg[i].toLowerCase()];
    if (!kind) continue;
    const code = seg[i + 1];
    if (!code || !IG_CODE.test(code)) return null;
    // captioned = 캡션까지 포함된 공식 임베드(캐러셀은 임베드가 알아서 넘긴다).
    // 릴스는 항상 세로 화면이라 쇼츠와 동일하게 vertical 취급(진짜 9:16, 이미지 비율 측정 불필요).
    return {
      provider: 'instagram',
      embedUrl: `https://www.instagram.com/${kind}/${code}/embed/captioned/`,
      igKind: kind,
      vertical: kind === 'reel',
    };
  }
  return null;
}

// x.com|twitter.com/<user>/status/<id> (i/web/status/<id> 포함)
function xEmbed(u: URL, theme: 'light' | 'dark'): EmbedInfo | null {
  const host = baseHost(u);
  if (host !== 'x.com' && host !== 'twitter.com') return null;
  const seg = segments(u);
  const at = seg.findIndex((s) => {
    const v = s.toLowerCase();
    return v === 'status' || v === 'statuses';
  });
  if (at < 0) return null;
  const id = seg[at + 1];
  if (!id || !TWEET_ID.test(id)) return null;
  // dnt=1 상당의 추적 거부 + 스레드(답글 원문) 숨김. theme는 앱 테마를 그대로 따른다.
  return {
    provider: 'x',
    embedUrl: `https://platform.twitter.com/embed/Tweet.html?id=${id}&dnt=true&hideThread=true&theme=${theme}`,
  };
}

// 카드가 부를 단 하나의 진입점. 어떤 입력에도 던지지 않는다(임베드 불가 = null).
export function getEmbedInfo(
  url: string,
  theme: 'light' | 'dark' = 'light',
): EmbedInfo | null {
  const u = parseUrl(url);
  if (!u) return null;
  try {
    return youtubeEmbed(u) ?? instagramEmbed(u) ?? xEmbed(u, theme);
  } catch {
    return null;
  }
}

// og:image가 비어 있는 유튜브 링크의 썸네일 폴백(공개 CDN, 키 불필요).
export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
