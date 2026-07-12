import { Injectable, Logger } from '@nestjs/common';

export interface LinkPreview {
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

const MAX_HTML_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 5000;

@Injectable()
export class LinkPreviewService {
  private readonly logger = new Logger(LinkPreviewService.name);

  /** 실패해도 예외를 던지지 않는다 — 미리보기는 없으면 없는 대로 저장한다. */
  async fetch(url: string): Promise<LinkPreview> {
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
        return empty;
      }
      const html = await this.readHead(response);
      const pick = (...names: string[]) => {
        for (const name of names) {
          const value = this.metaContent(html, name);
          if (value) return value;
        }
        return null;
      };
      return {
        title:
          pick('og:title', 'twitter:title') ?? this.titleTag(html),
        description: pick('og:description', 'twitter:description', 'description'),
        image: this.resolveUrl(pick('og:image', 'twitter:image'), response.url),
        siteName: pick('og:site_name') ?? new URL(response.url).hostname,
      };
    } catch (error) {
      this.logger.warn(`link preview failed for ${url}: ${String(error)}`);
      return empty;
    }
  }

  /** HTML 앞부분만 읽는다 — OG 태그는 <head>에 있으므로 전체 다운로드가 필요 없다. */
  private async readHead(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) return '';
    const decoder = new TextDecoder('utf-8', { fatal: false });
    let html = '';
    let bytes = 0;
    while (bytes < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (html.includes('</head>')) break;
    }
    void reader.cancel().catch(() => undefined);
    return html;
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
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&#x27;/gi, "'")
      .replace(/&nbsp;/g, ' ');
  }
}
