import { MutableRefObject, useCallback, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, ViewStyle } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { beginGlobalGrabbingCursor, endGlobalGrabbingCursor } from './use-reorder';

// 탭바(모바일 하단, 가로)·레일(데스크톱, 세로)의 아이콘 직접 드래그 재정렬.
// use-reorder(세로 FlatList용)의 물리를 "축 무관·인라인(비-FlatList)"으로 압축한 공용 훅.
//  · 균일 슬롯(탭 버튼 크기 일정) → 슬롯 pitch 하나로 hop 계산.
//  · 잡은 탭: 손가락 추종(가로=translateX, 세로=translateY) · 나머지: ∓pitch 비켜남(withTiming).
//  · 커밋은 놓을 때 1회 — 보이는 탭들의 새 순서만 넘긴다(숨긴 탭 재구성은 호출부 몫).
// 탭(누르기=네비)과 공존: 롱프레스 없이 8px 이동으로만 활성 — 움직임 없는 누르기는 Pressable
// onPress(네비)에 양보하고, 드래그가 활성되면 didDragRef로 그 세션의 네비게이션을 눌러 무시한다.
// (바/레일은 스크롤이 없어 "잡자마자 끌기"라도 양보할 팬이 없다.)

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// 들린 탭: opacity(그림자 금지 — DESIGN) + zIndex/elevation로 형제 위로. (use-reorder의 LIFT 미러)
export const TAB_LIFT = { opacity: 0.95, zIndex: 10, elevation: 10 } as const;
const SHIFT_TIMING = { duration: 130 } as const;

export type ReorderAxis = 'x' | 'y';

// Gesture.Pan()이 돌려주는 팬 제스처 타입.
type PanGesture = ReturnType<typeof Gesture.Pan>;

export interface TabReorderControls {
  /** 세션당 1회만 바뀌는 "들린 탭" key(null=유휴) — 들린 스타일·커서에 쓴다. */
  draggingKey: string | null;
  activeIndex: SharedValue<number>;
  targetIndex: SharedValue<number>;
  /** 잡은 탭의 축 방향 이동량(clamp됨). */
  drag: SharedValue<number>;
  /** 균일 슬롯 크기(축 방향). onItemLayout이 측정. */
  pitch: SharedValue<number>;
  /** variableSize 모드: 형제 슬롯이 비켜나는 폭(잡은 슬롯 자신의 크기 + 슬롯 간격). onStart에서 확정. */
  slotShift: SharedValue<number>;
  /** key별 드래그 제스처(캐시됨, 8px 이동으로 활성). 탭 래퍼의 GestureDetector에 물린다. */
  getGesture: (key: string) => PanGesture;
  /** 각 보이는 탭 래퍼의 onLayout — 슬롯 위치를 측정해 pitch를 잡는다. */
  onItemLayout: (visibleIndex: number, e: LayoutChangeEvent) => void;
  /** 드래그 세션 직후 네비게이션을 눌러 무시하는 플래그(Pressable onPress 가드). */
  didDragRef: MutableRefObject<boolean>;
}

