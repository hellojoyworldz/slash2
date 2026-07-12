import { Platform } from 'react-native';

// 흑백 미니멀 팔레트
// 원칙: 검정(#111)은 "내 말풍선·주요 버튼·활성 상태"에만 아껴 쓰고,
// 구분선과 보조 요소는 회색 단계로 위계를 만든다.
export const colors = {
  background: '#FFFFFF',
  ink: '#111111', // 채움용 검정 (말풍선, 주요 버튼, 아바타)
  inverse: '#FFFFFF', // 검정 위에 올라가는 글자
  textPrimary: '#111111',
  textSecondary: '#767676',
  textTertiary: '#ABABAB',
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
