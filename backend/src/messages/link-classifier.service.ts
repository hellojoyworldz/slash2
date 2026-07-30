import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BOT_ACCEPT,
  BOT_UA,
  BROWSER_ACCEPT,
  BROWSER_UA,
  LinkPreviewService,
  type LinkPreview,
} from './link-preview.service';
import type { LinkMeta, LinkType } from './message.entity';

export interface Classification {
  linkType: LinkType | null;
  linkMeta: LinkMeta | null;
  /** 유튜브 등에서 추출한 전체 설명으로 og:description을 대체할 때만 값이 들어간다.
   *  undefined = 대체 안 함(호출부가 기존 og:description을 그대로 씀).
   *  null = 명시적으로 빈 값 — 추출 자체는 성공했는데 원본 설명이 없는 영상(쇼츠 등)이라,
   *  유튜브 일반 소개문 같은 og:description 노이즈보다 빈 게 낫다는 판단.
   *  string = 그 값(2000자 상한 적용)으로 대체. */
  fullDescription?: string | null;
  /** 구글 장소 링크(지도·kgmid 지식그래프 공유)에서만 채워진다 — og:site_name이
   *  "www.google.com"이거나 "이름 · 주소"로 오염돼 있어 "Google Maps"로 정규화한다.
   *  undefined면 호출부가 기존 preview.siteName을 그대로 쓴다. */
  siteName?: string;
}

// JSON-LD 노드는 형태가 제각각이라 느슨하게 다룬다.
type JsonLd = Record<string, any>;

// 유튜브 shortDescription 파싱 결과. matched=false(패턴 미검출)와 matched=true·text=''
// (빈 설명)을 구분해야 해서 단순 string|null로 뭉치지 않는다 — 자세한 의미는
// parseYoutubeShortDescription 주석 참고.
interface YoutubeDescriptionParse {
  matched: boolean;
  text: string;
}

// 요일별 영업시간 원자료 — 네이버·카카오가 각자 형태에서 이 모양으로 만든 뒤
// formatBusinessHours()에 넘긴다(그룹핑·정렬·상한 로직 공유, 중복 구현 방지).
interface HourEntry {
  day: string; // "매일" 또는 "월"·"화"·... 단일 글자 요일
  time: string; // "07:00~22:00" — 이미 정규화된 형태
}

// 카카오 장소 패널 API(place-api.map.kakao.com/places/panel3/{id}) 응답 중 이 파일이
// 쓰는 부분만 최소로 타입화한다(실측 응답 덤프 기준 — 전체 스키마는 훨씬 크다).
interface KakaoPlacePanel {
  open_hours?: {
    week_from_today?: {
      week_periods?: Array<{
        days?: Array<{
          day_of_the_week_desc?: string;
          // on_days가 없으면 그 요일은 휴무(실측: 경복궁 화요일).
          on_days?: { start_end_time_desc?: string };
        }>;
      }>;
    };
  };
  kakaomap_review?: {
    score_set?: { average_score?: number };
  };
  summary?: {
    phone_numbers?: Array<{ tel?: string }>;
  };
}

