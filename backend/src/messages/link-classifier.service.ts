import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LinkPreview } from './link-preview.service';
import type { LinkMeta, LinkType } from './message.entity';

export interface Classification {
  linkType: LinkType | null;
  linkMeta: LinkMeta | null;
}

// JSON-LD 노드는 형태가 제각각이라 느슨하게 다룬다.
type JsonLd = Record<string, any>;

const GEOCODE_TIMEOUT_MS = 3000;
const YOUTUBE_OEMBED_TIMEOUT_MS = 3000;

// JSON-LD @type이 이 키워드를 포함하면 장소로 본다(하위 타입까지 문자열 매칭).
const PLACE_TYPE_KEYWORDS = [
  'restaurant',
  'cafeorcoffeeshop',
  'coffeeshop',
  'foodestablishment',
  'localbusiness',
  'store',
  'place',
];

const VIDEO_HOSTS = ['youtube.com', 'youtu.be', 'vimeo.com', 'tiktok.com'];

@Injectable()
export class LinkClassifierService {
  private readonly logger = new Logger(LinkClassifierService.name);

  constructor(private readonly config: ConfigService) {}

  /** 링크를 place|video|item|article로 자동 구분한다.
   *  판단 불가·오류는 { linkType: null, linkMeta: null } — 절대 예외를 던지지 않는다.
   *  신호 우선순위: URL 패턴 → JSON-LD → og 메타. */
  async classify(
    finalUrl: string,
    html: string,
    preview: LinkPreview,
  ): Promise<Classification> {
    try {
      let url: URL | null = null;
      try {
        url = new URL(finalUrl);
      } catch {
        url = null;
      }
      const nodes = this.extractJsonLd(html);
      const ogType = (this.meta(html, 'og:type') ?? '').toLowerCase();

      // 1) place — URL에 좌표가 박혀 있어 가장 확실하다.
      const place = this.classifyPlace(url, preview, nodes);
      if (place) {
        await this.enrichGeo(place); // 좌표 없으면 지오코딩(키 있을 때만)
        await this.enrichPlaceDetails(place); // 주소·전화 없으면 카카오 장소검색으로 보완(키 있을 때만)
        return { linkType: 'place', linkMeta: this.nullIfEmpty(place) };
      }

      // 2) video
      const video = await this.classifyVideo(url, html, nodes, ogType);
      if (video) return { linkType: 'video', linkMeta: this.nullIfEmpty(video) };

      // 3) item
      const item = this.classifyItem(html, nodes, ogType);
      if (item) return { linkType: 'item', linkMeta: this.nullIfEmpty(item) };

      // 4) article
      const article = this.classifyArticle(html, nodes, ogType);
      if (article) {
        return { linkType: 'article', linkMeta: this.nullIfEmpty(article) };
      }

      return { linkType: null, linkMeta: null };
    } catch (error) {
      this.logger.warn(`link classify failed for ${finalUrl}: ${String(error)}`);
      return { linkType: null, linkMeta: null };
    }
  }

  // ── place ────────────────────────────────────────────────────────────────

  private classifyPlace(
    url: URL | null,
    preview: LinkPreview,
    nodes: JsonLd[],
  ): LinkMeta | null {
    // URL 패턴이 최우선(좌표 포함). 부족한 필드는 JSON-LD로 보완한다.
    const byUrl = this.placeByUrl(url, preview);
    if (byUrl) {
      const byLd = this.placeByJsonLd(nodes);
      return { ...(byLd ?? {}), ...this.prune(byUrl) };
    }
    return this.placeByJsonLd(nodes);
  }

  private placeByUrl(url: URL | null, preview: LinkPreview): LinkMeta | null {
    if (!url) return null;
    return (
      this.naverPlace(url, preview) ??
      this.kakaoPlace(url, preview) ??
      this.googleMaps(url, preview)
    );
  }

