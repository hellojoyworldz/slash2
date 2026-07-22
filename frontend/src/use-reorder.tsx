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
import {
  ComposedGesture,
  Gesture,
  GestureType,
} from 'react-native-gesture-handler';
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
// 드래그 세션 동안 web 전역 커서를 grabbing으로 강제한다. 래퍼에만 grabbing을 얹으면
// 포인터 아래 자식(행 Pressable·Touchable·onPress Text 등 RNW cursor:pointer)이 이겨서
// 사용자에겐 grabbing이 안 보인다 — body/documentElement에 !important로 박아 무엇이든 덮는다.
// 리스트·탭 재정렬(useReorder·useVarReorder·useDragReorder·useTabReorder)의 onStart/onFinalize에서
// 짝으로 호출한다. 물리적으로 한 번에 한 포인터라 refcount로 겹침도 안전하게 처리한다.
let grabbingCursorLocks = 0;
export function beginGlobalGrabbingCursor() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  grabbingCursorLocks += 1;
  if (grabbingCursorLocks === 1) {
    document.body?.style.setProperty('cursor', 'grabbing', 'important');
    document.documentElement?.style.setProperty('cursor', 'grabbing', 'important');
  }
}
export function endGlobalGrabbingCursor() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (grabbingCursorLocks === 0) return;
  grabbingCursorLocks -= 1;
  if (grabbingCursorLocks === 0) {
    document.body?.style.removeProperty('cursor');
    document.documentElement?.style.removeProperty('cursor');
  }
}
// 들린 셀(형제 셀 위로): 셀 레벨 zIndex/elevation. elevation은 Android 그림자를 유발하므로
// shadowColor 투명화로 최소화(DESIGN 그림자 금지에 대한 최선의 근사치).
const LIFT_CELL = { zIndex: 20, elevation: 20, shadowColor: 'transparent' } as const;
const SHIFT_TIMING = { duration: 130 } as const;

// 행 아무데나 꾹 눌렀다 끌면 재정렬되는 롱프레스 시간(ms). 이 시간 전에 손가락이 움직이면
// 드래그는 활성되지 않고 리스트 스크롤(세로)·스와이프(가로)에 양보한다.
export const LONG_PRESS_MS = 250;
// 롱프레스로 팬이 활성됐지만 이동이 이 픽셀 이하면 "꾹 눌렀다 그냥 뗌"으로 보고 탭(행 열기)으로
// 승격한다. 이 값을 넘게 움직였으면 드래그 시도로 보고 승격하지 않는다(재정렬만 또는 무시).
const TAP_PROMOTE_MAX_MOVE = 6;
// 더블탭 두 번째 탭을 기다리는 최대 지연(ms) — 싱글탭(방 열기)이 이만큼만 늦어지도록 짧게.
const DOUBLE_TAP_MAX_DELAY = 200;

// GestureDetector의 gesture prop에 넣을 수 있는 형태(단일 or 합성).
export type RowGesture = ComposedGesture | GestureType;

// 탭 제스처 합성: 싱글탭(활성/열기)·더블탭(수정). 더블탭이 있으면 Exclusive로 싱글탭이 더블탭
// 실패를 기다린다(오열림 방지, maxDelay로 지연 최소화). 둘 다 없으면 null(탭 없는 행 — 더보기 메뉴).
export function buildTapGesture(
  activate?: () => void,
  edit?: () => void,
): RowGesture | null {
  const doubleTap = edit
    ? Gesture.Tap()
        .numberOfTaps(2)
        .maxDelay(DOUBLE_TAP_MAX_DELAY)
        .runOnJS(true)
        .onEnd((_e, success) => {
          if (success) edit();
        })
    : null;
  const singleTap = activate
    ? Gesture.Tap()
        .numberOfTaps(1)
        .runOnJS(true)
        .onEnd((_e, success) => {
          if (success) activate();
        })
    : null;
  if (doubleTap && singleTap) return Gesture.Exclusive(doubleTap, singleTap);
  return doubleTap ?? singleTap;
}