export function useTabReorder(opts: {
  /** 현재 렌더 방향: 탭바=x(가로), 레일=y(세로). 스왑 시 갱신. */
  axis: ReorderAxis;
  /** 보이는 탭 key들의 현재 순서(드래그 중 불변, 놓을 때만 커밋). 호출부가 데이터와 동기화. */
  visibleOrderRef: MutableRefObject<string[]>;
  /** 확정된 보이는 탭들의 새 순서. 숨긴 탭 재구성·낙관 반영·서버 저장은 호출부가 한다. */
  onCommit: (newVisible: string[]) => void;
  /** 있으면 이 ms만큼 꾹 누른 뒤에야 드래그가 활성된다(캡슐 재정렬 — 사용자 명시 "꾹 누르면").
   *  없으면 기존 동작: 롱프레스 없이 8px 이동으로 즉시 활성(탭바·레일). */
  activateAfterLongPress?: number;
  /** true면 슬롯 폭이 제각각(텍스트 캡슐 등)이라 측정 좌표로 hop·비켜남을 계산한다.
   *  false(기본)면 균일 슬롯 가정(탭바·레일) — 기존 pitch 기반 수식 그대로(회귀 방지). */
  variableSize?: boolean;
  /** 드래그(롱프레스)가 활성된 순간(onStart)에 호출 — 캡슐 편집 모드 진입 등. 이동 없이 떼도
   *  onStart는 롱프레스 시점에 발화하므로 "꾹 눌러 편집 모드"와 "꾹 눌러 드래그"가 한 제스처로 이어진다. */
  onDragStart?: () => void;
}): TabReorderControls {
  const { visibleOrderRef } = opts;
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const activeIndex = useSharedValue(-1);
  const targetIndex = useSharedValue(-1);
  const drag = useSharedValue(0);
  const pitch = useSharedValue(1);
  const slotShift = useSharedValue(1);

  // 제스처는 key별 1회만 생성·캐시하므로 최신 값들은 ref로 읽는다.
  const axisRef = useRef(opts.axis);
  axisRef.current = opts.axis;
  const commitRef = useRef(opts.onCommit);
  commitRef.current = opts.onCommit;
  const longPressRef = useRef(opts.activateAfterLongPress);
  longPressRef.current = opts.activateAfterLongPress;
  const variableRef = useRef(opts.variableSize ?? false);
  variableRef.current = opts.variableSize ?? false;
  const onDragStartRef = useRef(opts.onDragStart);
  onDragStartRef.current = opts.onDragStart;

  const startIndexRef = useRef(0);
  const boundsRef = useRef({ min: 0, max: 0 });
  const pitchRef = useRef(1);
  // 슬롯 위치(축 방향)·크기 — index로 색인. pitch는 위치 델타로 잡아 마진에 무관하게 정확.
  const posRef = useRef<number[]>([]);
  const sizeRef = useRef<number[]>([]);
  const didDragRef = useRef(false);
  // variableSize 모드 스냅샷(onStart에서 확정) — 슬롯 중심 좌표들과 잡은 슬롯 중심.
  const centersRef = useRef<number[]>([]);
  const startCenterRef = useRef(0);

  const onItemLayout = useCallback(
    (visibleIndex: number, e: LayoutChangeEvent) => {
      const { x, y, width, height } = e.nativeEvent.layout;
      const isX = axisRef.current === 'x';
      posRef.current[visibleIndex] = isX ? x : y;
      sizeRef.current[visibleIndex] = isX ? width : height;
      // pitch = 슬롯 간 거리(마진 포함). 인접 두 슬롯이 측정되면 그 델타를, 아니면 자기 크기를.
      const p0 = posRef.current[0];
      const p1 = posRef.current[1];
      let pit = sizeRef.current[visibleIndex] ?? 1;
      if (p0 != null && p1 != null && p1 !== p0) pit = Math.abs(p1 - p0);
      if (pit > 0) {
        pitchRef.current = pit;
        pitch.value = pit;
      }
    },
    [pitch],
  );

  const gesturesRef = useRef(new Map<string, PanGesture>());
  const getGesture = useCallback(
    (key: string) => {
      const cache = gesturesRef.current;
      const cached = cache.get(key);
      if (cached) return cached;
      let pan = Gesture.Pan()
        .runOnJS(true)
        // 롱프레스 없이 "잡자마자 끌기"(브라우저 탭 드래그처럼). 바/레일은 스크롤이 없어 양보할
        // 팬이 없으므로 어느 쪽으로든 8px 움직이면 즉시 활성 — 움직임 없는 누르기는 활성 안 돼
        // 탭(네비게이션)에 그대로 양보한다. failOffset은 두지 않는다(양보 대상 없음).
        .activeOffsetX([-8, 8])
        .activeOffsetY([-8, 8]);
      // 캡슐 등: 꾹(롱프레스) 눌러야 드래그 활성 — 빠른 탭(전환)·눈 토글에 양보한다.
      const lp = longPressRef.current;
      if (lp != null) pan = pan.activateAfterLongPress(lp);
      pan = pan
        .onStart(() => {
          const arr = visibleOrderRef.current;
          const idx = arr.indexOf(key);
          if (idx < 0) return;
          const n = arr.length;
          startIndexRef.current = idx;
          if (variableRef.current) {
            // 슬롯 폭이 제각각 — 측정 좌표로 중심을 잡는다(마진·가변폭에 정확).
            const pos = posRef.current;
            const size = sizeRef.current;
            const fallback = pitchRef.current || 1;
            const centers: number[] = [];
            for (let i = 0; i < n; i++) {
              const s = size[i] ?? fallback;
              const p = pos[i] ?? i * fallback;
              centers[i] = p + s / 2;
            }
            centersRef.current = centers;
            startCenterRef.current = centers[idx];
            const startSize = size[idx] ?? fallback;
            // 슬롯 간격(gap) — 인접 두 슬롯 좌표 델타에서 앞 슬롯 폭을 뺀다(없으면 0).
            let gap = 0;
            if (pos[0] != null && pos[1] != null && size[0] != null) {
              gap = Math.max(0, pos[1] - pos[0] - size[0]);
            }
            slotShift.value = startSize + gap;
            boundsRef.current = {
              min: centers[0] - centers[idx],
              max: centers[n - 1] - centers[idx],
            };
          } else {
            const p = pitchRef.current || 1;
            boundsRef.current = { min: -idx * p, max: (n - 1 - idx) * p };
          }
          activeIndex.value = idx;
          targetIndex.value = idx;
          drag.value = 0;
          // 이 세션은 드래그다 — 뒤따르는 탭/클릭 네비게이션·전환을 눌러 무시한다.
          didDragRef.current = true;
          // 롱프레스 활성 순간 편집 모드 진입 등(캡슐). 이동으로 이어지면 재정렬도 그대로.
          onDragStartRef.current?.();
          beginGlobalGrabbingCursor(); // web: 드래그 내내 grabbing 커서 강제
          setDraggingKey(key); // 세션당 1회 리렌더(들린 스타일)
        })
        .onUpdate((event) => {
          const n = visibleOrderRef.current.length;
          if (n === 0) return;
          const t = axisRef.current === 'x' ? event.translationX : event.translationY;
          const { min, max } = boundsRef.current;
          drag.value = clamp(t, min, max);
          if (variableRef.current) {
            // 경계(min/max)는 명시적으로 맨앞·맨뒤로 매핑한다 — 중심 좌표가 끝 슬롯 중심에서 딱
            // 멈춰(useVarReorder와 동일 이유) 맨끝에 못 닿는 것을 막는다. 그 사이는 잡은 슬롯 중심이
            // 넘어선 "다른" 슬롯 개수 = 새 배열에서의 목표 index.
            let target: number;
            if (drag.value <= min) {
              target = 0;
            } else if (drag.value >= max) {
              target = n - 1;
            } else {
              const centers = centersRef.current;
              const draggedCenter = startCenterRef.current + drag.value;
              const start = startIndexRef.current;
              let count = 0;
              for (let i = 0; i < n; i++) {
                if (i === start) continue;
                if ((centers[i] ?? 0) < draggedCenter) count++;
              }
              target = count;
            }
            targetIndex.value = clamp(target, 0, n - 1);
          } else {
            const p = pitchRef.current || 1;
            const hop = Math.round(drag.value / p);
            targetIndex.value = clamp(startIndexRef.current + hop, 0, n - 1);
          }
        })
        .onFinalize(() => {
          const start = startIndexRef.current;
          const target = targetIndex.value;
          const arr = visibleOrderRef.current;
          const n = arr.length;
          if (target !== start && target >= 0 && target < n && activeIndex.value !== -1) {
            const next = [...arr];
            const [moved] = next.splice(start, 1);
            next.splice(target, 0, moved);
            visibleOrderRef.current = next;
            commitRef.current(next);
          }
          // 커밋과 동시에 리셋 — activeIndex=-1이면 offset이 즉시 0이 되어 새 순서와 맞물려 점프 없음.
          activeIndex.value = -1;
          targetIndex.value = -1;
          drag.value = 0;
          endGlobalGrabbingCursor(); // web: 전역 grabbing 커서 해제
          setDraggingKey(null);
          // pointerup 뒤 따라오는 click(웹)까지 네비게이션을 누른 뒤 다음 매크로태스크에서 해제.
          setTimeout(() => {
            didDragRef.current = false;
          }, 0);
        });
      cache.set(key, pan);
      return pan;
    },
    [visibleOrderRef, activeIndex, targetIndex, drag],
  );

  return {
    draggingKey,
    activeIndex,
    targetIndex,
    drag,
    pitch,
    slotShift,
    getGesture,
    onItemLayout,
    didDragRef,
  };
}

