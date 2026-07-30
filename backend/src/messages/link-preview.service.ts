import { Injectable, Logger } from '@nestjs/common';

export interface LinkPreview {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

export interface LinkPreviewResult {
  preview: LinkPreview;
  /** 분류기 입력용 원본 HTML(실패 시 null). */
  html: string | null;
  /** 리다이렉트가 해소된 최종 URL — naver.me 단축링크 등이 여기서 풀린다. */
  finalUrl: string | null;
}

const MAX_HTML_BYTES = 512 * 1024;
// JSON API 응답(카카오 장소 API 등) 캡 — 실측 응답이 50~56KB라 넉넉히 5배.
const MAX_JSON_BYTES = 256 * 1024;
// 1차(봇 UA)는 짧게, 2차(브라우저 UA) 폴백은 조금 더 준다 — 총 소요를 ~9초로 묶는다.
const FIRST_TIMEOUT_MS = 4000;
const SECOND_TIMEOUT_MS = 5000;

// 1차: 봇 UA. 일부 사이트(트위터 등)는 봇 UA에만 OG 태그를 내려준다.
// export — 네이버 장소 상세 2차 재요청(link-classifier.service.ts)도 같은 UA를 쓴다.
export const BOT_UA = 'facebookexternalhit/1.1 (+slash2 link preview)';
export const BOT_ACCEPT = 'text/html,application/xhtml+xml';
// 2차 폴백: 최신 Chrome desktop UA + 일반 브라우저 Accept.
// 봇 UA를 차단(403 등)하거나 봇 UA엔 OG를 안 주는 사이트(쿠팡·인스타 등)를 위한 재시도.
// export — 유튜브 전용 2차 재요청(link-classifier.service.ts)도 같은 UA를 쓴다.
export const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
export const BROWSER_ACCEPT =
  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8';

// 단발 fetch 시도의 결과. hasContent = html 파싱 + og(title/description/image) 최소 1개.
// hasContent가 false면 다음 UA로 재시도한다.
interface FetchAttempt {
  preview: LinkPreview;
  html: string | null;
  finalUrl: string | null;
  hasContent: boolean;
}

function emptyPreview(): LinkPreview {
  return { title: null, description: null, image: null, siteName: null };
}

@Injectable()
export class LinkPreviewService {
  private readonly logger = new Logger(LinkPreviewService.name);

  /** 페이지를 받아 미리보기(OG)와, 분류기가 쓸 원본 HTML·최종 URL을 함께 돌려준다.
   *  실패해도 예외를 던지지 않는다 — 미리보기는 없으면 없는 대로 저장한다.
   *  1차 봇 UA로 시도하고, og가 전무하거나(봇 차단·og 미제공) 실패하면 브라우저 UA로 1회 재시도한다. */
  async fetchPage(url: string): Promise<LinkPreviewResult> {
    const first = await this.attempt(
      url,
      BOT_UA,
      BOT_ACCEPT,
      FIRST_TIMEOUT_MS,
      'bot',
    );
    if (first.hasContent) {
      return {
        preview: first.preview,
        html: first.html,
        finalUrl: first.finalUrl ?? url,
      };
    }

    // 1차가 og 전무·실패 — 브라우저 UA로 폴백.
    this.logger.warn(`link preview retrying with browser UA for ${url}`);
    const second = await this.attempt(
      url,
      BROWSER_UA,
      BROWSER_ACCEPT,
      SECOND_TIMEOUT_MS,
      'browser',
    );
    if (second.hasContent) {
      return {
        preview: second.preview,
        html: second.html,
        finalUrl: second.finalUrl ?? url,
      };
    }

    // 둘 다 og 전무 — 분류기 입력용 html이라도 있는 쪽을 살려서 반환한다(빈 미리보기라도
    // 전송은 막지 않는 기존 설계 유지). 둘 다 html이 없으면 1차 결과(빈 값)를 반환.
    const best = first.html ? first : second.html ? second : first;
    this.logger.warn(`link preview empty after fallback for ${url}`);
    return {
      preview: best.preview,
      html: best.html,
      finalUrl: best.finalUrl ?? first.finalUrl ?? second.finalUrl,
    };
  }