// 행 제스처: 롱프레스 드래그(세로) + 탭(열기/수정)을 Race로 묶는다. 방향(세로 드래그 vs 가로
// 스와이프)·타이밍(꾹 누름 vs 빠른 탭)으로 갈려 한 번에 하나만 활성된다. 탭이 없으면 드래그만.
export function composeRowGesture(
  dragPan: GestureType,
  handlers: { activate?: () => void; edit?: () => void },
): RowGesture {
  const taps = buildTapGesture(handlers.activate, handlers.edit);
  return taps ? Gesture.Race(dragPan, taps) : dragPan;
}

// 롱프레스 드래그로 활성되는 세로 Pan 제스처의 공통 방향 설정(재정렬 물리는 caller가 붙인다).
export function withDragActivation<T extends ReturnType<typeof Gesture.Pan>>(pan: T): T {
  return pan
    // 세로 드래그(재정렬)로만 활성 — 가로 움직임엔 실패해 스와이프에 양보한다.
    .activeOffsetY([-6, 6])
    .failOffsetX([-12, 12])
    // 행 아무데나 꾹 눌렀다(≈250ms) 끌면 재정렬 — 리스트 세로 스크롤과 충돌하지 않는다.
    .activateAfterLongPress(LONG_PRESS_MS) as T;
}

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
  /** id별 행 제스처(캐시됨) — 롱프레스 드래그 + 탭(열기/수정). 행 전체 GestureDetector에 물린다. */
  getGesture: (id: string) => RowGesture;
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
  /** 싱글탭(행 열기) — 넘기면 행에 탭 열기가 붙는다. 없으면 탭 없는 행(더보기 메뉴). */
  onActivate?: (id: string) => void;
  /** 더블탭(수정) — 넘기면 행 더블탭에 수정이 붙는다. 없으면 수정 없음(자동구분). */
  onEditRequest?: (id: string) => void;
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
  // 이 드래그 세션에서 활성 임계 이상 움직였는지 — onFinalize에서 "꾹 눌렀다 그냥 뗌"(탭 승격) 판별.
  const movedRef = useRef(false);

  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  // 탭 콜백은 캐시된 제스처가 최신을 읽도록 ref로 보관(제스처는 id별 1회만 생성).
  const onActivateRef = useRef(opts.onActivate);
  const onEditRef = useRef(opts.onEditRequest);
  onActivateRef.current = opts.onActivate;
  onEditRef.current = opts.onEditRequest;

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
  const gesturesRef = useRef(new Map<string, RowGesture>());
  const getGesture = useCallback(
    (id: string) => {
      const cache = gesturesRef.current;
      const cached = cache.get(id);
      if (cached) return cached;
      const dragPan = withDragActivation(Gesture.Pan().runOnJS(true))
        .onStart(() => {
          const idx = orderRef.current.indexOf(id);
          if (idx < 0) return;
          const n = orderRef.current.length;
          startIndexRef.current = idx;
          boundsRef.current = {
            min: -idx * rowH.value,
            max: (n - 1 - idx) * rowH.value,
          };
          movedRef.current = false;
          activeIndex.value = idx;
          activeIndexRef.current = idx; // 셀 렌더러가 리렌더 시점에 읽어 잡힌 셀을 든다
          targetIndex.value = idx;
          dragY.value = 0;
          beginGlobalGrabbingCursor(); // web: 드래그 내내 grabbing 커서 강제
          setDraggingId(id); // 세션당 1회 리렌더(들린 스타일 + scrollEnabled false)
        })
        .onUpdate((event) => {
          const n = orderRef.current.length;
          if (n === 0) return;
          if (Math.abs(event.translationY) > TAP_PROMOTE_MAX_MOVE) movedRef.current = true;
          const { min, max } = boundsRef.current;
          dragY.value = clamp(event.translationY, min, max);
          const hop = Math.round(dragY.value / rowH.value);
          targetIndex.value = clamp(startIndexRef.current + hop, 0, n - 1);
        })
        .onFinalize(() => {
          const start = startIndexRef.current;
          const target = targetIndex.value;
          const activated = activeIndex.value !== -1;
          const n = orderRef.current.length;
          if (activated && target !== start && target >= 0 && target < n) {
            const next = [...orderRef.current];
            const [moved] = next.splice(start, 1);
            next.splice(target, 0, moved);
            orderRef.current = next;
            commitRef.current(next);
          } else if (activated && target === start && !movedRef.current) {
            // 꾹 눌렀다 이동 없이 뗌 → 팬이 Tap 제스처를 눌러 죽였으므로 여기서 행 열기를 승격 발화.
            // (빠른 탭은 팬이 활성되지 않아 여긴 안 옴 → Tap 제스처가 처리, 이중 발화 없음.)
            onActivateRef.current?.(id);
          }
          // 커밋과 동시에 리셋 — activeIndex=-1이면 offset이 즉시 0이 되어 새 데이터 순서와
          // 정확히 맞물려 시각 점프가 없다.
          activeIndex.value = -1;
          activeIndexRef.current = -1;
          targetIndex.value = -1;
          dragY.value = 0;
          endGlobalGrabbingCursor(); // web: 전역 grabbing 커서 해제
          setDraggingId(null);
        });
      const composite = composeRowGesture(dragPan, {
        activate: onActivateRef.current ? () => onActivateRef.current?.(id) : undefined,
        edit: onEditRef.current ? () => onEditRef.current?.(id) : undefined,
      });
      cache.set(id, composite);
      return composite;
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
    <Animated.View
      style={[
        rowStyle,
        isDragging && LIFT,
      ]}
    >
      {children}
    </Animated.View>
  );
}

