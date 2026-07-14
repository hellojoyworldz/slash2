import { Platform } from 'react-native';

// 흑백 미니멀 팔레트
// 원칙: 검정(#111)은 "내 말풍선·주요 버튼·활성 상태"에만 아껴 쓰고,
// 구분선과 보조 요소는 회색 단계로 위계를 만든다.
export const colors = {
  background: '#FFFFFF',
  ink: '#111111', // 채움용 검정 (말풍선, 주요 버튼, 아바타)
  inverse: '#FFFFFF', // 검정 위에 올라가는 글자
  // 흰 배경 기준 WCAG 대비: primary 18.9:1 / secondary 7.0:1 / tertiary 4.7:1
  // (tertiary도 placeholder·타임스탬프 등 정보성 텍스트에 쓰이므로 4.5:1 이상 유지)
  textPrimary: '#111111',
  textSecondary: '#595959',
  textTertiary: '#737373',
  hairline: '#EAEAEA', // 구분선
  surface: '#F5F5F5', // 옅은 채움 (입력창, 검색창)
};

// 플랫폼별 공통 치수
export const layout = {
  // 화면 상단 여백: 네이티브는 상태바만큼, 웹은 조금만
  statusBarPad: Platform.select({ ios: 56, web: 24, default: 44 }) as number,
  // 화면 하단 여백: iOS 홈 인디케이터 대응
  bottomPad: Platform.select({ ios: 26, default: 10 }) as number,
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
  micro: { fontSize: 11, fontWeight: '500' as const },
};

export type TypographyVariant = keyof typeof typography;