  /** map.naver.com — 쿼리 c={lng},{lat},... (좌표는 소수점이 있어야 채택). */
  private naverPlace(url: URL, preview: LinkPreview): LinkMeta | null {
    const host = url.hostname.toLowerCase();
    if (host !== 'map.naver.com' && !host.endsWith('place.naver.com')) {
      return null;
    }
    const meta: LinkMeta = {};
    const c = url.searchParams.get('c');
    if (c) {
      const parts = c.split(',');
      // 정수(줌 레벨 등) 오탐 방지: 좌표는 소수점을 갖는다.
      if (parts[0]?.includes('.') && parts[1]?.includes('.')) {
        const lng = Number(parts[0]);
        const lat = Number(parts[1]);
        if (this.validLatLng(lat, lng)) {
          meta.lat = lat;
          meta.lng = lng;
        }
      }
    }
    if (preview.title) meta.placeName = preview.title;
    return meta;
  }

  /** place.map.kakao.com/{id} (이름만) · map.kakao.com/link/map/{name},{lat},{lng}. */
  private kakaoPlace(url: URL, preview: LinkPreview): LinkMeta | null {
    const host = url.hostname.toLowerCase();
    if (host === 'place.map.kakao.com') {
      const meta: LinkMeta = {};
      if (preview.title) meta.placeName = preview.title;
      return meta;
    }
    if (host === 'map.kakao.com' && /\/link\/(map|to|roadview)\//.test(url.pathname)) {
      const meta: LinkMeta = {};
      const last = this.safeDecode(url.pathname.split('/').pop() ?? '');
      const tokens = last.split(',');
      if (tokens.length >= 3) {
        // 형식은 {name},{lat},{lng} — 뒤 두 토큰이 좌표.
        const lat = Number(tokens[tokens.length - 2]);
        const lng = Number(tokens[tokens.length - 1]);
        const name = tokens.slice(0, tokens.length - 2).join(',').trim();
        if (this.validLatLng(lat, lng)) {
          meta.lat = lat;
          meta.lng = lng;
        }
        if (name) meta.placeName = name;
      }
      if (!meta.placeName && preview.title) meta.placeName = preview.title;
      return meta;
    }
    return null;
  }

