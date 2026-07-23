import {
  ComponentType,
  forwardRef,
  ReactNode,
  useImperativeHandle,
  useMemo,
} from 'react';
import type {
  AccessibilityActionEvent,
  AccessibilityActionInfo,
} from 'react-native';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { hapticSelection } from '../haptics';
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

// 스크린리더 대안: 스와이프는 포인터 제스처라 스크린리더 사용자에겐 액션이 보이지 않는다.
// 각 스와이프 액션을 접근성 커스텀 액션으로 노출해, 소비처가 행 터처블에 스프레드하면
// 스크린리더 로터/액션 메뉴에서 [고정][삭제][수정] 등을 그대로 실행할 수 있다.
export interface SwipeActionsA11y {
  accessibilityActions: AccessibilityActionInfo[];
  onAccessibilityAction: (e: AccessibilityActionEvent) => void;
}

// 훅이 아닌 순수 함수 — 훅을 쓸 수 없는 곳(FlatList renderItem 등)에서 인라인으로 만든다.
export function buildSwipeActionsA11y(actions: SwipeAction[]): SwipeActionsA11y {
  return {
    accessibilityActions: actions.map((a) => ({ name: a.key, label: a.label })),
    onAccessibilityAction: (e) => {
      actions.find((a) => a.key === e.nativeEvent.actionName)?.onPress();
    },
  };
}

// 컴포넌트 안에서 쓰는 메모이즈 버전(권장). 반환값을 행 터처블에 스프레드한다.
export function useSwipeActionsA11y(actions: SwipeAction[]): SwipeActionsA11y {
  return useMemo(() => buildSwipeActionsA11y(actions), [actions]);
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
// 임계감쇠에 가까운 스프링(바운스 없음 — DESIGN의 브루탈 미감). reduceMotion은 시스템 설정을 따른다:
// 접근성 "동작 줄이기"가 켜지면 Reanimated가 즉시 착지로 대체한다(이음새 애니메이션 생략).
const SPRING = {
  damping: 22,
  stiffness: 280,
  mass: 0.6,
  reduceMotion: ReduceMotion.System,
} as const;
// Apple 감속 투영: 손을 뗀 속도로 관성 착지점을 예측한다(scroll deceleration과 같은 지수감쇠).
// 0.998/(1-0.998) = 499 → projected = translateX + velocityX*0.499.
const DECELERATION = 0.998;
// 속도가 이보다 크면(px/s) 위치가 아니라 속도 "부호"로 열림/닫힘을 정한다(플릭 존중).
const FLICK_VELOCITY = 300;
// 러버밴드 저항 계수(경계 밖으로 끌수록 덜 따라온다 — Apple rubberband).
const RUBBER = 0.55;

// 경계 밖으로 넘어간 만큼(overshoot)을 점진 저항으로 감쇠한다. 안쪽(0..dimension)은 그대로.
function rubberband(overshoot: number, dimension: number, c: number): number {
  'worklet';
  return (overshoot * dimension * c) / (dimension + c * Math.abs(overshoot));
}
// 하드 클램프 대신 러버밴드: 0 미만·total 초과 구간만 저항으로 감쇠, 안쪽은 1:1 추종.
function withRubberband(v: number, total: number): number {
  'worklet';
  if (v < 0) return rubberband(v, total, RUBBER); // 음수 → 감쇠된 음수(위/왼쪽 저항)
  if (v > total) return total + rubberband(v - total, total, RUBBER);
  return v;
}
function projectMomentum(velocityX: number): number {
  'worklet';
  return (velocityX / 1000) * (DECELERATION / (1 - DECELERATION));
}

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
    // 드래그 중 열림 임계(totalWidth/2)를 기준으로 지금 어느 쪽인지(1=열림쪽/0=닫힘쪽).
    // 교차하는 순간에만 hapticSelection 1회 — 방향 재교차 시 다시 1회(연타 방지 래치).
    const crossedOpen = useSharedValue(0);

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
        // 시작 시점이 이미 어느 쪽인지로 래치를 초기화 — 닫힌 상태에서 시작하면 첫 열림 교차가 1회 발화.
        crossedOpen.value = translateX.value > totalWidth / 2 ? 1 : 0;
        runOnJS(notifyDrag)(true);
      })
      .onUpdate((event) => {
        const next = startX.value + event.translationX;
        // 하드 클램프 대신 러버밴드: 경계(0..totalWidth) 밖은 저항으로 감쇠, 놓으면 스프링 복귀.
        translateX.value = withRubberband(next, totalWidth);
        // 열림 임계 교차 순간 hapticSelection 1회. 방향이 바뀌어 다시 넘으면 또 1회(래치로 연타 방지).
        const side = translateX.value > totalWidth / 2 ? 1 : 0;
        if (side !== crossedOpen.value) {
          crossedOpen.value = side;
          runOnJS(hapticSelection)();
        }
      })
      .onEnd((event) => {
        // 관성 투영으로 착지점을 예측한다 — 위치가 아니라 "속도가 데려갈 곳"으로 열림/닫힘 결정.
        // 속도가 명확하면(플릭) 속도 부호가 우선: 오른쪽(+)=열림, 왼쪽(-)=닫힘.
        const projected = translateX.value + projectMomentum(event.velocityX);
        const open =
          Math.abs(event.velocityX) > FLICK_VELOCITY
            ? event.velocityX > 0
            : projected > totalWidth / 2;
        // 릴리즈 속도를 스프링에 넘겨(velocity handoff) 드래그→애니메이션 이음새를 없앤다.
        translateX.value = withSpring(open ? totalWidth : 0, {
          ...SPRING,
          velocity: event.velocityX,
        });
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
