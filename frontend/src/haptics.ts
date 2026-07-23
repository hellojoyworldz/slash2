import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// 플랫폼 게이트된 햅틱. 웹(react-native-web)에는 진동 하드웨어 계약이 없어 전부 no-op —
// expo-haptics 웹 빌드도 no-op이지만, 여기서 한 번 더 막아 번들·호출을 확실히 비활성한다.
// 실패(권한·미지원 기기)는 조용히 무시한다(.catch) — 햅틱은 부가 피드백이라 앱 흐름을 막지 않는다.
//
// 과용 금지(멀티모달 피드백 utility 규칙): 상태가 바뀌는 "의미 있는 순간"에만 부른다.
// 일반 버튼 탭·스크롤 등 흔한 동작에는 넣지 않는다.
const enabled = Platform.OS !== 'web';

// 값/상태 토글, 임계 교차 틱(재정렬 hop, 스와이프 열림 임계 교차 등).
export function hapticSelection(): void {
  if (!enabled) return;
  Haptics.selectionAsync().catch(() => {});
}

// 가벼운 커밋 — 전송 성공, 드롭(재정렬 놓기).
export function hapticImpactLight(): void {
  if (!enabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

// 들어올림 — 드래그 리프트(잡힘), 컨텍스트 메뉴 열림.
export function hapticImpactMedium(): void {
  if (!enabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}