  /** 임의 UA·바이트 캡으로 페이지를 한 번 받아 HTML만 돌려준다(og 파싱 없음).
   *  classifier가 특정 사이트(유튜브 등)를 더 큰 캡으로 재요청할 때 쓴다.
   *  실패(네트워크·타임아웃·non-ok·non-html)는 조용히 null — 예외를 던지지 않는다. */
  async fetchCapped(
    url: string,
    opts: {
      userAgent: string;
      accept: string;
      timeoutMs: number;
      maxBytes: number;
    },
  ): Promise<string | null> {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(opts.timeoutMs),
        headers: {
          'User-Agent': opts.userAgent,
          Accept: opts.accept,
          'Accept-Language': 'ko,en;q=0.8',
        },
      });
      if (!response.ok) return null;
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('html')) return null;
      return await this.readHtml(response, opts.maxBytes);
    } catch (error) {
      this.logger.debug(`fetchCapped 실패 for ${url}: ${String(error)}`);
      return null;
    }
  }

  /** 임의 UA·헤더로 JSON API 엔드포인트를 한 번 받아 파싱해 돌려준다(카카오 장소 API
   *  등, 페이지가 아니라 API라 fetchCapped와 별도). 바이트 캡까지만 읽어 대형 응답을
   *  방어한다(readHtml 재사용 — charset 디코딩 로직이 JSON에도 그대로 유효, content-type
   *  의 charset을 그대로 따라간다). content-type이 json이 아니거나, 캡 초과로 잘려
   *  JSON.parse가 실패하거나, 네트워크 실패면 조용히 null — 예외를 던지지 않는다. */
  async fetchJson<T = unknown>(
    url: string,
    opts: {
      userAgent: string;
      accept?: string;
      headers?: Record<string, string>;
      timeoutMs: number;
      maxBytes?: number;
    },
  ): Promise<T | null> {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(opts.timeoutMs),
        headers: {
          'User-Agent': opts.userAgent,
          Accept: opts.accept ?? 'application/json',
          ...opts.headers,
        },
      });
      if (!response.ok) return null;
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('json')) return null;
      const text = await this.readHtml(
        response,
        opts.maxBytes ?? MAX_JSON_BYTES,
      );
      return JSON.parse(text) as T;
    } catch (error) {
      this.logger.debug(`fetchJson 실패 for ${url}: ${String(error)}`);
      return null;
    }
  }

  /** UA 한 벌로 페이지를 한 번 받아본다. 모든 실패 경로(non-ok·non-html·예외·og 전무)를
   *  URL과 함께 warn 로깅해 어떤 사이트가 왜 실패하는지 흔적을 남긴다. 예외를 던지지 않는다. */
  private async attempt(
    url: string,
    userAgent: string,
    accept: string,
    timeoutMs: number,
    label: string,
  ): Promise<FetchAttempt> {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'User-Agent': userAgent,
          Accept: accept,
          'Accept-Language': 'ko,en;q=0.8',
        },
      });
      const finalUrl = response.url || url;
      const contentType = response.headers.get('content-type') ?? '';
      if (!response.ok) {
        this.logger.warn(
          `link preview [${label}] non-ok(${response.status}) for ${url}`,
        );
        return {
          preview: emptyPreview(),
          html: null,
          finalUrl,
          hasContent: false,
        };
      }
      if (!contentType.includes('html')) {
        this.logger.warn(
          `link preview [${label}] non-html(${contentType || '?'}) for ${url}`,
        );
        return {
          preview: emptyPreview(),
          html: null,
          finalUrl,
          hasContent: false,
        };
      }
      const html = await this.readHtml(response);
      const preview = this.parsePreview(html, finalUrl);
      const hasContent = !!(
        preview.title ||
        preview.description ||
        preview.image
      );
      if (!hasContent) {
        this.logger.warn(`link preview [${label}] no-og for ${url}`);
      }
      return { preview, html, finalUrl, hasContent };
    } catch (error) {
      this.logger.warn(
        `link preview [${label}] error for ${url}: ${String(error)}`,
      );
      return {
        preview: emptyPreview(),
        html: null,
        finalUrl: null,
        hasContent: false,
      };
    }
  }

  /** 받은 HTML에서 OG/twitter 메타를 뽑아 미리보기로 만든다. */
  private parsePreview(html: string, baseUrl: string): LinkPreview {
    const pick = (...names: string[]) => {
      for (const name of names) {
        const value = this.metaContent(html, name);
        if (value) return value;
      }
      return null;
    };
    let hostname: string | null = null;
    try {
      hostname = new URL(baseUrl).hostname;
    } catch {
      hostname = null;
    }
    return {
      title: pick('og:title', 'twitter:title') ?? this.titleTag(html),
      description: pick('og:description', 'twitter:description', 'description'),
      image: this.resolveUrl(pick('og:image', 'twitter:image'), baseUrl),
      siteName: pick('og:site_name') ?? hostname,
    };
  }

  /** HTML을 캡(기본 512KB, maxBytes로 조절 가능)까지 읽는다. OG 태그는 <head>에 있지만
   *  JSON-LD 구조화 데이터는 <body>에 있는 사이트가 많아, </head>에서 끊지 않고 캡까지
   *  받아 분류기에 넘긴다. UTF-8 고정이 아니라 헤더/meta의 charset을 감지해 디코딩한다
   *  (EUC-KR 한글 깨짐 방지). */
  private async readHtml(
    response: Response,
    maxBytes: number = MAX_HTML_BYTES,
  ): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) return '';
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    // charset 탐지는 ASCII 범위라 latin1 임시 디코드로 충분하다. charset meta는 문서
    // 앞부분에 있으므로 앞 64KB까지만 누적한다(latin1은 단일바이트라 스트림 상태 불필요).
    const probe = new TextDecoder('latin1');
    let probed = '';
    while (bytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      bytes += value.byteLength;
      if (probed.length < 64 * 1024) {
        probed += probe.decode(value, { stream: true });
      }
    }
    void reader.cancel().catch(() => undefined);

    const buffer = Buffer.concat(chunks);
    const charset = this.detectCharset(
      response.headers.get('content-type') ?? '',
      probed,
    );
    try {
      return new TextDecoder(charset, { fatal: false }).decode(buffer);
    } catch {
      // 미지원 charset이면 utf-8로 폴백
      return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    }
  }

  /** Content-Type 헤더 → <meta charset> 순으로 문자셋을 찾는다. 기본 utf-8. */
  private detectCharset(contentType: string, probedHtml: string): string {
    const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
    const fromMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(probedHtml)?.[1];
    const raw = (fromHeader ?? fromMeta ?? 'utf-8').toLowerCase();
    // 한국 사이트 변형 표기들을 euc-kr로 정규화
    if (
      ['euc-kr', 'ks_c_5601-1987', 'ksc5601', 'cp949', 'windows-949'].includes(
        raw,
      )
    ) {
      return 'euc-kr';
    }
    if (raw === 'utf8') return 'utf-8';
    return raw;
  }

  private metaContent(html: string, name: string): string | null {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // property/name과 content의 순서가 어느 쪽이든 매칭한다.
    const patterns = [
      new RegExp(
        `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`,
        'i',
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`,
        'i',
      ),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return this.decodeEntities(match[1].trim());
    }
    return null;
  }

  private titleTag(html: string): string | null {
    const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return match?.[1] ? this.decodeEntities(match[1].trim()) : null;
  }

  private resolveUrl(value: string | null, base: string): string | null {
    if (!value) return null;
    try {
      return new URL(value, base).toString();
    } catch {
      return null;
    }
  }

  private decodeEntities(text: string): string {
    const fromCode = (code: number): string => {
      try {
        return String.fromCodePoint(code);
      } catch {
        return '';
      }
    };
    return (
      text
        // 숫자 엔티티 (&#52712; / &#xC548;) — 네이버 블로그 등이 한글을 이렇게 내려줌
        .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
          fromCode(parseInt(hex, 16)),
        )
        .replace(/&#(\d+);/g, (_, dec: string) => fromCode(parseInt(dec, 10)))
        // 이름 엔티티 — 표에 있으면 치환, 모르는 건 원문 유지. &amp;는 이중 디코드
        // 방지를 위해 여기서 건너뛰고 마지막에 따로.
        .replace(/&([a-zA-Z]+);/g, (whole, name: string) => {
          const key = name.toLowerCase();
          if (key === 'amp') return whole;
          return NAMED_ENTITIES[key] ?? whole;
        })
        .replace(/&amp;/g, '&')
    );
  }
}

// 실사이트 og 제목·설명에서 실제로 관찰되는 이름 엔티티(문장부호 위주 실용 셋).
// 예: 다음 검색은 제목에 &ndash;를 그대로 내려준다. 목록에 없는 엔티티는 원문 유지.
const NAMED_ENTITIES: Record<string, string> = {
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  middot: '·',
  bull: '•',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  times: '×',
  copy: '©',
  reg: '®',
  trade: '™',
};
