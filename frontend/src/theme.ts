import { Platform } from 'react-native';

// ── 색 유틸 (WCAG 대비 계산) ─────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full =
    h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channelLum(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channelLum(r) + 0.7152 * channelLum(g) + 0.0722 * channelLum(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// 액센트 위 글자색: 흰색/검정 중 대비가 높은 쪽 (노랑 → 검정 자동)
export function bestTextOn(bg: string): string {
  return contrastRatio(bg, '#FFFFFF') >= contrastRatio(bg, '#111111')
    ? '#FFFFFF'
    : '#111111';
}

// HEX → HSL (h 0-360, s/l 0-100)
export function hexToHsl(hex: string): [number, number, number] {
  const [r8, g8, b8] = hexToRgb(hex);
  const r = r8 / 255;
  const g = g8 / 255;
  const b = b8 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s * 100, l * 100];
}

// 명도만 delta(%p)만큼 이동한 색. 말풍선 그라디언트 스톱 계산용.
export function shiftLightness(hex: string, delta: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, Math.min(100, Math.max(0, l + delta)));
}

// HEX에 투명도를 입힌 rgba 문자열 (림 라이트 등 오버레이용)
export function hexAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// 커스텀 피커용: HSL → HEX
export function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) =>
    ln - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to255 = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to255(f(0))}${to255(f(8))}${to255(f(4))}`.toUpperCase();
}

// ── 팔레트 ───────────────────────────────────────────────────────

export type ColorScheme = 'light' | 'dark';

export interface ThemeColors {
  background: string;
  surface: string; // 옅은 채움 — 면적 구분은 보더 대신 이걸로 (borderless 카드)
  hairline: string; // 구조 구분선 (가장 연함)
  border: string; // 요소 외곽선 (입력창·outline 버튼·말풍선 틀) — 연한 회색
  ink: string; // 중립 강조 채움 (아바타, 기본 말풍선/버튼) + 선택 표시
  inverse: string; // ink 위에 올라가는 글자
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  // 사용자가 고른 브랜드색. 기본은 ink(흑백 유지).
  // 주요 버튼·전송·활성 상태에 칠한다.
  accent: string;
  onAccent: string; // accent 위 글자색 (자동 대비 계산)
  // ── 푹신한(puffy) 말풍선 세트 (accent에서 자동 파생) ──
  bubbleFill: string; // 파스텔 채움
  bubbleBorder: string; // 한 톤 진한 틴트 테두리 (2px)
  bubbleShade: string; // 아랫면 그늘·바깥 그림자용 틴트
  bubbleHighlight: string; // 윗면 인셋 하이라이트 (푹신함의 핵심)
  onBubble: string; // 말풍선 글자 (파스텔 위 진한 중립색)
}

// 흰 배경 기준 WCAG 대비: primary 18.9 / secondary 7.0 / tertiary 4.7
const lightNeutrals = {
  background: '#FFFFFF',
  surface: '#F5F5F5',
  hairline: '#EAEAEA',
  border: '#D9D9D9',
  ink: '#111111',
  inverse: '#FFFFFF',
  textPrimary: '#111111',
  textSecondary: '#595959',
  textTertiary: '#737373',
};

// #0D0D0D 배경 기준: primary 17.9 / secondary 9.3 / tertiary 5.8
const darkNeutrals = {
  background: '#0D0D0D',
  surface: '#1E1E1E',
  hairline: '#2E2E2E',
  border: '#3D3D3D',
  ink: '#F5F5F5',
  inverse: '#111111',
  textPrimary: '#F5F5F5',
  textSecondary: '#B3B3B3',
  textTertiary: '#8F8F8F',
};

// 분류(카테고리)에 지정하는 "프로필" 색 프리셋 8종. 아바타 배경과 그 분류 말풍선 색의 원천.
// 검정·흰색을 뺀 6색은 쨍하지 않은 파스텔(HSL S~56-72 / L~76-81) — MZ 톤.
export const CATEGORY_COLORS: { key: string; hex: string }[] = [
  { key: 'pink', hex: '#EBADC4' },
  { key: 'yellow', hex: '#EEDB96' },
  { key: 'green', hex: '#C0E4A0' },
  { key: 'sky', hex: '#ABD9ED' },
  { key: 'blue', hex: '#9EB0EB' },
  { key: 'purple', hex: '#C7B3EA' },
  { key: 'black', hex: '#1A1A1A' },
  { key: 'white', hex: '#FFFFFF' },
];

// "전체"(자기 자신) 방 프로필의 기본 색. 서버 selfColor가 null일 때 프론트가 이 검정으로 그린다.
// 검정(S0)이라 makePuffy는 미분류 기본과 같은 회색 파스텔을 내 시각 변화가 없다.
export const SELF_DEFAULT_COLOR = '#1A1A1A';

// 새 분류 생성 시 기본 색 자동 지정: CATEGORY_COLORS(8색) 순서대로 훑어
// 아직 어떤 분류도 안 쓰는 첫 색을 고른다. 8색이 모두 쓰이는 중이면 개수로 순환.
// existing은 색만 필요해 Friend 전체가 아니어도(RoomsSummary의 friend 요약 등) 받는다.
export function pickDefaultCategoryColor(
  existing: { color?: string | null }[],
): string {
  const used = new Set(
    existing
      .map((f) => f.color?.toUpperCase())
      .filter((c): c is string => !!c),
  );
  const unused = CATEGORY_COLORS.find((c) => !used.has(c.hex.toUpperCase()));
  if (unused) return unused.hex;
  return CATEGORY_COLORS[existing.length % CATEGORY_COLORS.length].hex;
}

// 푹신한(puffy) 말풍선 세트만 따로 뽑은 타입.
export interface PuffyColors {
  bubbleFill: string;
  bubbleBorder: string;
  bubbleShade: string;
  bubbleHighlight: string;
  onBubble: string;
}

// 푹신한 말풍선 재질을 baseHex(분류색 또는 기본 ink)에서 파생한다.
// 유채색: 색조·채도는 baseHex에서, 명도는 고정 레일(라이트 fill L92 / 다크 L28).
// 무채색(흰/검 프로필)은 명도 성격을 반영해 갈린다 — 안 그러면 채도0이라 흰색·검정이 똑같은
// 회색 파스텔로 수렴한다(사용자 버그: 흰색 분류가 전체 기본 회색과 구분 안 됨):
//   · 밝은 무채색(흰색 등, l≥50): fill을 원색쪽으로 끌어올려(라이트 거의 흰색 L97.5 /
//     다크 밝은 중립 L41) 기본 회색과 구분. 보더는 배경에서 윤곽이 안 사라지게, onBubble 대비 4.5:1↑ 유지.
//   · 어두운 무채색(검정 등, l<50): 기존 회색 그대로 — 검정은 "전체/미분류" 기본값이라 지금이 정답.
// 유채색·어두운 무채색 경로는 기존 공식 그대로(회귀 없음). 다크는 채도 클램프로 onBubble 대비를 지킨다.
export function makePuffy(scheme: ColorScheme, baseHex: string): PuffyColors {
  const [h, s, l] = hexToHsl(baseHex);
  // 무채색이면서 밝은 기준색(흰색 등) — 회색으로 뭉개지지 않게 별도 처리한다.
  const brightNeutral = s < 12 && l >= 50;

  if (scheme === 'dark') {
    if (brightNeutral) {
      // 어두운 배경 위 "흰 프로필": 기본(L28)보다 확연히 밝은 중립. onBubble #EDEDED 4.7:1.
      return {
        bubbleFill: hslToHex(h, 0, 41),
        bubbleBorder: hslToHex(h, 0, 56),
        bubbleShade: hslToHex(h, 0, 16),
        bubbleHighlight: 'rgba(255,255,255,0.20)',
        onBubble: '#EDEDED',
      };
    }
    return {
      bubbleFill: hslToHex(h, Math.min(s, 45), 28),
      bubbleBorder: hslToHex(h, Math.min(s, 45), 44),
      bubbleShade: hslToHex(h, Math.min(s, 50), 6),
      bubbleHighlight: 'rgba(255,255,255,0.20)',
      onBubble: '#EDEDED',
    };
  }

  if (brightNeutral) {
    // 거의 흰색 채움 + 상대적으로 진한 보더(윤곽 유지) — 흰 배경에서 기본 회색과 "흰 카드"로 구분.
    return {
      bubbleFill: hslToHex(h, 0, 97.5),
      bubbleBorder: hslToHex(h, 0, 80),
      bubbleShade: hslToHex(h, 0, 86),
      bubbleHighlight: 'rgba(255,255,255,0.95)',
      onBubble: '#2D2D2D',
    };
  }
  return {
    bubbleFill: hslToHex(h, Math.min(s, 80), 92),
    bubbleBorder: hslToHex(h, Math.min(s, 70), 82),
    bubbleShade: hslToHex(h, Math.min(s, 65), 70),
    bubbleHighlight: 'rgba(255,255,255,0.95)',
    onBubble: '#2D2D2D',
  };
}

// (라이트|다크) → 화면이 쓰는 최종 토큰. 앱 크롬은 순수 흑백 고정(accent = ink).
// 색은 더 이상 사용자 취향이 아니라 "분류의 것" — 말풍선 색은 MessageBubble이
// 분류색으로 makePuffy를 호출해 따로 파생한다. 여기 기본 puffy는 미분류용 회색 파스텔.
export function makeColors(scheme: ColorScheme): ThemeColors {
  const neutrals = scheme === 'dark' ? darkNeutrals : lightNeutrals;
  return {
    ...neutrals,
    accent: neutrals.ink,
    onAccent: neutrals.inverse,
    // 미분류(전체) 기본 말풍선은 항상 중립 회색이어야 한다. makePuffy가 이제 밝은 무채색(흰색)을
    // 별도 처리하므로, 다크의 ink(#F5F5F5=밝은 무채색)를 그대로 넘기면 기본 말풍선까지 "흰 프로필"로
    // 처리돼 버린다. 스킴 무관 어두운 무채색을 넘겨 항상 기본 회색 경로를 타게 한다(결과 hex 동일).
    ...makePuffy(scheme, '#111111'),
  };
}

// ── 재질 상수: 미니멀 × 마이크로그래픽 웹코어 ────────────────────
// 원칙: 1px 정밀선 + 그림자 0(완전 플랫) + 라운드 0 + 플랫 채움.
// 브루탈은 흔적만(각진 모서리·정직한 박스), 구분선은 점선이 시그니처.
export const brutal = {
  borderWidth: 1,
  offset: 0, // 레퍼런스에 그림자 없음 — 플랫
  offsetLarge: 0,
  radius: 0,
};

// ── 치수·타이포그래피 (테마와 무관) ──────────────────────────────

export const layout = {
  // 화면 상단 여백: 네이티브는 상태바만큼, 웹은 조금만
  statusBarPad: Platform.select({ ios: 56, web: 24, default: 44 }) as number,
  // 화면 하단 여백: iOS 홈 인디케이터 대응
  bottomPad: Platform.select({ ios: 26, default: 10 }) as number,
  // 이 폭 이상이면 데스크톱 레이아웃(사이드 레일)
  desktopBreakpoint: 900,
};

// 타이포그래피 스케일. 화면마다 fontSize/fontWeight를 따로 정하지 않고
// 여기서 의미 단위로 골라 쓴다 (components/Text.tsx의 variant로 연결).
export const typography = {
  display: { fontSize: 40, fontWeight: '800' as const, letterSpacing: -1 },
  title: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.5 },
  heading: { fontSize: 17, fontWeight: '700' as const, letterSpacing: -0.3 },
  subheading: { fontSize: 16, fontWeight: '700' as const, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const },
  label: { fontSize: 13, fontWeight: '600' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
  // micro(타임스탬프·꼬리표)는 모노스페이스 — 웹코어 감각의 핵심 디테일.
  // 시스템 기본 모노 대신 Azeret Mono를 번들 (루트 레이아웃에서 로드).
  // 폰트 파일이 500 웨이트라 fontWeight는 지정하지 않는다(Android 합성 볼드 방지).
  micro: {
    fontSize: 11,
    fontFamily: 'AzeretMono_500Medium',
  },
};

export type TypographyVariant = keyof typeof typography;