// ── 가변 높이 재정렬 ────────────────────────────────────────────────────
// 위 useReorder는 "균일 높이" 목록용(자동구분 탭). 설명(상태메시지)이 있는 행만 더 높은
// 목록(분류·태그 탭)에서는 index*고정높이 계산이 어긋나므로, 누적 높이 기반의 가변 높이 버전을
// 쓴다. FriendsScreen이 원래 로컬로 갖고 있던 useDragReorder/AnimatedRow와 동일한 아키텍처를
// 아이템 타입에 무관하게 일반화한 것이다(태그 탭이 분류 탭과 같은 드래그 문법을 공유하도록).
//  · getOrder: 현재 순서의 원천(드래그 중 불변, 놓을 때만 커밋).
//  · getId/getHeight: 각 아이템의 id·실제 행 높이(설명 유무로 가변).
//  · onCommit(next): 놓을 때(또는 접근성 이동) 재정렬된 배열 — 호출부가 상태 반영·서버 저장.

export interface VarReorderControls {
  draggingId: string | null;
  activeIndex: SharedValue<number>;
  targetIndex: SharedValue<number>;
  dragY: SharedValue<number>;
  /** 잡은 행 "자신"의 실제 높이(설명 유무로 가변) — 다른 행이 비켜나는 폭. */
  draggedHeight: SharedValue<number>;
  getGesture: (id: string) => RowGesture;
  moveByOne: (id: string, delta: number) => void;
  CellRendererComponent: ComponentType<any>;
  /** 드래그 세션이 활성된 동안 true(onStart~onFinalize 후 다음 매크로태스크). 픽커처럼 행 탭을
   *  자식 DOM Pressable이 처리하는 목록에서, 드래그 세션 직후 따라오는 click을 눌러 무시하는 가드.
   *  (탭 제스처를 composeRowGesture로 얹는 목록은 이 ref가 필요 없다 — Race가 이미 갈라준다.) */
  didDragRef: MutableRefObject<boolean>;
}

