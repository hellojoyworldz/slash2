import {
  ComponentType,
  forwardRef,
  ReactNode,
  useImperativeHandle,
  useMemo,
} from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme-context';

// ReanimatedSwipeable이 웹에서 measure() 실패로 열림 폭을 0으로 계산하는 문제가 있어서,
// 액션 폭을 상수로 받는 단순한 스와이프 행을 직접 구현했다.
export interface SwipeableRowMethods {
  close: () => void;
}

// 왼쪽에서 왼→오 순서로 드러나는 액션 하나.
export interface SwipeAction {
  key: string;
  /** lucide 아이콘 컴포넌트 (색은 fg로 주입) */
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  /** 아이콘 전용이라 스크린리더 라벨 필수 */
  label: string;
  onPress: () => void;
  /** 블록 배경. 기본 ink (앱 크롬은 흑백 — destructive 전용 색 없음) */
  bg?: string;
  /** 아이콘 색. 기본 inverse */
  fg?: string;
}

interface Props {
  /** 왼쪽에서 드러나는 액션들. 왼→오 순서로 배치된다. */
  actions: SwipeAction[];
  /** 액션 한 칸의 폭 (기본 68) */
  actionWidth?: number;
  /** 드래그 시작/끝 알림 (끝나고 잠깐 뒤 false) */
  onDragStateChange?: (dragging: boolean) => void;
  /** 열림/닫힘 상태 알림 */
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

const DEFAULT_ACTION_WIDTH = 68;
const SPRING = { damping: 22, stiffness: 280, mass: 0.6 };

export const SwipeableRow = forwardRef<SwipeableRowMethods, Props>(
  function SwipeableRow(
    {
      actions,
      actionWidth = DEFAULT_ACTION_WIDTH,
      onDragStateChange,
      onOpenChange,
      children,
    },
    ref,
  ) {
    const { colors } = useTheme();
    const styles = useMemo(() => makeStyles(colors), [colors]);
    const totalWidth = actionWidth * actions.length;
    const translateX = useSharedValue(0);
    const startX = useSharedValue(0);

    const closeSelf = () => {
      translateX.value = withSpring(0, SPRING);
      onOpenChange?.(false);
    };

    useImperativeHandle(ref, () => ({
      close: closeSelf,
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
      // 가로로 10px 이상 움직여야 스와이프로 인식 (세로 스크롤·그립 드래그와 충돌 방지)
      .activeOffsetX([-10, 10])
      .failOffsetY([-12, 12])
      .onStart(() => {
        startX.value = translateX.value;
        runOnJS(notifyDrag)(true);
      })
      .onUpdate((event) => {
        const next = startX.value + event.translationX;
        translateX.value = Math.min(totalWidth, Math.max(0, next));
      })
      .onEnd(() => {
        const open = translateX.value > totalWidth / 2;
        translateX.value = withSpring(open ? totalWidth : 0, SPRING);
        runOnJS(notifyOpen)(open);
        runOnJS(notifyDrag)(false);
      });

    const rowStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: translateX.value }],
    }));

    // 액션 스트립은 행이 밀려난 만큼(translateX)만 폭을 가진다 — overflow:hidden으로 클립되어
    // 왼→오 [고정][삭제][수정]가 점진적으로 드러난다.
    // 닫힘(translateX≈0)이면 폭 0이라 뒤에 깔린 게 아예 없다 → 행을 눌러 activeOpacity로
    // 흐려지거나 몇 px 밀려도 비칠 것이 없다(no-flash를 구조적으로 보장).
    // 별도 opacity 게이팅(이산값)은 웹(RNW)에서 재도색이 안 돼 스트립이 투명하게 고착되던
    // 문제가 있어, 이미 확실히 재도색되는 translateX(=transform과 같은 값)로 폭을 몰아 통일한다.
    const revealStyle = useAnimatedStyle(() => ({
      width: Math.max(0, translateX.value),
    }));

    return (
      <View style={styles.container}>
        <Animated.View style={[styles.actionArea, revealStyle]}>
          {actions.map((a) => {
            const Icon = a.icon;
            const fg = a.fg ?? colors.inverse;
            return (
              <TouchableOpacity
                key={a.key}
                style={[
                  styles.actionBlock,
                  { width: actionWidth, backgroundColor: a.bg ?? colors.ink },
                ]}
                activeOpacity={0.85}
                onPress={() => {
                  a.onPress();
                  closeSelf();
                }}
                accessibilityRole="button"
                accessibilityLabel={a.label}
              >
                <Icon size={22} strokeWidth={2} color={fg} />
              </TouchableOpacity>
            );
          })}
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View style={rowStyle}>{children}</Animated.View>
        </GestureDetector>
      </View>
    );
  },
);

const makeStyles = (_colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      overflow: 'hidden',
    },
    // 폭은 revealStyle(=translateX)이 애니메이트한다. overflow:hidden으로 블록을 클립해
    // 드러난 만큼만 보이게 한다. top/bottom:0이라 폭과 무관하게 행 높이를 채운다.
    actionArea: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      flexDirection: 'row',
      overflow: 'hidden',
    },
    // 플랫 블록: 그림자·라운드 0 (DESIGN). 폭 고정·수축 금지라 좁은 스트립에서 넘쳐 클립된다.
    actionBlock: {
      flexGrow: 0,
      flexShrink: 0,
      alignSelf: 'stretch',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 0,
    },
  });