// 탭 래퍼의 재정렬 애니메이션 스타일: 잡은 탭은 drag 추종, 나머지는 슬롯 비켜남(±pitch).
// 축(가로/세로)에 따라 translateX/translateY로 낸다. use-reorder의 ReorderRow 미러.
export function useTabItemAnimatedStyle(
  controls: TabReorderControls,
  index: number,
  axis: ReorderAxis,
  // variableSize면 비켜남 폭을 잡은 슬롯 크기(slotShift)로 — 균일이면 기존 pitch 그대로(회귀 방지).
  variableSize = false,
): ViewStyle {
  const { activeIndex, targetIndex, drag, pitch, slotShift } = controls;
  const isX = axis === 'x';
  const offset = useDerivedValue(() => {
    const ai = activeIndex.value;
    if (ai === -1) return 0; // 유휴/커밋: 즉시 0(데이터가 새 순서로 바뀌므로 점프 없음)
    if (index === ai) return 0; // 잡은 탭은 drag로 처리
    const ti = targetIndex.value;
    const p = variableSize ? slotShift.value : pitch.value;
    if (ai < ti && index > ai && index <= ti) return withTiming(-p, SHIFT_TIMING);
    if (ai > ti && index >= ti && index < ai) return withTiming(p, SHIFT_TIMING);
    return withTiming(0, SHIFT_TIMING);
  });
  return useAnimatedStyle(() => {
    const grabbed = activeIndex.value === index;
    const v = grabbed ? drag.value : offset.value;
    return isX ? { transform: [{ translateX: v }] } : { transform: [{ translateY: v }] };
  }) as ViewStyle;
}