export function useVarReorder<T>(opts: {
  getOrder: () => T[];
  getId: (item: T) => string;
  getHeight: (item: T) => number;
  onCommit: (next: T[]) => void;
  /** 싱글탭(행 열기) — composeRowGesture에 Tap을 얹는다(목록 행). 없으면 탭 없는 행(픽커: DOM Pressable이 탭 처리). */
  onActivate?: (id: string) => void;
  /** 더블탭(수정). 없으면 수정 없음. */
  onEditRequest?: (id: string) => void;
  /** "꾹 눌렀다 이동 없이 뗌"을 탭으로 승격할 때 부를 콜백. composeRowGesture Tap을 만들지 않으면서
   *  (자식 DOM Pressable이 탭을 처리하는 픽커) onFinalize 승격 경로만 필요할 때 쓴다.
   *  없으면 승격은 onActivate로 폴백한다(목록 행). */
  onPromote?: (id: string) => void;
}): VarReorderControls {
  const activeIndex = useSharedValue(-1);
  const activeIndexRef = useRef(-1);
  const targetIndex = useSharedValue(-1);
  const dragY = useSharedValue(0);
  const draggedHeight = useSharedValue(0);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const startIndexRef = useRef(0);
  const dragBoundsRef = useRef({ min: 0, max: 0 });
  const dragTopOffsetRef = useRef(0);
  const othersHeightsRef = useRef<number[]>([]);
  const gesturesRef = useRef(new Map<string, RowGesture>());
  // 이 드래그 세션에서 활성 임계 이상 움직였는지 — onFinalize의 탭 승격 판별.
  const movedRef = useRef(false);
  // 드래그 세션 가드(픽커 자식 DOM click 무시용) — onStart에서 set, onFinalize 후 매크로태스크에 해제.
  const didDragRef = useRef(false);

  // 제스처는 한 번만 생성·캐시되므로 최신 getters/onCommit을 ref로 읽는다.
  const getOrderRef = useRef(opts.getOrder);
  const getIdRef = useRef(opts.getId);
  const getHeightRef = useRef(opts.getHeight);
  const onCommitRef = useRef(opts.onCommit);
  const onActivateRef = useRef(opts.onActivate);
  const onEditRef = useRef(opts.onEditRequest);
  const onPromoteRef = useRef(opts.onPromote);
  getOrderRef.current = opts.getOrder;
  getIdRef.current = opts.getId;
  getHeightRef.current = opts.getHeight;
  onCommitRef.current = opts.onCommit;
  onActivateRef.current = opts.onActivate;
  onEditRef.current = opts.onEditRequest;
  onPromoteRef.current = opts.onPromote;

  const getGesture = useCallback(
    (id: string) => {
      const cache = gesturesRef.current;
      const cached = cache.get(id);
      if (cached) return cached;
      const dragPan = withDragActivation(Gesture.Pan().runOnJS(true))
        .onStart(() => {
          const list = getOrderRef.current();
          const getId = getIdRef.current;
          const idx = list.findIndex((f) => getId(f) === id);
          if (idx < 0) return;
          startIndexRef.current = idx;
          const heights = list.map(getHeightRef.current);
          const h = heights[idx];
          draggedHeight.value = h;
          const topOffset = heights.slice(0, idx).reduce((s, v) => s + v, 0);
          const total = heights.reduce((s, v) => s + v, 0);
          dragTopOffsetRef.current = topOffset;
          dragBoundsRef.current = { min: -topOffset, max: total - h - topOffset };
          othersHeightsRef.current = heights.filter((_, i) => i !== idx);
          movedRef.current = false;
          didDragRef.current = true; // 이 세션은 드래그 — 뒤따르는 자식 DOM click을 눌러 무시(픽커)
          activeIndex.value = idx;
          activeIndexRef.current = idx;
          targetIndex.value = idx;
          dragY.value = 0;
          beginGlobalGrabbingCursor(); // web: 드래그 내내 grabbing 커서 강제
          setDraggingId(id);
        })
        .onUpdate((event) => {
          const n = getOrderRef.current().length;
          if (n === 0) return;
          if (Math.abs(event.translationY) > TAP_PROMOTE_MAX_MOVE) movedRef.current = true;
          const { min, max } = dragBoundsRef.current;
          dragY.value = clamp(event.translationY, min, max);
          const draggedTop = dragTopOffsetRef.current + dragY.value;
          const draggedCenter = draggedTop + draggedHeight.value / 2;
          const others = othersHeightsRef.current;
          let target: number;
          if (dragY.value <= min) {
            target = 0;
          } else if (dragY.value >= max) {
            target = others.length;
          } else {
            let cum = 0;
            target = others.length;
            for (let i = 0; i < others.length; i++) {
              const mid = cum + others[i] / 2;
              if (draggedCenter < mid) {
                target = i;
                break;
              }
              cum += others[i];
            }
          }
          targetIndex.value = clamp(target, 0, n - 1);
        })
        .onFinalize(() => {
          const start = startIndexRef.current;
          const target = targetIndex.value;
          const activated = activeIndex.value !== -1;
          const list = getOrderRef.current();
          const n = list.length;
          if (activated && target !== start && target >= 0 && target < n) {
            const next = [...list];
            const [moved] = next.splice(start, 1);
            next.splice(target, 0, moved);
            onCommitRef.current(next);
          } else if (activated && target === start && !movedRef.current) {
            // 꾹 눌렀다 이동 없이 뗌 → 행 탭으로 승격. 픽커는 onPromote(자식 DOM Pressable을 우회한
            // 직접 발화)로, 목록 행은 onActivate로. 자식 click은 didDragRef 가드에 막혀 이중 발화 없음.
            (onPromoteRef.current ?? onActivateRef.current)?.(id);
          }
          activeIndex.value = -1;
          activeIndexRef.current = -1;
          targetIndex.value = -1;
          dragY.value = 0;
          endGlobalGrabbingCursor(); // web: 전역 grabbing 커서 해제
          setDraggingId(null);
          // pointerup 뒤 따라오는 click(웹)까지 가드를 유지한 뒤 다음 매크로태스크에서 해제.
          setTimeout(() => {
            didDragRef.current = false;
          }, 0);
        });
      const composite = composeRowGesture(dragPan, {
        activate: onActivateRef.current ? () => onActivateRef.current?.(id) : undefined,
        edit: onEditRef.current ? () => onEditRef.current?.(id) : undefined,
      });
      cache.set(id, composite);
      return composite;
    },
    [activeIndex, targetIndex, dragY, draggedHeight],
  );

  const moveByOne = useCallback((id: string, delta: number) => {
    const arr = getOrderRef.current();
    const getId = getIdRef.current;
    const idx = arr.findIndex((f) => getId(f) === id);
    if (idx < 0) return;
    const target = clamp(idx + delta, 0, arr.length - 1);
    if (target === idx) return;
    const next = [...arr];
    const [moved] = next.splice(idx, 1);
    next.splice(target, 0, moved);
    onCommitRef.current(next);
  }, []);

  const CellRendererComponent = useMemo(
    () => createReorderCellRenderer(activeIndexRef),
    [],
  );

  return {
    draggingId,
    activeIndex,
    targetIndex,
    dragY,
    draggedHeight,
    getGesture,
    moveByOne,
    CellRendererComponent,
    didDragRef,
  };
}

