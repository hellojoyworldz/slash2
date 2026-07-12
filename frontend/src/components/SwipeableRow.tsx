import { forwardRef, ReactNode, useImperativeHandle } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

// ReanimatedSwipeable이 웹에서 measure() 실패로 열림 폭을 0으로 계산하는 문제가 있어서,
// 액션 폭을 상수로 받는 단순한 스와이프 행을 직접 구현했다.
export interface SwipeableRowMethods {
  close: () => void;
}

interface Props {
  /** 왼쪽에서 나오는 액션 영역의 폭 */
  actionWidth: number;
  /** 행 뒤에 깔리는 액션 (고정 버튼 등) */
  action: ReactNode;
  /** 드래그 시작/끝 알림 (끝나고 잠깐 뒤 false) */
  onDragStateChange?: (dragging: boolean) => void;
  /** 열림/닫힘 상태 알림 */
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

const SPRING = { damping: 22, stiffness: 280, mass: 0.6 };

export const SwipeableRow = forwardRef<SwipeableRowMethods, Props>(
  function SwipeableRow(
    { actionWidth, action, onDragStateChange, onOpenChange, children },
    ref,
  ) {
    const translateX = useSharedValue(0);
    const startX = useSharedValue(0);

    useImperativeHandle(ref, () => ({
      close: () => {
        translateX.value = withSpring(0, SPRING);
        onOpenChange?.(false);
      },
    }));

    const notifyDrag = (dragging: boolean) => {
      if (!onDragStateChange) return;
      if (dragging) onDragStateChange(true);
      // 드래그 종료 직후의 탭(마우스 업)이 행 탭으로 처리되지 않도록 잠깐 유지
      else setTimeout(() => onDragStateChange(false), 150);
    };

    const notifyOpen = (open: boolean) => {
      onOpenChange?.(open);
    };

    const pan = Gesture.Pan()
      // 가로로 10px 이상 움직여야 스와이프로 인식 (세로 스크롤과 충돌 방지)
      .activeOffsetX([-10, 10])
      .failOffsetY([-12, 12])
      .onStart(() => {
        startX.value = translateX.value;
        runOnJS(notifyDrag)(true);
      })
      .onUpdate((event) => {
        const next = startX.value + event.translationX;
        translateX.value = Math.min(actionWidth, Math.max(0, next));
      })
      .onEnd(() => {
        const open = translateX.value > actionWidth / 2;
        translateX.value = withSpring(open ? actionWidth : 0, SPRING);
        runOnJS(notifyOpen)(open);
        runOnJS(notifyDrag)(false);
      });

    const rowStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: translateX.value }],
    }));

    return (
      <View style={styles.container}>
        <View style={[styles.action, { width: actionWidth }]}>{action}</View>
        <GestureDetector gesture={pan}>
          <Animated.View style={rowStyle}>{children}</Animated.View>
        </GestureDetector>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  action: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
});