  /** google.com/maps · maps.app.goo.gl — @{lat},{lng} 또는 !3d{lat}!4d{lng}. */
  private googleMaps(url: URL, preview: LinkPreview): LinkMeta | null {
    const host = url.hostname.toLowerCase();
    const isGoogleMaps =
      ((host === 'google.com' || host.endsWith('.google.com')) &&
        url.pathname.startsWith('/maps')) ||
      host === 'maps.app.goo.gl' ||
      (host.endsWith('goo.gl') && url.pathname.startsWith('/maps'));
    if (!isGoogleMaps) return null;

    const meta: LinkMeta = {};
    const full = url.href;
    // 정확한 핀 좌표(!3d!4d)를 뷰 중심(@)보다 우선.
    let m = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(full);
    if (!m) m = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(full);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (this.validLatLng(lat, lng)) {
        meta.lat = lat;
        meta.lng = lng;
      }
    }
    // URL 경로의 실제 장소명이 최우선. og:title은 "Google Maps" 같은 제네릭
    // 값일 때가 많아, 그 경우엔 폴백으로도 쓰지 않는다.
    const fallbackTitle =
      preview.title && !/^google maps$/i.test(preview.title.trim())
        ? preview.title
        : undefined;
    const name = this.googlePlaceName(url) ?? fallbackTitle;
    if (name) meta.placeName = name;
    return meta;
  }

  private googlePlaceName(url: URL): string | undefined {
    const seg = /\/maps\/place\/([^/@]+)/.exec(url.pathname);
    if (!seg) return undefined;
    const decoded = this.safeDecode(seg[1].replace(/\+/g, ' ')).trim();
    return decoded || undefined;
  }

  private placeByJsonLd(nodes: JsonLd[]): LinkMeta | null {
    const node = nodes.find((n) =>
      this.typeList(n).some((t) =>
        PLACE_TYPE_KEYWORDS.some((k) => t.toLowerCase().includes(k)),
      ),
    );
    if (!node) return null;
    const meta: LinkMeta = {};
    if (typeof node.name === 'string' && node.name.trim()) {
      meta.placeName = node.name.trim();
    }
    const address = this.formatAddress(node.address);
    if (address) meta.address = address;
    if (node.geo && typeof node.geo === 'object') {
      const lat = Number(node.geo.latitude);
      const lng = Number(node.geo.longitude);
      if (this.validLatLng(lat, lng)) {
        meta.lat = lat;
        meta.lng = lng;
      }
    }
    if (typeof node.telephone === 'string' && node.telephone.trim()) {
      meta.phone = node.telephone.trim();
    }
    const hours = this.formatHours(node.openingHours);
    if (hours) meta.hours = hours;
    return meta;
  }

  /** PostalAddress면 지역+시군구+상세 순으로 조합, 문자열이면 그대로. */
  private formatAddress(address: unknown): string | undefined {
    if (!address) return undefined;
    if (typeof address === 'string') return address.trim() || undefined;
    if (Array.isArray(address)) return this.formatAddress(address[0]);
    if (typeof address === 'object') {
      const a = address as Record<string, unknown>;
      const parts = [a.addressRegion, a.addressLocality, a.streetAddress]
        .filter((p): p is string => typeof p === 'string' && p.trim() !== '')
        .map((p) => p.trim());
      return parts.length ? parts.join(' ') : undefined;
    }
    return undefined;
  }

  /** openingHours: 배열이면 join, 문자열이면 그대로. Specification 객체는 생략. */
  private formatHours(hours: unknown): string | undefined {
    if (!hours) return undefined;
    if (typeof hours === 'string') return hours.trim() || undefined;
    if (Array.isArray(hours)) {
      const strs = hours
        .filter((h): h is string => typeof h === 'string')
        .map((h) => h.trim())
        .filter(Boolean);
      return strs.length ? strs.join(', ') : undefined;
    }
    return undefined;
  }

  /** 좌표가 없고 주소·이름이 있으면 카카오 로컬 REST로 채운다(키 있을 때만). */
  private async enrichGeo(meta: LinkMeta): Promise<void> {
    if (meta.lat != null && meta.lng != null) return;
    const key = this.config.get<string>('KAKAO_REST_API_KEY');
    if (!key) {
      this.logger.debug('KAKAO_REST_API_KEY 미설정 — 지오코딩 스킵');
      return;
    }
    const address = meta.address?.trim();
    const name = meta.placeName?.trim();
    try {
      if (address) {
        const c = await this.kakaoGeocode('address', address, key);
        if (c) {
          meta.lat = c.lat;
          meta.lng = c.lng;
          return;
        }
      }
      const keyword = name || address;
      if (keyword) {
        const c = await this.kakaoGeocode('keyword', keyword, key);
        if (c) {
          meta.lat = c.lat;
          meta.lng = c.lng;
        }
      }
    } catch (error) {
      this.logger.debug(`지오코딩 실패: ${String(error)}`);
    }
  }

  /** 지도 공유 링크(좌표·이름만 있는 SPA 페이지)의 빈 주소·전화를 카카오 장소검색으로 채운다.
   *  좌표가 있으면 그 근처(반경 1km, 거리순)로 좁혀 오탐을 줄인다. 영업시간은 카카오 로컬에
   *  없어서 JSON-LD가 있는 페이지에서만 온다(placeByJsonLd). 실패는 조용히 무시. */
  private async enrichPlaceDetails(meta: LinkMeta): Promise<void> {
    if (meta.address && meta.phone) return;
    const name = meta.placeName?.trim();
    if (!name) return;
    const key = this.config.get<string>('KAKAO_REST_API_KEY');
    if (!key) return; // enrichGeo와 동일 — 키 없으면 스킵(디버그 로그는 거기서 이미 남김)
    try {
      const docs = await this.kakaoLocalSearch('keyword', name, key, {
        lat: meta.lat,
        lng: meta.lng,
      });
      const doc = docs[0];
      if (!doc) return;
      if (!meta.address) {
        const address =
          (typeof doc.road_address_name === 'string' && doc.road_address_name.trim()) ||
          (typeof doc.address_name === 'string' && doc.address_name.trim()) ||
          '';
        if (address) meta.address = address;
      }
      if (!meta.phone && typeof doc.phone === 'string' && doc.phone.trim()) {
        meta.phone = doc.phone.trim();
      }
    } catch (error) {
      this.logger.debug(`장소 상세 보완 실패: ${String(error)}`);
    }
  }

  private async kakaoGeocode(
    kind: 'address' | 'keyword',
    query: string,
    key: string,
  ): Promise<{ lat: number; lng: number } | null> {
    const docs = await this.kakaoLocalSearch(kind, query, key);
    const doc = docs[0];
    if (!doc?.x || !doc?.y) return null;
    const lng = Number(doc.x); // 카카오는 x=경도, y=위도
    const lat = Number(doc.y);
    return this.validLatLng(lat, lng) ? { lat, lng } : null;
  }

  /** 카카오 로컬 검색 공통 호출 — 지오코딩(enrichGeo)과 상세 보완(enrichPlaceDetails)이 공유.
   *  near가 있으면 그 좌표 반경 1km 거리순으로 정렬해 동명 장소 오탐을 줄인다. */
  private async kakaoLocalSearch(
    kind: 'address' | 'keyword',
    query: string,
    key: string,
    near?: { lat?: number; lng?: number },
  ): Promise<
    Array<{
      x?: string;
      y?: string;
      road_address_name?: string;
      address_name?: string;
      phone?: string;
    }>
  > {
    const params = new URLSearchParams({ query });
    if (kind === 'keyword' && near?.lat != null && near?.lng != null) {
      params.set('x', String(near.lng));
      params.set('y', String(near.lat));
      params.set('radius', '1000');
      params.set('sort', 'distance');
    }
    const endpoint = `https://dapi.kakao.com/v2/local/search/${kind}.json?${params.toString()}`;
    const res = await fetch(endpoint, {
      headers: { Authorization: `KakaoAK ${key}` },
      signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      documents?: Array<{
        x?: string;
        y?: string;
        road_address_name?: string;
        address_name?: string;
        phone?: string;
      }>;
    };
    return data.documents ?? [];
  }

  // ── video ────────────────────────────────────────────────────────────────

  private async classifyVideo(
    url: URL | null,
    html: string,
    nodes: JsonLd[],
    ogType: string,
  ): Promise<LinkMeta | null> {
    const host = url?.hostname.toLowerCase() ?? '';
    const isVideoHost = VIDEO_HOSTS.some(
      (d) => host === d || host.endsWith('.' + d),
    );
    if (!isVideoHost && !ogType.includes('video')) return null;

    const meta: LinkMeta = {};
    const videoNode = nodes.find((n) =>
      this.typeList(n).some((t) => t.toLowerCase() === 'videoobject'),
    );

    let durationSec: number | undefined;
    if (videoNode?.duration != null) {
      durationSec = this.parseDuration(String(videoNode.duration));
    }
    if (durationSec == null) {
      const raw =
        this.metaItemprop(html, 'duration') ??
        this.meta(html, 'og:video:duration') ??
        this.meta(html, 'video:duration');
      if (raw) durationSec = this.parseDuration(raw);
    }
    if (durationSec != null) meta.durationSec = durationSec;

    const channel =
      this.personName(videoNode, ['author', 'creator']) ??
      this.authorFromNodes(nodes, ['author', 'creator']);
    if (channel) meta.channel = channel;

    // 유튜브는 봇 UA에 JSON-LD author를 안 주는 경우가 있어, channel이
    // 비어 있으면 공식 oEmbed(키 불필요)로 보완한다.
    if (!meta.channel && url) {
      const isYouTube =
        host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be';
      if (isYouTube) {
        const oembedChannel = await this.youtubeOEmbedChannel(url.href);
        if (oembedChannel) meta.channel = oembedChannel;
      }
    }

    return meta;
  }

  /** 유튜브 공식 oEmbed(키 불필요)로 채널명(author_name)만 보완한다. 실패는 조용히 무시. */
  private async youtubeOEmbedChannel(
    originalUrl: string,
  ): Promise<string | undefined> {
    try {
      const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(
        originalUrl,
      )}&format=json`;
      const res = await fetch(endpoint, {
        signal: AbortSignal.timeout(YOUTUBE_OEMBED_TIMEOUT_MS),
      });
      if (!res.ok) return undefined;
      const data = (await res.json()) as { author_name?: string };
      const name = data.author_name?.trim();
      return name || undefined;
    } catch (error) {
      this.logger.debug(`youtube oEmbed 실패: ${String(error)}`);
      return undefined;
    }
  }

  // ── item ─────────────────────────────────────────────────────────────────

  private classifyItem(
    html: string,
    nodes: JsonLd[],
    ogType: string,
  ): LinkMeta | null {
    const productNode = nodes.find((n) =>
      this.typeList(n).some((t) => t.toLowerCase() === 'product'),
    );
    if (!ogType.includes('product') && !productNode) return null;

    const meta: LinkMeta = {};
    let price: unknown;
    let currency: unknown;
    if (productNode) {
      const offer = this.extractOffer(productNode.offers);
      price = offer.price;
      currency = offer.currency;
    }
    if (price == null) price = this.meta(html, 'product:price:amount');
    if (currency == null) currency = this.meta(html, 'product:price:currency');

    const num = this.parsePrice(price);
    if (num != null) meta.price = num;
    if (typeof currency === 'string' && currency.trim()) {
      meta.currency = currency.trim().toUpperCase();
    } else if (meta.price != null) {
      meta.currency = 'KRW'; // 계약상 기본 통화
    }
    return meta;
  }

  /** offers: 객체·배열·AggregateOffer 모두에서 가격/통화를 끄집어낸다. */
  private extractOffer(offers: unknown): { price?: unknown; currency?: unknown } {
    if (!offers) return {};
    const o = Array.isArray(offers) ? offers[0] : offers;
    if (!o || typeof o !== 'object') return {};
    const offer = o as Record<string, unknown>;
    return {
      price: offer.price ?? offer.lowPrice,
      currency: offer.priceCurrency,
    };
  }

  // ── article ──────────────────────────────────────────────────────────────

  private classifyArticle(
    html: string,
    nodes: JsonLd[],
    ogType: string,
  ): LinkMeta | null {
    const articleNode = nodes.find((n) =>
      this.typeList(n).some((t) =>
        ['article', 'newsarticle', 'blogposting'].includes(t.toLowerCase()),
      ),
    );
    if (!ogType.includes('article') && !articleNode) return null;

    const meta: LinkMeta = {};
    const author =
      this.personName(articleNode, ['author', 'creator']) ??
      this.authorFromNodes(nodes, ['author']) ??
      this.meta(html, 'author') ??
      undefined;
    if (author) meta.author = author;
    return meta;
  }

  // ── JSON-LD ──────────────────────────────────────────────────────────────

  /** <script type="application/ld+json"> 블록 전부 수집. 배열·@graph는 펼친다.
   *  개별 JSON.parse 실패는 조용히 무시한다. */
  private extractJsonLd(html: string): JsonLd[] {
    const out: JsonLd[] = [];
    const re =
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(html)) !== null) {
      const raw = match[1].trim();
      if (!raw) continue;
      try {
        this.collectNodes(JSON.parse(raw), out);
      } catch {
        // 개별 블록 파싱 실패는 무시
      }
    }
    return out;
  }

  private collectNodes(node: unknown, out: JsonLd[]): void {
    if (Array.isArray(node)) {
      for (const n of node) this.collectNodes(n, out);
      return;
    }
    if (node && typeof node === 'object') {
      const obj = node as JsonLd;
      out.push(obj);
      if (Array.isArray(obj['@graph'])) {
        for (const n of obj['@graph']) this.collectNodes(n, out);
      }
    }
  }

  private typeList(node: JsonLd): string[] {
    const t = node?.['@type'];
    if (!t) return [];
    return (Array.isArray(t) ? t : [t]).map((x) => String(x));
  }

  /** author/creator 등에서 사람/조직 이름을 뽑는다(문자열·객체·배열 대응). */
  private personName(
    node: JsonLd | undefined,
    keys: string[],
  ): string | undefined {
    if (!node) return undefined;
    for (const key of keys) {
      const value = node[key];
      if (!value) continue;
      const first = Array.isArray(value) ? value[0] : value;
      if (typeof first === 'string' && first.trim()) return first.trim();
      if (
        first &&
        typeof first === 'object' &&
        typeof first.name === 'string' &&
        first.name.trim()
      ) {
        return first.name.trim();
      }
    }
    return undefined;
  }

  private authorFromNodes(nodes: JsonLd[], keys: string[]): string | undefined {
    for (const n of nodes) {
      const name = this.personName(n, keys);
      if (name) return name;
    }
    return undefined;
  }

  // ── 파서 유틸 ─────────────────────────────────────────────────────────────

  /** ISO8601(PT#H#M#S) 또는 초 단위 숫자를 초로 변환. */
  private parseDuration(value: string): number | undefined {
    const v = value.trim();
    if (/^\d+$/.test(v)) return Number(v) || undefined;
    const m = /^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(v);
    if (m) {
      const total =
        Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
      return total > 0 ? total : undefined;
    }
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  /** 통화기호·콤마를 벗기고 숫자만 뽑는다. "₩12,000" → 12000. */
  private parsePrice(value: unknown): number | undefined {
    if (value == null) return undefined;
    const raw = String(value).replace(/,/g, '');
    const m = /-?\d+(?:\.\d+)?/.exec(raw);
    if (!m) return undefined;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : undefined;
  }

  private validLatLng(lat: number, lng: number): boolean {
    return (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180 &&
      !(lat === 0 && lng === 0)
    );
  }

  private safeDecode(value: string): string {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  /** 정의된 값만 남긴 얕은 복사(undefined·null·빈문자열 제거). */
  private prune(meta: LinkMeta): LinkMeta {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(meta)) {
      if (v !== undefined && v !== null && v !== '') out[k] = v;
    }
    return out as LinkMeta;
  }

  private nullIfEmpty(meta: LinkMeta): LinkMeta | null {
    const pruned = this.prune(meta);
    return Object.keys(pruned).length ? pruned : null;
  }

  // ── meta 태그 리더 (분류 전용 최소 구현) ──────────────────────────────────

  /** og/name 메타를 읽는다. property·name 어느 쪽이든, 순서 무관하게 매칭. */
  private meta(html: string, name: string): string | null {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(
        `<meta[^>]+(?:property|name)=["']${esc}["'][^>]*content=["']([^"']*)["']`,
        'i',
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${esc}["']`,
        'i',
      ),
    ];
    for (const p of patterns) {
      const m = html.match(p);
      if (m?.[1]) return this.decodeBasic(m[1].trim());
    }
    return null;
  }

  /** itemprop 메타(예: <meta itemprop="duration" content="PT4M20S">). */
  private metaItemprop(html: string, name: string): string | null {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(
        `<meta[^>]+itemprop=["']${esc}["'][^>]*content=["']([^"']*)["']`,
        'i',
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']*)["'][^>]*itemprop=["']${esc}["']`,
        'i',
      ),
    ];
    for (const p of patterns) {
      const m = html.match(p);
      if (m?.[1]) return m[1].trim();
    }
    return null;
  }

  /** 흔한 HTML 엔티티만 최소 디코드(og:type·통화·이름 정도라 이걸로 충분). */
  private decodeBasic(text: string): string {
    return text
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&apos;/gi, "'")
      .replace(/&amp;/g, '&');
  }
}