// 가변 높이용 재정렬 애니메이션 래퍼(FriendsScreen의 AnimatedRow와 동일):
// 잡은 행은 dragY 추종, 나머지는 잡은 행 "자신"의 높이(draggedHeight)만큼 슬롯 비켜남.
export function VarReorderRow({
  index,
  isDragging,
  controls,
  children,
}: {
  index: number;
  isDragging: boolean;
  controls: VarReorderControls;
  children: ReactNode;
}) {
  const { activeIndex, targetIndex, dragY, draggedHeight } = controls;
  const offset = useDerivedValue(() => {
    const ai = activeIndex.value;
    if (ai === -1) return 0;
    if (index === ai) return 0;
    const ti = targetIndex.value;
    const h = draggedHeight.value;
    if (ai < ti && index > ai && index <= ti) return withTiming(-h, SHIFT_TIMING);
    if (ai > ti && index >= ti && index < ai) return withTiming(h, SHIFT_TIMING);
    return withTiming(0, SHIFT_TIMING);
  });
  const rowStyle = useAnimatedStyle(() => {
    const grabbed = activeIndex.value === index;
    return { transform: [{ translateY: grabbed ? dragY.value : offset.value }] };
  });
  return (
    <Animated.View
      style={[
        rowStyle,
        isDragging && LIFT,
      ]}
    >
      {children}
    </Animated.View>
  );
}
