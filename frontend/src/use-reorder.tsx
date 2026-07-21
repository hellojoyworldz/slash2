import {
  ComponentType,
  MutableRefObject,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, StyleProp, View, ViewStyle } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

// 균일 높이 행 목록의 그립 드래그 재정렬 — 분류 탭(FriendsScreen)과 같은 아키텍처를
// 행 높이가 일정한 목록(자동구분 탭·태그 탭)용으로 압축한 공용 훅.
// 드래그 중 데이터·셀은 불변, translateY만 움직인다:
//  · 잡은 행: dragY(손가락 추종) · 다른 행: 슬롯 hop마다 ∓rowHeight 비켜남(withTiming).
// 커밋은 놓을 때 1회(splice + onCommit). orderRef(id 배열)는 caller가 데이터와 함께 관리한다.

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// 들린 행: opacity(그림자 금지 — DESIGN) + zIndex/elevation로 형제 위로.
const LIFT = { opacity: 0.95, zIndex: 10, elevation: 10 } as const;
// 들린 셀(형제 셀 위로): 셀 레벨 zIndex/elevation. elevation은 Android 그림자를 유발하므로
// shadowColor 투명화로 최소화(DESIGN 그림자 금지에 대한 최선의 근사치).
const LIFT_CELL = { zIndex: 20, elevation: 20, shadowColor: 'transparent' } as const;
const SHIFT_TIMING = { duration: 130 } as const;

// 웹에서만 그랩 커서(RN 타입에 없는 값이라 캐스팅).
export const grabCursor: ViewStyle | null =
  Platform.OS === 'web'
    ? ({ cursor: 'grab' } as unknown as ViewStyle)
    : null;

// RNW(react-native-web) VirtualizedListCellRenderer가 CellRendererComponent에 내려주는 props.
// 기본 셀은 `<View style={cellStyle} onFocusCapture onLayout>`이고(vertical 목록에선 style=undefined),
// onLayout이 VirtualizedList의 셀 높이 측정·가상화·스크롤 콘텐츠 높이 산출의 유일한 경로다.
type ReorderCellProps = {
  index?: number;
  item?: unknown;
  cellKey?: string;
  style?: StyleProp<ViewStyle>;
  onFocusCapture?: (e: unknown) => void;
  onLayout?: (e: unknown) => void;
  children?: ReactNode;
};

// FlatList의 CellRendererComponent — 잡은 행이 속한 "셀" 자체(형제 뷰)에 zIndex/elevation을 준다.
// 셀 자식(ReorderRow)에만 zIndex를 줘도 웹은 대체로 위로 뜨지만, 네이티브(iOS/Android)에선 실제
// 형제 관계가 이 셀 레벨이라 셀 자체를 들어야 이웃 셀 위로 확실히 올라간다.
//
// ⚠️ 셀은 반드시 일반 View다 — reanimated Animated.View로 감싸지 않는다.
//   RNW VirtualizedList는 각 셀에 onLayout(=onCellLayout)을 걸어 높이를 측정하는데, 셀을
//   Animated.View로 감싸면 이 측정/셀 레이아웃 계약이 어긋나 리스트가 패널 높이를 무시하고
//   전 행을 흘려버려 내부 스크롤이 죽는다(실측 회귀). 그래서 여기서는 기본 RNW 셀
//   (`<View style onFocusCapture onLayout>`)을 그대로 재현하고, RNW가 내려주는 props를
//   빠짐없이 보존한다(style·onFocusCapture·onLayout 전달, index/item/cellKey는 소비).
//
// 들림 표시는 reanimated 없이 상태 기반으로 처리한다: 드래그는 세션당 1회(setDraggingId) 리렌더를
// 유발하고 그때 FlatList의 extraData로 셀도 다시 렌더되므로, 그 시점에 activeIndexRef.current를 읽어
// 잡힌 셀에만 zIndex/elevation을 준다(세션당 1회 스타일 변경 — 위치 애니메이션은 ReorderRow 담당).
// FriendsScreen(분류 탭)의 자체 useDragReorder도 이 헬퍼를 재사용한다(같은 number ref 계약).
export function createReorderCellRenderer(
  activeIndexRef: MutableRefObject<number>,
): ComponentType<any> {
  return function ReorderCellRenderer({
    index,
    // item·cellKey는 소비만 한다(기본 RNW 셀도 이 둘을 DOM에 넘기지 않는다).
    item: _item,
    cellKey: _cellKey,
    style,
    onFocusCapture,
    onLayout,
    children,
  }: ReorderCellProps) {
    const lifted = index != null && activeIndexRef.current === index;
    // onFocusCapture는 RNW 전용 prop이라 RN View 타입엔 없다 — 기본 RNW 셀처럼 그대로 전달하되
    // 스프레드로 타입을 우회한다(onLayout은 RN 타입에 존재).
    const webProps = { onFocusCapture } as Record<string, unknown>;
    return (
      <View style={[style, lifted && LIFT_CELL]} onLayout={onLayout as never} {...webProps}>
        {children}
      </View>
    );
  };
}

