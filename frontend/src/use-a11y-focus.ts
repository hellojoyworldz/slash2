import { useEffect, useRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Platform, View } from 'react-native';

// 모달 열림 시 스크린리더 포커스를 타이틀로 옮기는 공용 훅. 소비처(ModalCard·
// MessageActionMenu·PickerModal 등)는 반환된 ref를 타이틀 래퍼(View, tabIndex={-1})에 건다.
// visible이 true로 바뀐 뒤 짧은 지연(~100ms, 플랫폼 렌더 안정화 대기) 후:
// - 웹: ref.current?.focus?.() — RNW View는 tabIndex가 있으면 실제 DOM 포커스가 가능하다.
// - 네이티브: findNodeHandle로 얻은 노드에 AccessibilityInfo.setAccessibilityFocus.
// visible prop이 없는 구조(마운트=열림)라면 true 고정으로 넘기면 마운트 시점에 1회 발화한다.
export function useModalA11yFocus(visible: boolean) {
  const ref = useRef<View>(null);
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      if (Platform.OS === 'web') {
        (ref.current as unknown as { focus?: () => void } | null)?.focus?.();
      } else {
        const node = findNodeHandle(ref.current);
        if (node != null) AccessibilityInfo.setAccessibilityFocus(node);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [visible]);
  return ref;
}
