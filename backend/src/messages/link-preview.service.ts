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
const FETCH_TIMEOUT_MS = 5000;

@Injectable()
export class LinkPreviewService {
  private readonly logger = new Logger(LinkPreviewService.name);

  /** 페이지를 한 번 받아 미리보기(OG)와, 분류기가 쓸 원본 HTML·최종 URL을 함께 돌려준다.
   *  실패해도 예외를 던지지 않는다 — 미리보기는 없으면 없는 대로 저장한다. */
  async fetchPage(url: string): Promise<LinkPreviewResult> {
    const empty: LinkPreview = {
      title: null,
      description: null,
      image: null,
      siteName: null,
    };
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          // 일부 사이트(트위터 등)는 봇 UA에만 OG 태그를 내려준다.
          'User-Agent': 'facebookexternalhit/1.1 (+slash2 link preview)',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'ko,en;q=0.8',
        },
      });
      const contentType = response.headers.get('content-type') ?? '';
      if (!response.ok || !contentType.includes('html')) {
        return { preview: empty, html: null, finalUrl: response.url || url };
      }
      const html = await this.readHtml(response);
      const pick = (...names: string[]) => {
        for (const name of names) {
          const value = this.metaContent(html, name);
          if (value) return value;
        }
        return null;
      };
      const preview: LinkPreview = {
        title: pick('og:title', 'twitter:title') ?? this.titleTag(html),
        description: pick(
          'og:description',
          'twitter:description',
          'description',
        ),
        image: this.resolveUrl(pick('og:image', 'twitter:image'), response.url),
        siteName: pick('og:site_name') ?? new URL(response.url).hostname,
      };
      return { preview, html, finalUrl: response.url || url };
    } catch (error) {
      this.logger.warn(`link preview failed for ${url}: ${String(error)}`);
      return { preview: empty, html: null, finalUrl: null };
    }
  }

  /** HTML을 캡(512KB)까지 읽는다. OG 태그는 <head>에 있지만 JSON-LD 구조화 데이터는
   *  <body>에 있는 사이트가 많아, </head>에서 끊지 않고 캡까지 받아 분류기에 넘긴다.
   *  UTF-8 고정이 아니라 헤더/meta의 charset을 감지해 디코딩한다 (EUC-KR 한글 깨짐 방지). */
  private async readHtml(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) return '';
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    // charset 탐지는 ASCII 범위라 latin1 임시 디코드로 충분하다. charset meta는 문서
    // 앞부분에 있으므로 앞 64KB까지만 누적한다(latin1은 단일바이트라 스트림 상태 불필요).
    const probe = new TextDecoder('latin1');
    let probed = '';
    while (bytes < MAX_HTML_BYTES) {
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
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/gi, "'")
        .replace(/&nbsp;/g, ' ')
        // &amp;는 마지막에 (이중 디코드 방지)
        .replace(/&amp;/g, '&')
    );
  }
}