export interface ReorderControls {
  /** 세션당 1회만 바뀌는 "들린 행" id(null=유휴) — 들린 스타일·scrollEnabled에 쓴다. */
  draggingId: string | null;
  activeIndex: SharedValue<number>;
  targetIndex: SharedValue<number>;
  dragY: SharedValue<number>;
  rowHeight: SharedValue<number>;
  /** id별 Pan 제스처(캐시됨) — 그립 GestureDetector에 물린다. */
  getGesture: (id: string) => ReturnType<typeof Gesture.Pan>;
  /** 접근성 increment/decrement — 위/아래로 한 칸. */
  moveByOne: (id: string, delta: number) => void;
  /** FlatList의 `CellRendererComponent`에 그대로 물린다 — 잡은 행의 셀을 이웃 위로 올린다. */
  CellRendererComponent: ComponentType<any>;
}

export function useReorder(opts: {
  rowHeight: number;
  /** 현재 순서의 원천(드래그 중 불변, 놓을 때만 커밋). caller가 데이터와 동기화한다. */
  orderRef: MutableRefObject<string[]>;
  /** 확정된 새 순서(id 배열)를 저장. 낙관적 반영·서버 저장은 caller가 한다. */
  onCommit: (ids: string[]) => void;
}): ReorderControls {
  const { rowHeight, orderRef, onCommit } = opts;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const activeIndex = useSharedValue(-1);
  // 셀 렌더러가 "잡힌 셀"을 판별하는 JS-스레드 값(SharedValue는 UI 스레드라 셀 리렌더에서 못 읽는다).
  // 세션당 1회 리렌더 시점(draggingId 변경)에만 읽히므로 ref로 충분하다.
  const activeIndexRef = useRef(-1);
  const targetIndex = useSharedValue(-1);
  const dragY = useSharedValue(0);
  // 균일 높이(상수) — ReorderRow 오프셋 애니메이션에서만 UI 스레드로 읽는다.
  // 렌더 중 .value 쓰기 경고를 피하려 useEffect로만 동기화한다.
  const rowH = useSharedValue(rowHeight);
  useEffect(() => {
    rowH.value = rowHeight;
  }, [rowHeight, rowH]);
  const startIndexRef = useRef(0);
  const boundsRef = useRef({ min: 0, max: 0 });

  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  const moveByOne = useCallback(
    (id: string, delta: number) => {
      const arr = orderRef.current;
      const idx = arr.indexOf(id);
      if (idx < 0) return;
      const target = clamp(idx + delta, 0, arr.length - 1);
      if (target === idx) return;
      const next = [...arr];
      const [moved] = next.splice(idx, 1);
      next.splice(target, 0, moved);
      orderRef.current = next;
      commitRef.current(next);
    },
    [orderRef],
  );

  // 제스처는 id별로 한 번만 만들어 캐시한다 — 목록 재정렬로 리렌더돼도 같은 객체를 받아
  // 드래그 도중 재부착되지 않는다(FriendsScreen과 동일 관례).
  const gesturesRef = useRef(new Map<string, ReturnType<typeof Gesture.Pan>>());
  const getGesture = useCallback(
    (id: string) => {
      const cache = gesturesRef.current;
      const cached = cache.get(id);
      if (cached) return cached;
      const gesture = Gesture.Pan()
        .runOnJS(true)
        .activeOffsetY([-6, 6])
        .onStart(() => {
          const idx = orderRef.current.indexOf(id);
          if (idx < 0) return;
          const n = orderRef.current.length;
          startIndexRef.current = idx;
          boundsRef.current = {
            min: -idx * rowH.value,
            max: (n - 1 - idx) * rowH.value,
          };
          activeIndex.value = idx;
          activeIndexRef.current = idx; // 셀 렌더러가 리렌더 시점에 읽어 잡힌 셀을 든다
          targetIndex.value = idx;
          dragY.value = 0;
          setDraggingId(id); // 세션당 1회 리렌더(들린 스타일 + scrollEnabled false)
        })
        .onUpdate((event) => {
          const n = orderRef.current.length;
          if (n === 0) return;
          const { min, max } = boundsRef.current;
          dragY.value = clamp(event.translationY, min, max);
          const hop = Math.round(dragY.value / rowH.value);
          targetIndex.value = clamp(startIndexRef.current + hop, 0, n - 1);
        })
        .onFinalize(() => {
          const start = startIndexRef.current;
          const target = targetIndex.value;
          const n = orderRef.current.length;
          if (target !== start && target >= 0 && target < n && activeIndex.value !== -1) {
            const next = [...orderRef.current];
            const [moved] = next.splice(start, 1);
            next.splice(target, 0, moved);
            orderRef.current = next;
            commitRef.current(next);
          }
          // 커밋과 동시에 리셋 — activeIndex=-1이면 offset이 즉시 0이 되어 새 데이터 순서와
          // 정확히 맞물려 시각 점프가 없다.
          activeIndex.value = -1;
          activeIndexRef.current = -1;
          targetIndex.value = -1;
          dragY.value = 0;
          setDraggingId(null);
        });
      cache.set(id, gesture);
      return gesture;
    },
    [orderRef, activeIndex, targetIndex, dragY, rowH],
  );

  const CellRendererComponent = useMemo(
    () => createReorderCellRenderer(activeIndexRef),
    [],
  );

  return {
    draggingId,
    activeIndex,
    targetIndex,
    dragY,
    rowHeight: rowH,
    getGesture,
    moveByOne,
    CellRendererComponent,
  };
}