const GEOCODE_TIMEOUT_MS = 3000;
const YOUTUBE_OEMBED_TIMEOUT_MS = 3000;
// 유튜브 전체 설명 상한(자). 이 이상이면 잘라 "…"를 붙인다.
const YOUTUBE_DESCRIPTION_MAX_CHARS = 2000;
// 1차 HTML(512KB 캡)엔 shortDescription이 실측상 거의 안 잡힌다(700KB~1.2MB 지점).
// 브라우저 UA로 한 번 더 받을 때 쓰는 캡·타임아웃 — 캡은 실측 최대치(~713KB)에 여유를
// 더한 값, 타임아웃은 link-preview 2차(브라우저 UA) 폴백과 같은 수준.
const YOUTUBE_REFETCH_MAX_BYTES = 1.5 * 1024 * 1024;
const YOUTUBE_REFETCH_TIMEOUT_MS = 5000;
// 네이버 장소 상세(m.place.naver.com/place/{id}/home) 2차 재요청 캡·타임아웃. og 태그는
// 초반 몇 KB면 충분하지만, 음식점류는 주소·영업시간이 og엔 없고 본문 Apollo JSON의
// roadAddress/address·WorkingHoursInfo 필드에만 있다(실측 byte offset ~330~430KB,
// 페이지 총 ~532~620KB) — 거기까지 닿으려면 캡을 넉넉히 잡아야 한다.
const NAVER_PLACE_REFETCH_MAX_BYTES = 512 * 1024;
const NAVER_PLACE_REFETCH_TIMEOUT_MS = 4000;
// 영업시간 표시 상한(자) — 넘으면 뒤 그룹은 통째로 생략(중간에서 자르지 않는다).
// 시간대 그룹이 한 줄씩 내려가는 표기라 요일 7그룹 최악 케이스까지 담기게 잡는다.
// 이름은 네이버 쪽에서 먼저 붙었지만 카카오 영업시간 포맷에도 그대로 쓴다(공용 상한).
const NAVER_HOURS_MAX_CHARS = 160;
// 카카오 장소 패널 API(비공식) 타임아웃 — 네이버 장소 상세 2차 재요청과 같은 수준.
const KAKAO_PLACE_REFETCH_TIMEOUT_MS = 4000;

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

  constructor(
    private readonly config: ConfigService,
    private readonly linkPreview: LinkPreviewService,
  ) {}

  /** 링크를 place|video|item으로 자동 구분한다.
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
        if (url) {
          // 네이버 지도 공유 링크는 SPA 셸이라 og에 이름 정도만 있다 — 장소 상세
          // 페이지로 주소·리뷰 수·영업시간을 보완.
          await this.enrichNaverPlaceDetails(place, url, preview);
          // 카카오 장소 링크(place.map.kakao.com/{id})도 비공식 장소 패널 API로
          // 영업시간·평점·전화를 보완(이름·주소는 이미 kakaoPlace()의 og로 채워짐).
          await this.enrichKakaoPlaceDetails(place, url);
        }
        // 구글 장소 링크는 og:site_name이 "www.google.com"이거나 "이름 · 주소"로
        // 오염돼 있어 "Google Maps"로 정규화한다(프론트가 로케일 표기로 다시 바꿈).
        const siteName =
          url && this.isGooglePlaceLink(url) ? 'Google Maps' : undefined;
        return {
          linkType: 'place',
          linkMeta: this.nullIfEmpty(place),
          siteName,
        };
      }

      // 2) video
      const video = await this.classifyVideo(url, html, nodes, ogType);
      if (video) {
        return {
          linkType: 'video',
          linkMeta: this.nullIfEmpty(video.meta),
          fullDescription: video.fullDescription,
        };
      }

      // 3) item
      const item = this.classifyItem(html, nodes, ogType);
      if (item) {
        return { linkType: 'item', linkMeta: this.nullIfEmpty(item) };
      }

      return { linkType: null, linkMeta: null };
    } catch (error) {
      this.logger.warn(
        `link classify failed for ${finalUrl}: ${String(error)}`,
      );
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
      this.googleMaps(url, preview) ??
      this.googleKnowledgeGraphPlace(url, preview)
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
    // 네이버는 og:title에 사이트명("네이버지도")을 주고 진짜 장소명은 og:description에 싣는다.
    // 제목이 사이트명 그대로면 설명을 장소명으로 쓴다(동어반복 카드 방지).
    const title = preview.title?.trim() || null;
    const generic = !title || title === preview.siteName?.trim();
    const name = generic ? preview.description?.trim() || null : title;
    if (name) meta.placeName = name;
    return meta;
  }

  /** map.naver.com/p/entry/place/{id}, m.place.naver.com/place/{id}/... 등에서 숫자
   *  장소 ID를 뽑는다. 네이버 지도/장소 호스트가 아니거나 ID가 없으면 null. */
  private naverPlaceId(url: URL): string | null {
    const host = url.hostname.toLowerCase();
    if (host !== 'map.naver.com' && !host.endsWith('place.naver.com')) {
      return null;
    }
    const m = /\/place\/(\d+)/.exec(url.pathname);
    return m ? m[1] : null;
  }

  /** 네이버 지도 공유 링크(map.naver.com/p/entry/place/{id})는 SPA 셸이라 og에 주소가
   *  없다(실측: og:title="네이버지도", og:description은 장소명 정도). 장소 ID로
   *  m.place.naver.com/place/{id}/home 을 봇 UA로 한 번 더 받으면 og가 깔끔하다 —
   *  og:title(사이트 접미사 제거)로 이름을 보완한다. og:description은 카테고리별로
   *  뜻이 다르다(실측): 역·지하철 등은 주소 그 자체, 음식점 등은 "방문자리뷰 6,240 ·
   *  블로그리뷰 74" 같은 리뷰 수 요약 — 후자는 reviews로 저장하고, 진짜 주소는 음식점류
   *  본문 Apollo JSON의 roadAddress/address 필드에서 별도로 뽑는다(extractNaverBodyAddress).
   *  영업시간도 같은 본문 Apollo JSON의 WorkingHoursInfo 배열에서 뽑는다
   *  (extractNaverBusinessHours) — "영업 중" 같은 현재 상태는 스냅샷이라 저장하지 않고
   *  요일별 시간표만. address·reviews·hours 셋 다 이미 있으면 2차 fetch 자체를 생략.
   *  placeName은 비어 있거나 naverPlace()의 자체 폴백도 못 건진 "사이트명 폴백 수준"
   *  (og:title·og:description이 둘 다 사이트명이라 결국 사이트명이 그대로 남은 경우)일
   *  때만 덮어쓴다 — 진짜 이름이 이미 있으면 절대 건드리지 않는다. address·reviews·
   *  hours도 각각 이미 있으면 안 덮는다. 실패(타임아웃·비매치·비정상 ID)는 조용히 무시
   *  — 유튜브 2차 fetch와 같은 best-effort 문법. */
  private async enrichNaverPlaceDetails(
    meta: LinkMeta,
    url: URL,
    preview: LinkPreview,
  ): Promise<void> {
    if (meta.address && meta.reviews && meta.hours && meta.phone) return;
    const placeId = this.naverPlaceId(url);
    if (!placeId) return;

    const html = await this.linkPreview.fetchCapped(
      `https://m.place.naver.com/place/${placeId}/home`,
      {
        userAgent: BOT_UA,
        accept: BOT_ACCEPT,
        timeoutMs: NAVER_PLACE_REFETCH_TIMEOUT_MS,
        maxBytes: NAVER_PLACE_REFETCH_MAX_BYTES,
      },
    );
    if (!html) return;

    const isGenericName =
      !meta.placeName || meta.placeName === preview.siteName?.trim();
    if (isGenericName) {
      const title = this.stripNaverTitleSuffix(this.meta(html, 'og:title'));
      if (title) meta.placeName = title;
    }

    const description = this.meta(html, 'og:description')?.trim();
    if (description?.includes('리뷰')) {
      // 음식점류 — og:description이 주소가 아니라 리뷰 수 요약("방문자리뷰 …")이다.
      // 리뷰 행은 별점만 통일 표기(⭐ N.N — 구글 장소와 동일 격)라 개수는 버리고,
      // 본문 Apollo JSON의 평점("avgRating":4.52)만 쓴다. 평점이 없으면 행 자체를 생략.
      if (!meta.reviews) {
        const rating = /"avgRating":(\d(?:\.\d{1,2})?)/.exec(html)?.[1];
        if (rating) meta.reviews = `⭐ ${rating}`;
      }
    } else if (!meta.address && description) {
      // 역·지하철 등 — og:description이 그대로 주소(실측).
      meta.address = description;
    }

    if (!meta.address) {
      const bodyAddress = this.extractNaverBodyAddress(html);
      if (bodyAddress) meta.address = bodyAddress;
    }

    if (!meta.hours) {
      const hours = this.extractNaverBusinessHours(html);
      if (hours) meta.hours = hours;
    }

    if (!meta.phone) {
      // 본문 Apollo JSON의 "phone":"02-459-9424" (실측: roadAddress 바로 근처).
      // 숫자·하이픈만 허용해 다른 phone류 키(virtualPhone:null 등) 오탐을 막는다.
      const phone = /"phone":"([\d-]{7,20})"/.exec(html)?.[1];
      if (phone) meta.phone = phone;
    }
  }

  /** 본문(비-og) Apollo JSON에 박힌 "roadAddress"(도로명, 우선) 또는 "address"(지번)
   *  필드에서 주소를 뽑는다 — 음식점류는 og에 주소가 없고 여기에만 있다(실측). \uXXXX 등
   *  JSON 이스케이프가 있어 캡처 후 JSON.parse로 해제한다. 못 찾거나 파싱 실패하면 null. */
  private extractNaverBodyAddress(html: string): string | null {
    const patterns = [
      /"roadAddress":"((?:[^"\\]|\\.)*)"/,
      /"address":"((?:[^"\\]|\\.)*)"/,
    ];
    for (const pattern of patterns) {
      try {
        const match = pattern.exec(html);
        if (!match) continue;
        const decoded = JSON.parse(`"${match[1]}"`) as string;
        const trimmed = decoded.trim();
        if (trimmed) return trimmed;
      } catch {
        // 이 후보 파싱 실패 — 다음 패턴으로
      }
    }
    return null;
  }

  /** 본문 Apollo JSON의 "WorkingHoursInfo" 배열에서 요일별 영업시간 원자료를 뽑는다
   *  (음식점류 실측: byte offset ~400~430KB, 512KB 캡 안에 들어옴; day·시간 값에
   *  이스케이프가 없어 단순 [^"]* 로 충분하다 — 실측 확인). 여러 요일이 있을 수 있어
   *  ("매일" 하나거나 "월"·"화"·... 여러 개) 전부 수집한다. 중복(요일+시간 동일) 항목은
   *  제거. "영업 중" 같은 현재 영업상태는 저장 시점 스냅샷이라 카드가 금방 낡으므로
   *  의도적으로 뽑지 않는다 — 요일별 시간표만. 그룹핑·정렬·상한 적용은 공용
   *  formatBusinessHours()가 한다(카카오와 공유, 중복 구현 방지). 못 찾거나 실패하면
   *  null. */
  private extractNaverBusinessHours(html: string): string | null {
    const pattern =
      /\{"__typename":"WorkingHoursInfo","day":"([^"]*)","businessHours":\{"__typename":"StartEndTime","start":"([^"]*)","end":"([^"]*)"/g;
    const seen = new Set<string>();
    const entries: HourEntry[] = [];
    try {
      // 캡처값엔 /(슬래시) 같은 JSON 이스케이프가 남아 있다(실측: 날짜 낀 요일
      // "목(7/30)") — 주소 추출과 같은 방식으로 해제한다. 실패하면 원문 그대로.
      const decode = (s: string): string => {
        try {
          return JSON.parse(`"${s}"`) as string;
        } catch {
          return s;
        }
      };
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(html)) !== null) {
        // 요일에 붙는 이번 주 날짜("목(7/30)")는 저장 카드에선 금방 낡는 정보라 뗀다.
        const day = decode(match[1] ?? '')
          .replace(/\(\d{1,2}\/\d{1,2}\)/g, '')
          .trim();
        const start = decode(match[2] ?? '');
        const end = decode(match[3] ?? '');
        if (!day || !start || !end) continue;
        const key = `${day}|${start}|${end}`;
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({ day, time: `${start}~${end}` });
      }
    } catch (error) {
      this.logger.debug(`네이버 영업시간 파싱 실패: ${String(error)}`);
      return null;
    }
    return this.formatBusinessHours(entries, NAVER_HOURS_MAX_CHARS);
  }

  /** 요일별 영업시간 원자료를 같은 시간대끼리 묶어 "화·목·금 07:30~22:00" 형태로 만들고
   *  줄바꿈(\n)으로 join한다 — 네이버·카카오 공용(중복 구현 방지). 요일 순서는 월~일
   *  기준으로 정렬한 뒤 묶고, 그룹 순서도 그룹 내 첫 요일 기준("매일" 같은 비요일
   *  항목은 정렬표에 없어 맨 앞으로 온다). 전체 maxChars 상한 — 넘으면 뒤 그룹은
   *  통째로 생략(중간에서 자르지 않는다). 입력이 비어 있으면 null. */
  private formatBusinessHours(
    entries: HourEntry[],
    maxChars: number,
  ): string | null {
    if (!entries.length) return null;
    const WEEK = ['월', '화', '수', '목', '금', '토', '일'];
    const dayIndex = (d: string) => {
      const i = WEEK.indexOf(d);
      return i < 0 ? -1 : i;
    };
    const byTime = new Map<string, string[]>();
    for (const it of [...entries].sort(
      (a, b) => dayIndex(a.day) - dayIndex(b.day),
    )) {
      const days = byTime.get(it.time) ?? [];
      days.push(it.day);
      byTime.set(it.time, days);
    }
    const groups = [...byTime.entries()].map(
      ([time, days]) => `${days.join('·')} ${time}`,
    );

    const kept: string[] = [];
    let length = 0;
    for (const entry of groups) {
      if (length + entry.length + 1 > maxChars) break;
      kept.push(entry);
      length += entry.length + 1;
    }
    // 그룹마다 줄바꿈 — 요일별 시간이 다르면 카드에서 한 줄씩 떨어져 보인다.
    return kept.length ? kept.join('\n') : null;
  }

  /** 네이버 장소 페이지 og:title 끝의 사이트 접미사를 뗀다. 카테고리별로 형태가 달라
   *  실측된 두 패턴을 모두 처리한다 — 지하철역 등은 "이름 - 네이버지도", 음식점 등은
   *  "이름 : 네이버"(+ 끝에 제어문자가 붙기도 함, 실측)로 온다. */
  private stripNaverTitleSuffix(title: string | null): string | null {
    if (!title) return null;
    const cleaned = title
      .replace(/[\x00-\x1f]+$/, '') // 관측된 꼬리 제어문자 제거
      .replace(/\s*[-:|]\s*네이버(?:지도)?\s*$/, '') // "- 네이버지도" · ": 네이버" 등
      .trim();
    return cleaned || null;
  }

  /** place.map.kakao.com/{id} (이름+주소) · map.kakao.com/link/map/{name},{lat},{lng}. */
  private kakaoPlace(url: URL, preview: LinkPreview): LinkMeta | null {
    const host = url.hostname.toLowerCase();
    if (host === 'place.map.kakao.com') {
      const meta: LinkMeta = {};
      if (preview.title) meta.placeName = preview.title;
      // 카카오 장소 페이지는 og:description이 주소 그 자체다(실측: "서울 동작구 상도로 102").
      const desc = preview.description?.trim();
      if (desc) meta.address = desc;
      return meta;
    }
    if (
      host === 'map.kakao.com' &&
      /\/link\/(map|to|roadview)\//.test(url.pathname)
    ) {
      const meta: LinkMeta = {};
      const last = this.safeDecode(url.pathname.split('/').pop() ?? '');
      const tokens = last.split(',');
      if (tokens.length >= 3) {
        // 형식은 {name},{lat},{lng} — 뒤 두 토큰이 좌표.
        const lat = Number(tokens[tokens.length - 2]);
        const lng = Number(tokens[tokens.length - 1]);
        const name = tokens
          .slice(0, tokens.length - 2)
          .join(',')
          .trim();
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

  /** place.map.kakao.com/{id} 에서 숫자 장소 ID를 뽑는다. 호스트가 아니거나 ID가
   *  없으면 null. */
  private kakaoPlaceId(url: URL): string | null {
    if (url.hostname.toLowerCase() !== 'place.map.kakao.com') return null;
    const m = /^\/(\d+)/.exec(url.pathname);
    return m ? m[1] : null;
  }

  /** 카카오 장소 링크(place.map.kakao.com/{id})는 이름·주소는 og로 이미 채워지지만
   *  (kakaoPlace()) 영업시간·평점·전화는 og에 없다. 카카오 자체 장소 패널 API
   *  (place-api.map.kakao.com/places/panel3/{id}, 비공식이지만 브라우저 UA·특정
   *  헤더로 200 + ~50~56KB JSON을 준다 — 실측)로 세 값 모두 채운다:
   *  - hours: open_hours.week_from_today.week_periods[].days[]를
   *    extractKakaoBusinessHours()가 formatBusinessHours()(네이버와 공용)로 포맷.
   *  - reviews: kakaomap_review.score_set.average_score(실측 3.5·4.8 등, 소수 둘째
   *    자리까지 그대로) → "⭐ N.N" — 네이버·구글 장소와 같은 표기.
   *  - phone: summary.phone_numbers[0].tel(실측 배열에 팩스 등이 섞일 수 있어 첫
   *    항목만 쓴다).
   *  hours·reviews·phone 셋 다 이미 있으면 API 호출 자체를 생략. 각각 이미 있으면
   *  안 덮는다. 실패(타임아웃·비정상 ID·API 변경)는 조용히 무시 — 유튜브·네이버
   *  2차 fetch와 같은 best-effort 문법. */
  private async enrichKakaoPlaceDetails(
    meta: LinkMeta,
    url: URL,
  ): Promise<void> {
    if (meta.hours && meta.reviews && meta.phone) return;
    const placeId = this.kakaoPlaceId(url);
    if (!placeId) return;

    const data = await this.linkPreview.fetchJson<KakaoPlacePanel>(
      `https://place-api.map.kakao.com/places/panel3/${placeId}`,
      {
        userAgent: BROWSER_UA,
        accept: 'application/json;charset=UTF-8',
        headers: {
          Origin: 'https://place.map.kakao.com',
          Referer: 'https://place.map.kakao.com/',
          pf: 'web',
        },
        timeoutMs: KAKAO_PLACE_REFETCH_TIMEOUT_MS,
      },
    );
    if (!data) return;

    if (!meta.hours) {
      const hours = this.extractKakaoBusinessHours(data);
      if (hours) meta.hours = hours;
    }
    if (!meta.reviews) {
      const score = data.kakaomap_review?.score_set?.average_score;
      // review_count=0인 곳은 average_score가 0으로 오기도 해 "⭐ 0" 같은 노이즈를
      // 막는다(별점 없음보다 낫다는 판단은 아님 — 그냥 행 자체를 생략).
      if (typeof score === 'number' && score > 0) meta.reviews = `⭐ ${score}`;
    }
    if (!meta.phone) {
      const tel = data.summary?.phone_numbers?.[0]?.tel;
      if (typeof tel === 'string' && tel.trim()) meta.phone = tel.trim();
    }
  }

  /** open_hours.week_from_today.week_periods[].days[]에서 요일별 영업시간 원자료를
   *  뽑아 공용 formatBusinessHours()(네이버와 공유)로 포맷한다. day_of_the_week_desc
   *  는 "목(7/30)"처럼 이번 주 날짜가 붙어 있어 네이버와 같은 이유로 뗀다. on_days가
   *  없는 요일은 휴무(실측: 경복궁 화요일)라 스킵 — "영업 중" 같은 현재 상태와 마찬가지로
   *  스냅샷성 정보는 다루지 않는다는 원칙과도 맞는다(그냥 그 요일 항목이 없을 뿐). */
  private extractKakaoBusinessHours(data: KakaoPlacePanel): string | null {
    const periods = data.open_hours?.week_from_today?.week_periods ?? [];
    const entries: HourEntry[] = [];
    for (const period of periods) {
      for (const d of period.days ?? []) {
        const range = d.on_days?.start_end_time_desc;
        if (!range) continue; // 휴무일
        const day = d.day_of_the_week_desc?.replace(/\([^)]*\)/g, '').trim();
        const time = range.replace(/\s*~\s*/, '~').trim();
        if (!day || !time) continue;
        entries.push({ day, time });
      }
    }
    return this.formatBusinessHours(entries, NAVER_HOURS_MAX_CHARS);
  }

  /** google.com/maps · maps.app.goo.gl — @{lat},{lng} 또는 !3d{lat}!4d{lng}. */
  private googleMaps(url: URL, preview: LinkPreview): LinkMeta | null {
    const host = url.hostname.toLowerCase();
    const isGoogleMaps =
      (this.isGoogleHost(host) && url.pathname.startsWith('/maps')) ||
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
    // 이름 우선순위: URL 경로(/maps/place/{이름}) → og:title 분리("이름 · 주소"의 앞부분)
    // → 원제목. 경로에 이름이 없는 형태(google.com/maps?vet=... 등)에서 분리 전의
    // 원제목("이름 · 주소" 통째)을 먼저 넣어버리면 카드 제목에 주소가 중복되므로,
    // 분리 시도 뒤에만 원제목 폴백을 쓴다. og:title이 "Google Maps" 같은 제네릭
    // 값이면 폴백으로도 쓰지 않는다.
    const urlName = this.googlePlaceName(url);
    if (urlName) meta.placeName = urlName;
    this.splitGoogleTitle(meta, preview.title);
    if (!meta.placeName) {
      const title = preview.title?.trim();
      if (title && !/^google maps$/i.test(title)) meta.placeName = title;
    }
    this.googleRatingReviews(meta, preview.description);
    return meta;
  }

  /** share.google 단축링크가 최종적으로 풀리는 곳 — google.com/search 또는
   *  /knowledgegraphshares(실측상 봇 UA·브라우저 UA에 따라 경로가 갈림, 둘 다 커버하려
   *  경로는 안 보고 kgmid만 본다). kgmid는 구글 지식그래프 개체 id라 장소 공유의 확실한
   *  신호. placeName은 검색어(q, 대개 장소명)를 최우선하고, 없으면 og:title에서. */
  private googleKnowledgeGraphPlace(
    url: URL,
    preview: LinkPreview,
  ): LinkMeta | null {
    if (!this.isGoogleHost(url.hostname)) return null;
    if (!url.searchParams.has('kgmid')) return null;

    const meta: LinkMeta = {};
    const q = url.searchParams.get('q')?.trim();
    if (q) meta.placeName = q;
    this.splitGoogleTitle(meta, preview.title);
    this.googleRatingReviews(meta, preview.description);
    return meta;
  }

  /** google.com 또는 *.google.com. */
  private isGoogleHost(hostname: string): boolean {
    const host = hostname.toLowerCase();
    return host === 'google.com' || host.endsWith('.google.com');
  }

  /** siteName을 "Google Maps"로 정규화할 대상인지 — googleMaps()·
   *  googleKnowledgeGraphPlace()가 다루는 두 URL 형태를 합친 것과 같다. */
  private isGooglePlaceLink(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    const isMapsUrl =
      (this.isGoogleHost(host) && url.pathname.startsWith('/maps')) ||
      host === 'maps.app.goo.gl' ||
      (host.endsWith('goo.gl') && url.pathname.startsWith('/maps'));
    const isKnowledgeGraphUrl =
      this.isGoogleHost(host) && url.searchParams.has('kgmid');
    return isMapsUrl || isKnowledgeGraphUrl;
  }

  /** 구글 지도·지식그래프 og:title은 "이름 · 주소" 형태다(" · " 구분자). 비어 있는
   *  필드만 채운다 — 이름은 URL/쿼리에서 이미 온 값을, 주소는 카카오 지오코딩이
   *  채웠을 수 있는 기존 값을 덮어쓰지 않는다. */
  private splitGoogleTitle(meta: LinkMeta, title: string | null): void {
    if (!title) return;
    const idx = title.indexOf(' · ');
    if (idx < 0) return;
    const name = title.slice(0, idx).trim();
    const address = title.slice(idx + 3).trim();
    if (!meta.placeName && name) meta.placeName = name;
    if (!meta.address && address) meta.address = address;
  }

  /** 구글 장소 og:description은 "★★★★☆ · 호텔"·"3.6 ⭐ · 호텔" 같은 평점 요약이다.
   *  별 글리프가 있을 때만 리뷰 행으로 채운다(다른 형태의 설명은 오염 방지 차원에서 무시).
   *  네이버 리뷰 수 행과 같은 필드(meta.reviews)를 써서 카드 표시가 하나로 통일된다. */
  private googleRatingReviews(
    meta: LinkMeta,
    description: string | null,
  ): void {
    if (meta.reviews) return;
    const d = description?.trim();
    if (!d || !/[★⭐]/.test(d)) return;
    // 리뷰 행은 별점만 통일 표기(⭐ N.N — 네이버 장소와 동일 격): 숫자가 있으면 그 값,
    // 별 글리프뿐이면 채워진 별 개수. 카테고리 등 나머지 문구는 버린다.
    const num =
      /(\d(?:\.\d{1,2})?)\s*[⭐★]/.exec(d)?.[1] ??
      /[⭐★]\s*(\d(?:\.\d{1,2})?)/.exec(d)?.[1];
    if (num) {
      meta.reviews = `⭐ ${num}`;
      return;
    }
    const stars = (d.match(/★/g) ?? []).length;
    if (stars > 0) meta.reviews = `⭐ ${stars}`;
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
          (typeof doc.road_address_name === 'string' &&
            doc.road_address_name.trim()) ||
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
  ): Promise<{ meta: LinkMeta; fullDescription?: string | null } | null> {
    const host = url?.hostname.toLowerCase() ?? '';
    const isVideoHost = VIDEO_HOSTS.some(
      (d) => host === d || host.endsWith('.' + d),
    );
    if (!isVideoHost && !ogType.includes('video')) return null;

    const isYouTube =
      host === 'youtube.com' ||
      host.endsWith('.youtube.com') ||
      host === 'youtu.be';

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
    if (!meta.channel && url && isYouTube) {
      const oembedChannel = await this.youtubeOEmbedChannel(url.href);
      if (oembedChannel) meta.channel = oembedChannel;
    }

    // 유튜브 og:description은 신뢰할 수 없다 — 일반 영상은 ~68자 + "..."로 잘려서
    // 서빙되고, 쇼츠는 아예 유튜브 일반 소개문("YouTube에서 마음에 드는 동영상과...")이
    // 내려온다. watch 페이지 HTML의 ytInitialPlayerResponse.shortDescription이 원본
    // 데이터라 잡히기만 하면(빈 문자열 포함) og보다 항상 권위 있게 취급한다.
    // 1차 HTML(512KB 캡)엔 실측상 거의 안 잡혀서(700KB~1.2MB 지점) 없으면 브라우저
    // UA로 한 번 더(1.5MB 캡) 받아본다 — 순서는 1차 검사 → 없을 때만 2차(불필요한
    // 재요청 방지). 유튜브가 구조를 바꿔 앞쪽으로 옮겨올 수도 있으니 1차 검사는 유지.
    let parsed = isYouTube
      ? this.parseYoutubeShortDescription(html)
      : { matched: false, text: '' };
    if (isYouTube && !parsed.matched && url) {
      // 쇼츠(/shorts/{id})는 watch URL로 정규화해서 재요청한다 — watch 페이지가
      // ytInitialPlayerResponse를 더 확실하게 싣는다.
      const refetchUrl = this.toYoutubeWatchUrl(url) ?? url.href;
      parsed = await this.refetchYoutubeShortDescription(refetchUrl);
    }
    // matched=false(패턴 자체를 못 찾음) → undefined로 기존 og:description 유지.
    // matched=true인데 text가 빈 문자열(원본 설명 없는 영상) → null로 명시 대체.
    const fullDescription: string | null | undefined = parsed.matched
      ? this.finalizeYoutubeDescription(parsed.text)
      : undefined;

    return { meta, fullDescription };
  }

  /** watch 페이지 HTML에서 ytInitialPlayerResponse.shortDescription 원문을 뽑아 디코드만
   *  한다(길이 비교·자르기는 finalizeYoutubeDescription에서). matched=false는 "패턴 자체를
   *  못 찾음"이란 뜻으로 classifyVideo가 2차 재요청 여부를 판단하는 신호가 된다 —
   *  matched=true·text=''(빈 설명)와 구분해야 하므로 단순 string|null로 뭉치지 않는다. */
  private parseYoutubeShortDescription(html: string): YoutubeDescriptionParse {
    try {
      const match = /"shortDescription":"((?:[^"\\]|\\.)*)"/.exec(html);
      if (!match) return { matched: false, text: '' };
      const decoded = JSON.parse(`"${match[1]}"`) as string;
      return { matched: true, text: decoded.trim() };
    } catch (error) {
      this.logger.debug(`youtube shortDescription 파싱 실패: ${String(error)}`);
      return { matched: false, text: '' };
    }
  }

  /** 유튜브 URL(watch/shorts/youtu.be)에서 videoId를 뽑아 표준 watch URL로 정규화한다.
   *  실패하면 null(호출부가 원본 URL로 폴백). */
  private toYoutubeWatchUrl(url: URL): string | null {
    const host = url.hostname.toLowerCase();
    let videoId: string | null = null;
    if (host === 'youtu.be') {
      videoId = url.pathname.split('/').filter(Boolean)[0] ?? null;
    } else {
      const shortsMatch = /^\/shorts\/([^/?#]+)/.exec(url.pathname);
      videoId = shortsMatch ? shortsMatch[1] : url.searchParams.get('v');
    }
    return videoId
      ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
      : null;
  }

  /** 1차 HTML에 shortDescription이 없을 때만 호출 — 브라우저 UA·1.5MB 캡으로 watch
   *  페이지를 한 번 더 받아 같은 패턴을 다시 찾는다. 실패(타임아웃·캡 초과·비매치)는
   *  matched=false(best-effort, 기존 og:description 유지). */
  private async refetchYoutubeShortDescription(
    watchUrl: string,
  ): Promise<YoutubeDescriptionParse> {
    const html = await this.linkPreview.fetchCapped(watchUrl, {
      userAgent: BROWSER_UA,
      accept: BROWSER_ACCEPT,
      timeoutMs: YOUTUBE_REFETCH_TIMEOUT_MS,
      maxBytes: YOUTUBE_REFETCH_MAX_BYTES,
    });
    if (!html) return { matched: false, text: '' };
    return this.parseYoutubeShortDescription(html);
  }

  /** 매치된 전체 설명을 최종 형태로 — 빈 문자열이면 null(원본 설명 없는 영상, 유튜브
   *  일반 소개문 같은 노이즈보다 낫다). 너무 길면 상한에서 잘라 "…"를 붙인다. */
  private finalizeYoutubeDescription(text: string): string | null {
    if (!text) return null;
    if (text.length > YOUTUBE_DESCRIPTION_MAX_CHARS) {
      return text.slice(0, YOUTUBE_DESCRIPTION_MAX_CHARS).trimEnd() + '…';
    }
    return text;
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
  private extractOffer(offers: unknown): {
    price?: unknown;
    currency?: unknown;
  } {
    if (!offers) return {};
    const o = Array.isArray(offers) ? offers[0] : offers;
    if (!o || typeof o !== 'object') return {};
    const offer = o as Record<string, unknown>;
    return {
      price: offer.price ?? offer.lowPrice,
      currency: offer.priceCurrency,
    };
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
    return out;
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
