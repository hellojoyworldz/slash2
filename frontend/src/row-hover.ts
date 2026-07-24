import { ViewStyle } from 'react-native';
import { ThemeColors } from './theme';

// 목록 행 hover/press 피드백 — DESIGN.md 관례대로 colors.surface 채움(보더·그림자 없음).
// 앱의 "선택 active"·"눌림"과 같은 토큰이라 하나의 문법으로 통일한다:
//   hover = press = selected = surface 채움.
// (pressed가 이미 surface인 목록이 많아, hover는 같은 값으로 정합시킨다 — 표시가 목적.)
// RN 네이티브에선 Pressable의 hovered가 항상 false라 자동으로 무효 → Platform 분기 불필요.
export function rowFill(
  colors: ThemeColors,
  s: { hovered?: boolean; pressed?: boolean; selected?: boolean },
): ViewStyle | false {
  return s.hovered || s.pressed || s.selected
    ? { backgroundColor: colors.surface }
    : false;
}