// 재정렬 애니메이션 래퍼: 잡은 행은 dragY 추종, 나머지는 슬롯 비켜남(offset).
// 균일 높이라 비켜남 폭은 rowHeight 하나로 통일된다.
export function ReorderRow({
  index,
  isDragging,
  controls,
  children,
}: {
  index: number;
  isDragging: boolean;
  controls: ReorderControls;
  children: ReactNode;
}) {
  const { activeIndex, targetIndex, dragY, rowHeight } = controls;
  const offset = useDerivedValue(() => {
    const ai = activeIndex.value;
    if (ai === -1) return 0; // 유휴/커밋: 즉시 0(데이터가 새 순서로 바뀌므로 점프 없음)
    if (index === ai) return 0; // 잡은 행은 dragY로 처리
    const ti = targetIndex.value;
    const h = rowHeight.value;
    if (ai < ti && index > ai && index <= ti) return withTiming(-h, SHIFT_TIMING);
    if (ai > ti && index >= ti && index < ai) return withTiming(h, SHIFT_TIMING);
    return withTiming(0, SHIFT_TIMING);
  });
  const rowStyle = useAnimatedStyle(() => {
    const grabbed = activeIndex.value === index;
    return { transform: [{ translateY: grabbed ? dragY.value : offset.value }] };
  });
  return (
    <Animated.View style={[rowStyle, isDragging && LIFT]}>{children}</Animated.View>
  );
}
