import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  ChevronDown,
  ChevronRight,
  EllipsisVertical,
  Pencil,
  Plus,
  Star,
  StarOff,
  Trash2,
  X,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  FlatList,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  ReduceMotion,
  SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { api, ApiError, AutoKind, Friend, Tag } from '../api';
import { hapticImpactLight, hapticImpactMedium, hapticSelection } from '../haptics';
import { useAuth } from '../auth';
import { useCollapsedSections } from '../collapsed-sections';
import { useCategoryEdit } from '../category-edit';
import { CategoryAvatar } from '../components/CategoryAvatar';
import {
  buildSwipeActionsA11y,
  SwipeableRow,
  SwipeableRowMethods,
  SwipeAction,
} from '../components/SwipeableRow';
import { TabHeader } from '../components/TabHeader';
import { Text } from '../components/Text';
import { confirmDialog } from '../notify';
import { ClassifyTab, useSelectedRoom } from '../selected-room';
import {
  CapsuleTab,
  CAPSULE_ORDER_DEFAULT,
  HideableCapsule,
  resolveCapsuleOrder,
  resolveHiddenCapsules,
} from '../tab-menu';
import {
  useTabItemAnimatedStyle,
  useTabReorder,
} from '../tab-reorder';
import { useTagCreate } from '../tag-create';
import { hexAlpha, layout, SELF_DEFAULT_COLOR, ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import {
  beginGlobalGrabbingCursor,
  buildTapGesture,
  composeRowGesture,
  createReorderCellRenderer,
  endGlobalGrabbingCursor,
  RowGesture,
  withDragActivation,
} from '../use-reorder';
import { AutoScreen } from './AutoScreen';
import { TagsScreen } from './TagsScreen';

// 분류 행 높이 — 설명(상태메시지) 유무와 무관하게 모든 행이 같은 높이(사용자 확정: "높이가
// 똑같아야지"). 설명은 행 안에서 이름 아래 한 줄(numberOfLines=1 ellipsis)로 들어간다.
const ROW_HEIGHT = 64;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// 웹에서만 캡슐 바에 잡아끌기 가능함을 알리는 grab 커서(RN 타입에 없는 값이라 캐스팅).
// 패닝 중엔 이 값을 imperative하게 'grabbing'으로 덮어썼다가 놓으면 다시 이 클래스값으로 복귀한다.
const grabCursor =
  Platform.OS === 'web' ? ({ cursor: 'grab' } as unknown as ViewStyle) : null;

// 들린 행: opacity(그림자 금지 — DESIGN) + zIndex/elevation로 형제 위로.
const LIFT = { opacity: 0.95, zIndex: 10, elevation: 10 } as const;
// 비켜나는 행 애니메이션 시간. reduceMotion: 접근성 "동작 줄이기" 시 즉시 착지로 대체.
const SHIFT_TIMING = { duration: 130, reduceMotion: ReduceMotion.System } as const;

// 표준 재정렬 아키텍처: 드래그 중 데이터·셀은 불변, translateY만 움직인다.
// - 잡은 행(index === activeIndex): translateY = dragY(손가락 추종, 즉시).
// - 다른 행: (startIndex, target] 또는 [target, startIndex) 구간이면 ∓ROW_HEIGHT만큼 비켜난다(withTiming).
// offset은 dragY에 의존하지 않아(activeIndex·targetIndex만) 슬롯이 바뀔 때만 애니메이트한다.
function AnimatedRow({
  index,
  isDragging,
  activeIndex,
  targetIndex,
  dragY,
  draggedHeight,
  children,
}: {
  index: number;
  isDragging: boolean;
  activeIndex: SharedValue<number>;
  targetIndex: SharedValue<number>;
  dragY: SharedValue<number>;
  draggedHeight: SharedValue<number>;
  children: ReactNode;
}) {
  // 비켜남 오프셋 — activeIndex/targetIndex에만 의존(매 프레임 아님) → 슬롯 hop마다 부드럽게 timing.
  // 비켜나는 폭은 잡은 행 "자신"의 높이(draggedHeight) — 목록에서 그 행이 빠지고 채워지는
  // 만큼만 다른 행이 움직이면 되므로, 옆 행 자신의 높이와는 무관하다.
  const offset = useDerivedValue(() => {
    const ai = activeIndex.value;
    if (ai === -1) return 0; // 유휴/커밋: 즉시 0(데이터가 새 순서로 바뀌므로 점프 없음)
    if (index === ai) return 0; // 잡은 행은 rowStyle에서 dragY로 처리
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

// 높이 가변 그립 드래그 재정렬을 한 벌로 캡슐화한 훅. 서로 다른 섹션(분류 본목록 · 즐겨찾기)에서
// 각각 독립 인스턴스로 호출하면 shared value·세션 ref·제스처 캐시가 전부 분리되어, 한쪽 드래그가
// 다른 쪽 행을 움직이거나 상태를 섞지 않는다(물리적으로 한 번에 한 포인터만 드래그하므로 안전).
// - getList: 현재 순서의 원천(드래그 시점의 실제 배열). 항상 최신을 읽도록 ref로 감싼다.
// - onCommit(next): 놓을 때(또는 접근성 이동) 재정렬된 배열을 넘긴다 — 호출부가 상태 반영·서버 저장을 담당.
function useDragReorder(
  getList: () => Friend[],
  onCommit: (next: Friend[]) => void,
  // 행 탭=열기(onActivate)·더블탭=수정(onEditRequest)·hover(웹 마우스). 섹션별 refKey는 caller가 콜백에서 붙인다.
  taps?: {
    onActivate?: (id: string) => void;
    onEditRequest?: (id: string) => void;
    onHover?: (id: string, hovered: boolean) => void;
  },
) {
  // 재정렬 공유값: activeIndex(잡은 행 index, -1=유휴), targetIndex(현재 목표 슬롯),
  // dragY(잡은 행 translateY), draggedHeight(잡은 행 자신의 실제 높이 — 설명 유무로 가변).
  const activeIndex = useSharedValue(-1);
  // 셀 렌더러가 리렌더 시점(draggingId 변경)에 읽어 잡힌 셀을 드는 JS-스레드 값(SharedValue는 UI 스레드).
  const activeIndexRef = useRef(-1);
  const targetIndex = useSharedValue(-1);
  const dragY = useSharedValue(0);
  const draggedHeight = useSharedValue(ROW_HEIGHT);
  // draggingId(들린 스타일·scrollEnabled)는 세션당 1회만 바뀐다 — 드래그 중에는 데이터·셀을
  // 건드리지 않으므로 리렌더/리마운트/제스처 간섭이 없다.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const startIndexRef = useRef(0);
  // 이 드래그 세션에서 활성 임계 이상 움직였는지 — onFinalize의 탭 승격("꾹 눌렀다 그냥 뗌") 판별.
  const movedRef = useRef(false);
  // 마지막으로 selection 틱을 울린 hop 목표 — 슬롯이 바뀔 때만 1회씩 울린다.
  const lastHopRef = useRef(-1);
  // 드래그 세션 동안의 경계값(픽셀) — onStart에서 그 시점 순서의 실제 높이로 계산해 고정한다.
  const dragBoundsRef = useRef({ min: 0, max: 0 });
  // 잡은 행의 원래 상단 오프셋(누적 높이) — 드래그 중 목표 슬롯 계산에 쓴다.
  const dragTopOffsetRef = useRef(0);
  // 잡은 행을 뺀 "나머지" 행들의 높이 배열 — 그 사이 어디에 꽂히는지로 targetIndex를 구한다.
  const othersHeightsRef = useRef<number[]>([]);
  // 제스처를 id별로 한 번만 만들어 캐시한다 — 목록 재정렬(setState)로 리렌더돼도 GestureDetector가
  // 같은 제스처 객체를 받아 드래그 도중 재부착되지 않는다.
  const gesturesRef = useRef(new Map<string, RowGesture>());
  // 제스처는 한 번만 생성·캐시되므로 최신 getList/onCommit·탭 콜백을 ref로 읽는다.
  const getListRef = useRef(getList);
  const onCommitRef = useRef(onCommit);
  const onActivateRef = useRef(taps?.onActivate);
  const onEditRef = useRef(taps?.onEditRequest);
  const onHoverRef = useRef(taps?.onHover);
  getListRef.current = getList;
  onCommitRef.current = onCommit;
  onActivateRef.current = taps?.onActivate;
  onEditRef.current = taps?.onEditRequest;
  onHoverRef.current = taps?.onHover;

  const getDragGesture = useCallback(
    (id: string) => {
      const cache = gesturesRef.current;
      const cached = cache.get(id);
      if (cached) return cached;
      const dragPan = withDragActivation(Gesture.Pan().runOnJS(true))
        .onStart(() => {
          const list = getListRef.current();
          const idx = list.findIndex((f) => f.id === id);
          if (idx < 0) return;
          startIndexRef.current = idx;
          // 이 드래그 세션 동안 쓸 높이 스냅샷 — 모든 행이 균일 높이(ROW_HEIGHT)라 상수.
          const heights = list.map(() => ROW_HEIGHT);
          const h = heights[idx];
          draggedHeight.value = h;
          const topOffset = heights.slice(0, idx).reduce((s, v) => s + v, 0);
          const total = heights.reduce((s, v) => s + v, 0);
          dragTopOffsetRef.current = topOffset;
          dragBoundsRef.current = { min: -topOffset, max: total - h - topOffset };
          othersHeightsRef.current = heights.filter((_, i) => i !== idx);
          movedRef.current = false;
          lastHopRef.current = idx;
          activeIndex.value = idx;
          activeIndexRef.current = idx; // 셀 렌더러가 리렌더 시점에 읽어 잡힌 셀을 든다
          targetIndex.value = idx;
          dragY.value = 0;
          beginGlobalGrabbingCursor(); // web: 드래그 내내 grabbing 커서 강제
          hapticImpactMedium(); // 리프트(잡힘) — 들어올림 피드백
          // 세션당 1회 리렌더(들린 스타일 + scrollEnabled false). 이후 드래그 중엔 setState 없음.
          setDraggingId(id);
        })
        .onUpdate((event) => {
          const n = getListRef.current().length;
          if (n === 0) return;
          if (Math.abs(event.translationY) > 6) movedRef.current = true;
          const { min, max } = dragBoundsRef.current;
          // 잡은 행: translationY 그대로, 리스트 상하 경계(실제 누적 높이)로만 클램프.
          dragY.value = clamp(event.translationY, min, max);
          // 목표 슬롯: 잡은 행 중심이 "나머지" 행들 사이 어디에 걸리는지로 계산한다.
          // (행마다 높이가 달라 index*고정높이 나눗셈이 아니라 누적 높이를 순회해 찾는다.)
          const draggedTop = dragTopOffsetRef.current + dragY.value;
          const draggedCenter = draggedTop + draggedHeight.value / 2;
          const others = othersHeightsRef.current;
          // 경계값(min/max)은 명시적으로 0·마지막으로 매핑한다 — 아래 루프는 잡은 행 "자신"의
          // 높이로 만든 center를 다른 행의 midpoint와 비교하는데, 이 둘의 높이가 다르면(설명
          // 2줄 행 등) dragY가 정확히 min(맨 위)에 닿아도 draggedCenter가 others[0]의 midpoint를
          // 못 넘을 수 있어 target이 0으로 스냅되지 않는 채로 남는다(맨 위 도달 불가 버그).
          // max(맨 아래)는 루프가 아무 것도 못 찾으면 자동으로 others.length로 떨어지는
          // fallback 구조라 원래도 안전하지만, 대칭성을 위해 여기서도 명시한다.
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
          // 데이터는 안 바꾸고 이 값만 갱신 → 다른 행들이 비켜난다(AnimatedRow offset).
          targetIndex.value = clamp(target, 0, n - 1);
          // 슬롯 hop마다 selection 틱 1회(runOnJS(true) 제스처라 JS 스레드에서 직접 호출).
          if (targetIndex.value !== lastHopRef.current) {
            lastHopRef.current = targetIndex.value;
            hapticSelection();
          }
        })
        .onFinalize(() => {
          const start = startIndexRef.current;
          const target = targetIndex.value;
          const activated = activeIndex.value !== -1;
          const list = getListRef.current();
          const n = list.length;
          // 놓을 때 딱 한 번 커밋: splice 결과를 onCommit에 넘긴다(상태·저장은 호출부 몫).
          if (activated && target !== start && target >= 0 && target < n) {
            const next = [...list];
            const [moved] = next.splice(start, 1);
            next.splice(target, 0, moved);
            onCommitRef.current(next);
            hapticImpactLight(); // 드롭(새 위치에 안착) — 가벼운 커밋 피드백
          } else if (activated && target === start && !movedRef.current) {
            // 꾹 눌렀다 이동 없이 뗌 → 팬이 Tap을 눌러 죽였으므로 여기서 행 열기를 승격 발화.
            // (빠른 탭은 팬이 활성 안 돼 여긴 안 옴 → Tap 제스처가 처리, 이중 발화 없음.)
            onActivateRef.current?.(id);
          }
          // 커밋과 동시에 리셋 — activeIndex=-1이면 모든 offset이 즉시 0이 되어(withTiming 아님)
          // 새 데이터 순서와 정확히 맞물려 시각 점프가 없다. (setState 뒤에 리셋 = 같은 프레임에서 정합)
          activeIndex.value = -1;
          activeIndexRef.current = -1;
          targetIndex.value = -1;
          dragY.value = 0;
          endGlobalGrabbingCursor(); // web: 전역 grabbing 커서 해제
          setDraggingId(null);
        });
      const composite = composeRowGesture(
        dragPan,
        {
          activate: onActivateRef.current ? () => onActivateRef.current?.(id) : undefined,
          edit: onEditRef.current ? () => onEditRef.current?.(id) : undefined,
        },
        onHoverRef.current ? (h) => onHoverRef.current?.(id, h) : undefined,
      );
      cache.set(id, composite);
      return composite;
    },
    [activeIndex, targetIndex, dragY, draggedHeight],
  );

  // 배열에서 id를 delta칸 옮긴다(접근성 increment/decrement). 드래그 커밋과 같은 경로(onCommit).
  const moveByOne = useCallback((id: string, delta: number) => {
    const arr = getListRef.current();
    const idx = arr.findIndex((f) => f.id === id);
    if (idx < 0) return;
    const target = clamp(idx + delta, 0, arr.length - 1);
    if (target === idx) return;
    const next = [...arr];
    const [moved] = next.splice(idx, 1);
    next.splice(target, 0, moved);
    onCommitRef.current(next);
  }, []);

  // FlatList의 CellRendererComponent — 잡은 행이 속한 셀(형제 뷰)에 zIndex/elevation을 준다.
  // 즐겨찾기 섹션(ListHeaderComponent 안의 일반 View)엔 필요 없고 본 목록 FlatList에서만 쓰인다.
  const CellRendererComponent = useMemo(
    () => createReorderCellRenderer(activeIndexRef),
    [],
  );

  return {
    activeIndex,
    targetIndex,
    dragY,
    draggedHeight,
    draggingId,
    getDragGesture,
    moveByOne,
    CellRendererComponent,
  };
}

type DragReorder = ReturnType<typeof useDragReorder>;

interface FriendsListProps {
  token: string | null;
  onOpenChat: () => void;
  onOpenFriend: (friend: Friend) => void;
  onLogout: () => void;
  /** 그룹 탭 캡슐 아래에 임베드될 때 true — 헤더(타이틀+추가)는 그룹 컨테이너가 지므로 여기선 렌더하지 않는다. */
  embedded?: boolean;
  /** 임베드 시 로드된 분류 목록을 그룹 컨테이너로 올린다(그 헤더의 '분류 추가' 기본색 계산용). */
  onFriendsChange?: (friends: Friend[]) => void;
}

// 분류 리스트 본체(전체 행 + 즐겨찾기 + 분류 그룹) — 예전 FriendsScreen 그대로.
// 상단 캡슐(분류/태그/자동구분)의 "분류" 선택 시 렌더되는 리스트이자, 신설 "분류" 탭(캡슐 없이
// 이 리스트만 보여주는 탭 — categories.tsx)이 그대로 재사용하는 컴포넌트라 export한다.
export function FriendsList({
  token,
  onOpenChat,
  onOpenFriend,
  onLogout,
  embedded = false,
  onFriendsChange,
}: FriendsListProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { selfColor, selfDescription } = useAuth();
  // roomsVersion: 대화 패널·분류 편집(루트 CategoryEditProvider)이 개수·목록을 바꾸는 신호.
  // room: 데스크톱 스플릿뷰에서 현재 방 — active 행 강조에 쓴다.
  const { roomsVersion, room, setRoom, bumpRooms } = useSelectedRoom();
  // 분류 추가(관리 모드 픽커)·수정(색 프로필 폼) 편집기는 루트 프로바이더로 승격됨 — 여기선 열기만.
  const { open: openCategoryEditor, openManage: openCategoryManage } = useCategoryEdit();
  // 데스크톱(스플릿뷰)에서만 선택 방을 강조한다.
  const { width } = useWindowDimensions();
  const isDesktop = width >= layout.desktopBreakpoint;

  const [friends, setFriends] = useState<Friend[]>([]);
  // 두 섹션(즐겨찾기·분류) 접기/펼치기 — 서버 저장(users.collapsedSections). 접히면 해당 섹션 행을 숨긴다.
  const { isCollapsed, toggle: toggleSection } = useCollapsedSections();
  const favoritesExpanded = !isCollapsed('friends.favorites');
  const categoriesExpanded = !isCollapsed('friends.list');
  // 즐겨찾기 섹션 = favorite=true인 분류만, favoritePosition 오름차순(없으면 맨 뒤)으로 정렬.
  // 본 목록(분류) 순서와 독립 — 즐겨찾기해도 "분류" 섹션에서 빠지지 않고 두 섹션 모두에 보인다.
  const favorites = useMemo(
    () =>
      friends
        .filter((f) => f.favorite)
        .sort(
          (a, b) =>
            (a.favoritePosition ?? Number.MAX_SAFE_INTEGER) -
            (b.favoritePosition ?? Number.MAX_SAFE_INTEGER),
        ),
    [friends],
  );
  const orderRef = useRef<Friend[]>([]); // 본 목록 순서의 원천(드래그 중 불변, 놓을 때만 커밋)
  // 즐겨찾기 드래그가 읽을 현재 즐겨찾기 순서 — 매 렌더 최신으로 동기화(드래그 콜백이 lazy하게 읽음).
  const favoritesRef = useRef<Friend[]>([]);
  favoritesRef.current = favorites;
  // 제스처는 ref로 최신 값을 읽으므로 token/재조회는 ref로 넘긴다(스플리터 패턴).
  const tokenRef = useRef(token);
  const reloadRef = useRef<() => void>(() => {});
  // 스와이프 상태(웹에서 드래그 후 탭 무시 · 한 번에 하나만 열기).
  const swipeDragging = useRef(false);
  const openRowId = useRef<string | null>(null);
  const swipeRefs = useRef(new Map<string, SwipeableRowMethods | null>());

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  // 임베드(그룹 탭) 시 로드된 분류 목록을 컨테이너로 올린다 — 그룹 헤더 '분류 추가'의 기본색 계산용.
  useEffect(() => {
    onFriendsChange?.(friends);
  }, [friends, onFriendsChange]);

  const reload = useCallback(async () => {
    if (!token) return;
    try {
      const list = await api.listFriends(token);
      orderRef.current = list;
      setFriends(list);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onLogout();
    }
  }, [token, onLogout]);
  reloadRef.current = reload;

  // 탭 진입·roomsVersion 변화(추가·수정·삭제·고정 후)마다 서버 순서(=position)로 재조회.
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let cancelled = false;
      (async () => {
        try {
          const list = await api.listFriends(token);
          if (cancelled) return;
          orderRef.current = list;
          setFriends(list);
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) onLogout();
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [token, onLogout, roomsVersion]),
  );

  // 행 싱글탭 = 방 열기(열린 스와이프면 닫기, 스와이프 드래그 직후면 무시) — 예전 onPress 로직.
  const openRow = useCallback(
    (refKey: string, item: Friend) => {
      if (swipeDragging.current) return;
      if (openRowId.current === refKey) {
        swipeRefs.current.get(refKey)?.close();
        return;
      }
      onOpenFriend(item);
    },
    [onOpenFriend],
  );
  // 행 더블탭 = 색 프로필 수정 폼.
  const editRow = useCallback(
    (item: Friend) => openCategoryEditor(item),
    [openCategoryEditor],
  );

  // "전체"(나에게) 행 제스처 — 재정렬 대상이 아니라 드래그는 없다. 탭=전체 채팅 열기,
  // 더블탭=전체 프로필 수정({self:true}). 다른 행의 탭/더블탭 문법과 통일.
  const selfGesture = useMemo(
    () =>
      buildTapGesture(
        () => {
          if (swipeDragging.current) return;
          if (openRowId.current === 'self') {
            swipeRefs.current.get('self')?.close();
            return;
          }
          onOpenChat();
        },
        () => openCategoryEditor({ self: true }),
      )!,
    [onOpenChat, openCategoryEditor],
  );

  // 웹 마우스 hover된 행(refKey) — surface로 강조. 분류가 두 섹션에 겹쳐 나오므로 refKey로 구분.
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  // ── 본 목록(분류) 드래그 ────────────────────────────────────────────
  // 커밋: splice된 새 순서를 낙관적으로 반영하고 서버에 저장. 실패하면 서버 순서로 복원.
  // 행 탭=열기(onActivate)·더블탭=수정(onEditRequest). refKey는 섹션(cat:/fav:)으로 구분.
  const mainDrag = useDragReorder(
    () => orderRef.current,
    useCallback(
      (next: Friend[]) => {
        orderRef.current = next;
        setFriends(next);
        const tk = tokenRef.current;
        if (tk) {
          api.reorderFriends(tk, next.map((f) => f.id)).catch(() => reloadRef.current());
        }
      },
      [],
    ),
    {
      onActivate: (id) => {
        const f = orderRef.current.find((x) => x.id === id);
        if (f) openRow(`cat:${id}`, f);
      },
      onEditRequest: (id) => {
        const f = orderRef.current.find((x) => x.id === id);
        if (f) editRow(f);
      },
      onHover: (id, h) => setHoveredKey(h ? `cat:${id}` : null),
    },
  );

  // ── 즐겨찾기 섹션 드래그(본 목록과 독립) ──────────────────────────────
  // 커밋: 새 즐겨찾기 순서로 favoritePosition을 재부여한다. 본 목록(orderRef)의 배열 순서는
  // 절대 바꾸지 않고(분류 섹션 순서 무변) 해당 분류들의 favoritePosition 필드값만 갱신한다.
  // 즐겨찾기 memo가 favoritePosition으로 다시 정렬 → 새 순서와 정확히 일치. 저장은 reorderFavorites.
  const favDrag = useDragReorder(
    () => favoritesRef.current,
    useCallback(
      (nextFavs: Friend[]) => {
        const posById = new Map(nextFavs.map((f, i) => [f.id, i] as const));
        const updated = orderRef.current.map((f) =>
          posById.has(f.id) ? { ...f, favoritePosition: posById.get(f.id)! } : f,
        );
        orderRef.current = updated;
        setFriends(updated);
        const tk = tokenRef.current;
        if (tk) {
          api
            .reorderFavorites(tk, nextFavs.map((f) => f.id))
            .catch(() => reloadRef.current());
        }
      },
      [],
    ),
    {
      onActivate: (id) => {
        const f = orderRef.current.find((x) => x.id === id);
        if (f) openRow(`fav:${id}`, f);
      },
      onEditRequest: (id) => {
        const f = orderRef.current.find((x) => x.id === id);
        if (f) editRow(f);
      },
      onHover: (id, h) => setHoveredKey(h ? `fav:${id}` : null),
    },
  );

  // 레거시 정규화: favoritePosition 필드가 생기기 전에 즐겨찾기된 분류는 favoritePosition=null이라
  // 즐겨찾기 섹션이 분류 순서로 보이던 문제가 있었다. 백엔드도 새 즐겨찾기 추가 시 정규화하지만,
  // 기존 데이터를 곧바로 고정하기 위해 목록 로드 후 null이 섞여 있으면 현재(정상) 표시 순서
  // 그대로 reorderFavorites를 1회 호출해 서버에 위치를 박아넣는다. 토큰당 1회만 시도(중복 호출 가드),
  // 실패해도 조용히 무시(다음 로드 때 다시 시도됨).
  const favoritesHealedRef = useRef(false);
  useEffect(() => {
    favoritesHealedRef.current = false;
  }, [token]);
  useEffect(() => {
    if (!token) return;
    if (favoritesHealedRef.current) return;
    if (favorites.length === 0) return;
    const hasLegacyNullPosition = favorites.some((f) => f.favoritePosition == null);
    if (!hasLegacyNullPosition) return;
    favoritesHealedRef.current = true;
    // favDrag 커밋과 동일한 방식으로 현재 표시 순서를 favoritePosition에 박아 로컬 상태도 정합화.
    const posById = new Map(favorites.map((f, i) => [f.id, i] as const));
    const updated = orderRef.current.map((f) =>
      posById.has(f.id) ? { ...f, favoritePosition: posById.get(f.id)! } : f,
    );
    orderRef.current = updated;
    setFriends(updated);
    api.reorderFavorites(token, favorites.map((f) => f.id)).catch(() => {});
  }, [token, favorites]);

  // 즐겨찾기(★) 토글 — 채팅 탭 고정(pinned)과는 무관한 별개 표시. 본 목록(분류) 정렬엔 영향 없음.
  // 낙관 갱신: 별 추가 시 즐겨찾기 섹션 맨 밑(현재 최대 favoritePosition+1)에 오도록 값을 부여하고
  // (서버가 부여하는 "맨 밑"과 자연 일치), 해제 시 null. bumpRooms 불필요(본 목록 순서 불변).
  const toggleFavorite = useCallback(
    async (friend: Friend) => {
      if (!token) return;
      const nextFavorite = !friend.favorite;
      const maxPos = orderRef.current.reduce(
        (m, f) =>
          f.favorite && f.favoritePosition != null ? Math.max(m, f.favoritePosition) : m,
        -1,
      );
      const next = orderRef.current.map((f) =>
        f.id === friend.id
          ? {
              ...f,
              favorite: nextFavorite,
              favoritePosition: nextFavorite ? maxPos + 1 : null,
            }
          : f,
      );
      orderRef.current = next;
      setFriends(next);
      try {
        await api.updateFriendFavorite(token, friend.id, nextFavorite);
      } catch {
        reloadRef.current();
      }
    },
    [token],
  );

  // 삭제(destructive) — confirmDialog 확인 후.
  const confirmDeleteFriend = useCallback(
    async (friend: Friend) => {
      if (!token) return;
      const ok = await confirmDialog({
        title: t('common.delete'),
        message: t('friends.confirmDelete', { name: friend.name }),
        confirmLabel: t('common.delete'),
        cancelLabel: t('common.cancel'),
        destructive: true,
      });
      if (!ok) return;
      try {
        await api.deleteFriend(token, friend.id);
        const next = orderRef.current.filter((f) => f.id !== friend.id);
        orderRef.current = next;
        setFriends(next);
        bumpRooms();
        if (room?.friendId === friend.id) setRoom(null);
      } catch {
        reloadRef.current();
      }
    },
    [token, t, bumpRooms, room, setRoom],
  );

  // 데스크톱에서 현재 방이 "전체"(room===null)면 상단 프로필 행을 강조.
  const allActive = isDesktop && room === null;

  // 분류 행 하나를 렌더한다. 두 섹션(즐겨찾기·분류) 모두 그립+AnimatedRow로 드래그 재정렬하며,
  // 각자 독립된 drag 컨텍스트(shared value·제스처 캐시가 분리된 useDragReorder 인스턴스)를 받는다.
  // 즐겨찾기한 분류는 두 섹션에 동시에 나타날 수 있어, swipeRefs·openRowId는 item.id가 아니라
  // 섹션까지 포함한 refKey로 구분한다(그래야 한쪽 스와이프가 다른 쪽을 잘못 닫지 않음).
  const renderFriendRow = (
    item: Friend,
    opts: { refKey: string; drag: DragReorder; index: number; isDragging: boolean },
  ) => {
    const { refKey, drag, index, isDragging } = opts;
    const active = isDesktop && room?.friendId === item.id;
    // 왼→오 스와이프 액션([즐겨찾기][삭제][수정]) — 아래 SwipeableRow와 스크린리더 대안(a11y 액션
    // 병합) 양쪽이 이 배열을 공유한다.
    const swipeActions: SwipeAction[] = [
      {
        key: 'favorite',
        icon: item.favorite ? StarOff : Star,
        label: item.favorite ? t('a11y.unfavorite') : t('a11y.favorite'),
        onPress: () => toggleFavorite(item),
      },
      {
        key: 'delete',
        icon: Trash2,
        label: t('common.delete'),
        onPress: () => confirmDeleteFriend(item),
      },
      {
        key: 'edit',
        icon: Pencil,
        label: t('friends.editTitle'),
        onPress: () => openCategoryEditor(item),
      },
    ];
    // 스크린리더 대안: 스와이프 액션을 행의 기존 커스텀 접근성 액션(activate/edit/increment/decrement)과
    // 병합한다. edit은 양쪽에 있으므로(swipeActions의 edit도 openCategoryEditor(item) = editRow(item)와
    // 동일 동작) 중복 제거하고 기존 edit 하나만 남긴다.
    const swipeA11y = buildSwipeActionsA11y(swipeActions);
    const row = (
      // 왼→오 스와이프로 [즐겨찾기][삭제][수정] 액션이 드러난다. 그립(세로)과는 방향으로 공존.
      <SwipeableRow
        ref={(ref) => {
          swipeRefs.current.set(refKey, ref);
        }}
        actions={swipeActions}
        onDragStateChange={(dragging) => {
          swipeDragging.current = dragging;
        }}
        onOpenChange={(open) => {
          if (open) {
            const prev = openRowId.current;
            if (prev && prev !== refKey) swipeRefs.current.get(prev)?.close();
            openRowId.current = refKey;
          } else if (openRowId.current === refKey) {
            openRowId.current = null;
          }
        }}
      >
        {/* 행 전체가 제스처 대상: 탭=열기 / 더블탭=수정 / 꾹 눌러 세로로 끌기=재정렬(그립 없음).
            섹션별 drag 컨텍스트를 받아, 즐겨찾기 드래그는 즐겨찾기 순서만·분류 드래그는 분류 순서만 바꾼다.
            접근성은 행에 통합 — 열기(activate) + 수정(edit) + 위/아래 이동(increment/decrement). */}
        <GestureDetector gesture={drag.getDragGesture(item.id)}>
          <View
            style={[
              styles.friendRow,
              (active || hoveredKey === refKey) && styles.friendRowFilled,
              isDragging && styles.friendRowLifted,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.name}
            accessibilityActions={[
              { name: 'activate' },
              { name: 'edit', label: t('friends.editTitle') },
              { name: 'increment', label: t('a11y.moveUp') },
              { name: 'decrement', label: t('a11y.moveDown') },
              // 스와이프 전용 액션(즐겨찾기·삭제) — edit은 위에서 이미 있으므로 제외.
              ...swipeA11y.accessibilityActions.filter((a) => a.name !== 'edit'),
            ]}
            onAccessibilityAction={(e) => {
              switch (e.nativeEvent.actionName) {
                case 'edit':
                  editRow(item);
                  break;
                case 'increment':
                  drag.moveByOne(item.id, -1);
                  break;
                case 'decrement':
                  drag.moveByOne(item.id, 1);
                  break;
                case 'activate':
                  openRow(refKey, item);
                  break;
                default:
                  // favorite·delete 등 스와이프 전용 액션은 swipeActions의 onPress로 위임.
                  swipeA11y.onAccessibilityAction(e);
              }
            }}
            onAccessibilityTap={() => openRow(refKey, item)}
          >
            <View style={styles.friendMain}>
              <CategoryAvatar color={item.color} size={44} />
              <View style={styles.friendName}>
                <View style={styles.nameRow}>
                  <Text variant="bodyStrong" numberOfLines={1} style={styles.nameText}>
                    {item.name}
                  </Text>
                  {item.favorite && (
                    <MaterialCommunityIcons
                      name="star"
                      size={12}
                      color={colors.ink}
                      style={styles.favoriteIcon}
                    />
                  )}
                </View>
                {item.description ? (
                  <Text
                    variant="caption"
                    color={colors.textTertiary}
                    numberOfLines={1}
                    style={styles.descriptionText}
                  >
                    {item.description}
                  </Text>
                ) : null}
              </View>
              <Text variant="micro" color={colors.textTertiary}>
                {item.messageCount ?? 0}
              </Text>
            </View>
          </View>
        </GestureDetector>
      </SwipeableRow>
    );
    return (
      // AnimatedRow: 잡은 행은 dragY 추종, 나머지는 슬롯 비켜남(offset). 드래그 중 데이터 불변.
      <AnimatedRow
        index={index}
        isDragging={isDragging}
        activeIndex={drag.activeIndex}
        targetIndex={drag.targetIndex}
        dragY={drag.dragY}
        draggedHeight={drag.draggedHeight}
      >
        {row}
      </AnimatedRow>
    );
  };

  return (
    <View style={styles.container}>
      {!embedded ? (
        <TabHeader
          title={t('friends.title')}
          subtitle={t('friends.info')}
          actions={[
            {
              key: 'add',
              icon: <Plus size={22} strokeWidth={2} color={colors.ink} />,
              label: t('friends.add'),
              // 분류 추가 = 픽커 관리 모드(태그 추가와 한 문법). 스와이프 [수정]만 색 프로필 폼.
              onPress: () => openCategoryManage(),
            },
          ]}
        />
      ) : null}

      <FlatList
        data={categoriesExpanded ? friends : []}
        keyExtractor={(item) => item.id}
        // 드래그 중(어느 섹션이든)에는 목록 스크롤을 멈춰 손가락 이동이 재정렬에만 쓰이게 한다.
        scrollEnabled={mainDrag.draggingId === null && favDrag.draggingId === null}
        extraData={[mainDrag.draggingId, categoriesExpanded, hoveredKey]}
        // 잡은 행의 셀이 이웃 셀에 가려지지 않게(특히 Android — 셀 형제 레벨에서 zIndex/elevation 필요).
        CellRendererComponent={mainDrag.CellRendererComponent}
        removeClippedSubviews={false}
        // 즐겨찾기 드래그 중엔 헤더(즐겨찾기 섹션이 사는 곳)를 본문 셀 위로 —
        // 안 올리면 즐겨찾기 행을 아래로 끌 때 헤더 경계를 넘는 순간 본문 리스트에 가려진다
        // (본 목록 드래그의 CellRenderer zIndex와 같은 규칙을 헤더 레벨에 적용 — 통일).
        ListHeaderComponentStyle={
          favDrag.draggingId !== null ? styles.headerLifted : undefined
        }
        ListHeaderComponent={
          <>
            {/* "전체" 프로필 — 탭=전체(나에게) 채팅, 더블탭=전체 프로필 수정. 아바타는 전체 프로필 색.
                왼→오 스와이프로 [수정] 하나만 드러난다(다른 분류 행과 같은 문법, 삭제·즐겨찾기 없음). */}
            <SwipeableRow
              ref={(ref) => {
                swipeRefs.current.set('self', ref);
              }}
              actions={[
                {
                  key: 'edit',
                  icon: Pencil,
                  label: t('friends.editTitle'),
                  onPress: () => openCategoryEditor({ self: true }),
                },
              ]}
              onDragStateChange={(dragging) => {
                swipeDragging.current = dragging;
              }}
              onOpenChange={(open) => {
                if (open) {
                  const prev = openRowId.current;
                  if (prev && prev !== 'self') swipeRefs.current.get(prev)?.close();
                  openRowId.current = 'self';
                } else if (openRowId.current === 'self') {
                  openRowId.current = null;
                }
              }}
            >
              <GestureDetector gesture={selfGesture}>
                <View
                  style={[styles.profileRow, allActive && styles.profileRowActive]}
                  accessibilityRole="button"
                  accessibilityLabel={t('chats.myRoom')}
                  accessibilityState={{ selected: allActive }}
                  accessibilityActions={[
                    { name: 'activate' },
                    { name: 'edit', label: t('friends.editTitle') },
                  ]}
                  onAccessibilityAction={(e) => {
                    if (e.nativeEvent.actionName === 'edit') {
                      openCategoryEditor({ self: true });
                    } else if (swipeDragging.current) {
                      // 스와이프 드래그 직후 오탭 무시(포인터 경로와 동일 가드).
                    } else if (openRowId.current === 'self') {
                      swipeRefs.current.get('self')?.close();
                    } else {
                      onOpenChat();
                    }
                  }}
                  onAccessibilityTap={() => {
                    if (swipeDragging.current) return;
                    if (openRowId.current === 'self') {
                      swipeRefs.current.get('self')?.close();
                      return;
                    }
                    onOpenChat();
                  }}
                >
                  <CategoryAvatar color={selfColor ?? SELF_DEFAULT_COLOR} size={56} />
                  <View style={styles.profileInfo}>
                    <Text variant="heading">{t('chats.myRoom')}</Text>
                    <Text
                      variant="label"
                      color={colors.textSecondary}
                      style={styles.profileStatus}
                    >
                      {selfDescription || t('friends.sendToMe')}
                    </Text>
                  </View>
                </View>
              </GestureDetector>
            </SwipeableRow>

            <View style={styles.divider} />

            {/* 즐겨찾기 섹션 — favorite=true인 분류만, favoritePosition 순. 하나도 없으면 렌더 안 함.
                이 섹션의 그립 드래그는 favDrag(즐겨찾기 전용 순서)만 바꾼다 — 본 목록 순서와 독립. */}
            {favorites.length > 0 && (
              <>
                <TouchableOpacity
                  style={styles.sectionRow}
                  onPress={() => toggleSection('friends.favorites')}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: favoritesExpanded }}
                  accessibilityLabel={t('friends.favoritesSection')}
                >
                  {favoritesExpanded ? (
                    <ChevronDown size={16} strokeWidth={2} color={colors.textSecondary} />
                  ) : (
                    <ChevronRight size={16} strokeWidth={2} color={colors.textSecondary} />
                  )}
                  <Text variant="caption" color={colors.textSecondary} style={styles.sectionTitle}>
                    {t('friends.favoritesSection')}
                  </Text>
                  <Text variant="micro" color={colors.textSecondary}>{favorites.length}</Text>
                </TouchableOpacity>
                {favoritesExpanded &&
                  favorites.map((f, i) => (
                    <View key={`fav:${f.id}`}>
                      {renderFriendRow(f, {
                        refKey: `fav:${f.id}`,
                        drag: favDrag,
                        index: i,
                        isDragging: favDrag.draggingId === f.id,
                      })}
                    </View>
                  ))}
                <View style={styles.divider} />
              </>
            )}

            <TouchableOpacity
              style={styles.sectionRow}
              onPress={() => toggleSection('friends.list')}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityState={{ expanded: categoriesExpanded }}
              accessibilityLabel={t('common.listSection')}
            >
              {categoriesExpanded ? (
                <ChevronDown size={16} strokeWidth={2} color={colors.textSecondary} />
              ) : (
                <ChevronRight size={16} strokeWidth={2} color={colors.textSecondary} />
              )}
              <Text variant="caption" color={colors.textSecondary} style={styles.sectionTitle}>
                {t('common.listSection')}
              </Text>
              <Text variant="micro" color={colors.textSecondary}>{friends.length}</Text>
            </TouchableOpacity>
          </>
        }
        renderItem={({ item, index }) =>
          renderFriendRow(item, {
            refKey: `cat:${item.id}`,
            drag: mainDrag,
            index,
            isDragging: mainDrag.draggingId === item.id,
          })
        }
        ListEmptyComponent={
          // 접기(data=[])로도 비므로, "첫 분류" 힌트는 정말 분류가 0개일 때만.
          friends.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyBox}>
                <Text style={{ fontSize: 22, textAlign: 'center', marginBottom: 10 }} color={colors.ink}>✳</Text>
                <Text variant="label" color={colors.textTertiary} style={styles.emptyText}>
                  {t('friends.emptyHint')}
                </Text>
              </View>
            </View>
          ) : null
        }
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

interface Props {
  token: string | null;
  onOpenChat: () => void;
  onOpenFriend: (friend: Friend) => void;
  /** 태그 캡슐에서 행 탭 시 태그 방 열기(TagsScreen과 동일 라우팅) */
  onOpenTag: (tag: Tag) => void;
  /** 태그 캡슐 "전체" 행 탭 시 태그 전체 방 열기(TagsScreen과 동일 라우팅) */
  onOpenTagAll: () => void;
  /** 자동구분 캡슐에서 행 탭 시 자동구분 방 열기(AutoScreen과 동일 라우팅) */
  onOpenAuto: (kind: AutoKind) => void;
  /** 자동구분 캡슐 "전체" 행 탭 시 자동구분 전체 방 열기(AutoScreen과 동일 라우팅) */
  onOpenAutoAll: () => void;
  onLogout: () => void;
}

// 캡슐 3종의 라벨은 레일 탭과 같은 i18n 키를 재사용한다(분류/태그/자동구분).
const CLASSIFY_LABEL_KEYS: Record<ClassifyTab, string> = {
  friends: 'tabs.friends',
  tags: 'tabs.tags',
  auto: 'tabs.auto',
};

// 캡슐(ClassifyTab) ↔ 캡슐 저장 키(CapsuleTab). 분류 캡슐의 저장 키는 'categories'.
// 캡슐 순서/노출은 users.capsuleOrder/hiddenCapsules에 캡슐만의 상태로 저장된다
// (메뉴 tabOrder/hiddenTabs와 완전히 별개 — 서로 영향 주지 않는다).
const CLASSIFY_TO_CAPSULE: Record<ClassifyTab, CapsuleTab> = {
  friends: 'categories',
  tags: 'tags',
  auto: 'auto',
};
const CAPSULE_TO_CLASSIFY: Record<CapsuleTab, ClassifyTab> = {
  categories: 'friends',
  tags: 'tags',
  auto: 'auto',
};

// 캡슐 하나 — 재정렬 애니메이션(가로) + 슬롯 실측(onLayout) + 롱프레스 드래그 제스처를 얹는다.
// 평소엔 본체 탭 = 화면 전환. 꾹 누르면(reorder onDragStart) 편집 모드로 들어가고, 그때만 숨김
// 가능 캡슐(태그·자동구분)에 iOS 앱 삭제 배지 문법의 X(숨김)/＋(되켜기) 배지가 캡슐 밖으로 삐져나온다.
function ClassifyCapsule({
  capKey,
  index,
  reorder,
  active,
  isHidden,
  isDragging,
  editMode,
  canHide,
  label,
  hideLabel,
  showLabel,
  onPress,
  onToggleHidden,
  onLayoutMeasured,
}: {
  capKey: ClassifyTab;
  index: number;
  reorder: ReturnType<typeof useTabReorder>;
  active: boolean;
  /** 편집 모드에서 되켜기 대상(숨김 상태)으로 흐리게 렌더할지 — 숨김 캡슐은 편집 모드에서만 나타난다. */
  isHidden: boolean;
  isDragging: boolean;
  editMode: boolean;
  /** 숨김 가능(태그·자동구분)이면 편집 모드에서 배지가 붙는다. 분류(false)는 배지 없음·항상 노출. */
  canHide: boolean;
  label: string;
  hideLabel: string;
  showLabel: string;
  onPress: () => void;
  onToggleHidden: () => void;
  /** 실측 레이아웃(가로 스크롤 콘텐츠 기준 x·width) — 부모가 "선택 탭/드래그 대상 보이게 스크롤"에 쓴다. */
  onLayoutMeasured?: (x: number, width: number) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeCapsuleStyles(colors), [colors]);
  const animStyle = useTabItemAnimatedStyle(reorder, index, 'x', true);
  const dimmed = editMode && isHidden;
  const fg = active
    ? colors.onAccent
    : dimmed
      ? colors.textTertiary
      : colors.textSecondary;
  // 편집 모드에서만 배지 노출. 숨김 캡슐엔 ＋(되켜기), 노출 캡슐엔 X(숨김) — 서로 대구.
  const showBadge = editMode && canHide;
  return (
    // overflow는 기본 visible — 배지가 캡슐 밖으로(음수 오프셋) 삐져나오도록 클립하지 않는다.
    <Animated.View
      style={[animStyle, isDragging && styles.capsuleLifted]}
      onLayout={(e) => {
        reorder.onItemLayout(index, e);
        onLayoutMeasured?.(e.nativeEvent.layout.x, e.nativeEvent.layout.width);
      }}
    >
      <GestureDetector gesture={reorder.getGesture(capKey)}>
        <Pressable
          style={[
            styles.capsule,
            active ? styles.capsuleActive : styles.capsuleInactive,
            dimmed && styles.capsuleHidden,
          ]}
          onPress={onPress}
          accessibilityRole="tab"
          accessibilityState={{ selected: active }}
          accessibilityLabel={label}
        >
          <Text variant="label" color={fg}>
            {label}
          </Text>
        </Pressable>
      </GestureDetector>
      {showBadge ? (
        isHidden ? (
          // 되켜기(＋) — 흑백 문법: background 채움 + 1px ink 보더 + ink ＋(X와 대구).
          <TouchableOpacity
            style={[styles.badge, styles.showBadge]}
            onPress={onToggleHidden}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={showLabel}
          >
            <Plus size={12} strokeWidth={2.5} color={colors.ink} />
          </TouchableOpacity>
        ) : (
          // 숨김(X) — 흑백 문법: ink 채움 + onAccent X. 그림자 금지, 하드 오프셋.
          <TouchableOpacity
            style={[styles.badge, styles.hideBadge]}
            onPress={onToggleHidden}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={hideLabel}
          >
            <X size={12} strokeWidth={2.5} color={colors.onAccent} />
          </TouchableOpacity>
        )
      ) : null}
    </Animated.View>
  );
}

// 분류 탭 최상단의 캡슐 세그먼트(분류 | 태그 | 자동구분). 앱 크롬 흑백 규칙:
// 활성 = ink 채움 + inverse 글자, 비활성 = 1px 보더 아웃라인. 캡슐만 borderRadius 999 허용.
// 캡슐을 꾹(250ms) 눌러 가로 드래그하면 순서가 바뀌고(users.capsuleOrder에 캡슐 전용 순서로 저장),
// 롱프레스 활성 순간 편집 모드로 들어간다. 순서·노출은 캡슐만의 것 — 메뉴(더보기·레일·탭바)와
// 완전히 별개라 서로 영향을 주지 않는다. 평소엔 숨긴 캡슐을 아예 렌더하지 않고,
// 편집 모드에서만 숨긴 캡슐이 흐리게 나타나 ＋로 되켜기·노출 캡슐엔 X로 숨김(iOS 앱 삭제 배지 문법).
// 분류 캡슐은 배지 없이 항상 노출·숨김 불가. 캡슐 라인 오른쪽 끝의 ⋮ 버튼도 편집 모드 진입 트리거이고,
// 편집 모드 중엔 같은 자리에서 체크(완료)로 바뀐다 — 편집 모드 종료는 이 체크가 유일한 경로.
function ClassifyCapsuleTabs({
  value,
  onChange,
  editMode,
  onEnterEditMode,
  onExitEditMode,
}: {
  value: ClassifyTab;
  onChange: (tab: ClassifyTab) => void;
  editMode: boolean;
  onEnterEditMode: () => void;
  onExitEditMode: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeCapsuleStyles(colors), [colors]);
  const { token, capsuleOrder, hiddenCapsules, setCapsuleOrder, setHiddenCapsules } =
    useAuth();

  const hiddenSet = useMemo(
    () => resolveHiddenCapsules(hiddenCapsules),
    [hiddenCapsules],
  );
  const isCapsuleHidden = useCallback(
    (capKey: ClassifyTab) =>
      capKey !== 'friends' &&
      hiddenSet.includes(CLASSIFY_TO_CAPSULE[capKey] as HideableCapsule),
    [hiddenSet],
  );
  // 캡슐 순서 = 저장된 capsuleOrder(정규화)를 캡슐(ClassifyTab) 키로 매핑. 메뉴와 무관한 캡슐 전용 순서.
  const classifyOrder = useMemo<ClassifyTab[]>(
    () => resolveCapsuleOrder(capsuleOrder).map((k) => CAPSULE_TO_CLASSIFY[k]),
    [capsuleOrder],
  );
  // 실제로 렌더하는 캡슐 — 평소엔 숨긴 캡슐 제외, 편집 모드에선 전부(숨긴 것도 흐리게 노출).
  // 드래그 재정렬 도메인(visibleOrderRef·onItemLayout index)과 정확히 일치시켜야 한다.
  const renderedOrder = useMemo<ClassifyTab[]>(
    () => (editMode ? classifyOrder : classifyOrder.filter((c) => !isCapsuleHidden(c))),
    [editMode, classifyOrder, isCapsuleHidden],
  );
  // 드래그 제스처가 놓을 때 읽는 현재 순서(문자열) — 매 렌더 최신으로 동기화.
  const visibleOrderRef = useRef<string[]>(renderedOrder);
  visibleOrderRef.current = renderedOrder;

  const tokenRef = useRef(token);
  tokenRef.current = token;
  const capsuleOrderRef = useRef(capsuleOrder);
  capsuleOrderRef.current = capsuleOrder;
  // 드래그 targetIndex → capKey 매핑에 쓸 최신 렌더 순서(콜백 캐시 안에서도 최신 값을 읽게).
  const renderedOrderRef = useRef<ClassifyTab[]>(renderedOrder);
  renderedOrderRef.current = renderedOrder;

  // ── 캡슐 바 가로 스크롤(좁은 화면에서 줄바꿈 대신 한 줄 유지) ──────────────────────
  const scrollRef = useRef<ScrollView>(null);
  // 각 캡슐의 실측 위치(스크롤 콘텐츠 기준 x·width) — 선택/드래그 대상 스크롤에 쓴다.
  const itemLayoutsRef = useRef<Record<string, { x: number; width: number }>>({});
  const scrollXRef = useRef(0);
  const containerWidthRef = useRef(0);
  const contentWidthRef = useRef(0);
  // 양끝 페이드 — 그 방향으로 스크롤할 내용이 더 있을 때만 보인다(스크롤 위치 따라 토글).
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateFades = useCallback(() => {
    const EPS = 2;
    const overflow = contentWidthRef.current - containerWidthRef.current;
    setCanScrollLeft(scrollXRef.current > EPS);
    setCanScrollRight(overflow - scrollXRef.current > EPS);
  }, []);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollXRef.current = e.nativeEvent.contentOffset.x;
      updateFades();
    },
    [updateFades],
  );
  const handleContainerLayout = useCallback(
    (e: LayoutChangeEvent) => {
      containerWidthRef.current = e.nativeEvent.layout.width;
      updateFades();
    },
    [updateFades],
  );
  const handleContentSizeChange = useCallback(
    (w: number) => {
      contentWidthRef.current = w;
      updateFades();
    },
    [updateFades],
  );

  // capKey가 보이는 영역 밖으로 걸치면 그쪽 끝이 보이도록만 스크롤한다(이미 보이면 무동작).
  const scrollIntoView = useCallback((capKey: ClassifyTab, animated = true) => {
    const item = itemLayoutsRef.current[capKey];
    const cw = containerWidthRef.current;
    if (!item || !cw) return;
    const PAD = 8;
    const x = scrollXRef.current;
    if (item.x < x + PAD) {
      scrollRef.current?.scrollTo({ x: Math.max(0, item.x - PAD), animated });
    } else if (item.x + item.width > x + cw - PAD) {
      scrollRef.current?.scrollTo({ x: item.x + item.width - cw + PAD, animated });
    }
  }, []);

  // 마운트 시 현재 선택 캡슐이 보이도록 — onLayout 실측이 비동기라 다음 프레임에 시도한다.
  useEffect(() => {
    const id = requestAnimationFrame(() => scrollIntoView(value, false));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 웹: 세로 마우스 휠을 가로 스크롤로 변환(트랙패드의 실제 가로 스크롤 제스처는 그대로 둔다).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = (
      scrollRef.current as unknown as { getScrollableNode?: () => HTMLElement } | null
    )?.getScrollableNode?.();
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      node.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  // 드래그 중 목표 슬롯(hop)이 바뀔 때마다 그 캡슐이 보이도록 스크롤을 따라간다 — 잡은 캡슐이
  // 뷰 밖으로 밀려나지 않게(좁은 화면에서 캡슐 수가 늘어나는 경우 대비).
  const scrollToHop = useCallback(
    (idx: number) => {
      const capKey = renderedOrderRef.current[idx];
      if (capKey) scrollIntoView(capKey, false);
    },
    [scrollIntoView],
  );

  // 페이드 그라데이션 색 — 캡슐 바 배경(colors.background)과 동일 계열에서 불투명→투명으로.
  const fadeColors = useMemo(
    () => [colors.background, hexAlpha(colors.background, 0)] as const,
    [colors.background],
  );

  // 커밋: 새 캡슐 순서를 그대로 capsuleOrder로 저장(메뉴 tabOrder는 건드리지 않는다) → 낙관 반영 + 서버 저장.
  // 실제 재정렬은 편집 모드(세 캡슐 모두 렌더)에서만 일어나므로 세 키가 다 있을 때만 커밋한다(방어).
  const commitCapsuleOrder = useCallback(
    (newVisible: string[]) => {
      if (newVisible.length !== CAPSULE_ORDER_DEFAULT.length) return;
      const next = (newVisible as ClassifyTab[]).map((c) => CLASSIFY_TO_CAPSULE[c]);
      const prev = capsuleOrderRef.current;
      setCapsuleOrder(next);
      const tk = tokenRef.current;
      if (tk)
        api
          .updateProfile(tk, { capsuleOrder: next })
          .catch(() => setCapsuleOrder(prev));
    },
    [setCapsuleOrder],
  );

  const reorder = useTabReorder({
    axis: 'x',
    visibleOrderRef,
    onCommit: commitCapsuleOrder,
    // 사용자 명시: "꾹 누르면" 순서 변경 — 빠른 탭(전환)엔 양보한다.
    activateAfterLongPress: 250,
    // 캡슐은 텍스트 폭이 제각각이라 측정 좌표 기반 hop·비켜남을 쓴다.
    variableSize: true,
    // 롱프레스 활성 순간 편집 모드 진입 — 이동으로 이어지면 재정렬도 그대로.
    onDragStart: onEnterEditMode,
    // 드래그 중 목표 슬롯이 바뀔 때마다 그 캡슐로 스크롤 따라가기(가로 스크롤 컨테이너 대응).
    onHopChange: scrollToHop,
  });
  // 재정렬 드래그(롱프레스 250ms 후 활성) 활성 여부를 패닝 리스너가 매번 최신으로 읽게(ref 미러).
  const draggingKeyRef = useRef<string | null>(reorder.draggingKey);
  draggingKeyRef.current = reorder.draggingKey;

  // 웹: 마우스로 캡슐 바를 잡아끌어(click-drag) 패닝 — 휠만으로는 발견성이 낮다는 피드백 대응.
  // 재정렬 롱프레스 드래그(activateAfterLongPress:250ms)와의 구분:
  //  · 재정렬은 "누른 채 15px 이상 움직이면 즉시 실패"하고, 250ms 동안 거의 안 움직여야 활성화된다
  //    (react-native-gesture-handler web PanGestureHandler의 shouldFail 로직 — activateAfterLongPress가
  //    설정되면 activeOffsetX/Y와 무관하게 이동량이 크면 그냥 실패로 처리된다).
  //  · 패닝은 5px만 넘으면 즉시 시작 — 재정렬을 의도한 "가만히 꾹 누르기"에서는 5px도 잘 안 넘으므로
  //    보통 서로 겹치지 않는다. 혹시 겹치더라도 매 pointermove에서 draggingKeyRef를 확인해 재정렬이
  //    실제로 활성화된 순간(draggingKey !== null)엔 패닝이 scrollLeft를 더 이상 건드리지 않는다.
  //  · 패닝이 실제로 일어났으면(moved) 뒤따르는 click을 캡처 단계에서 1회 억제해 탭 오전환을 막는다.
  //  · 마우스 포인터에만 반응(pointerType==='mouse') — 터치는 네이티브 스크롤에 맡긴다.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = (
      scrollRef.current as unknown as { getScrollableNode?: () => HTMLElement } | null
    )?.getScrollableNode?.();
    if (!node) return;
    const PAN_THRESHOLD = 5;
    let start: { x: number; scrollLeft: number; moved: boolean } | null = null;

    const suppressNextClick = (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      window.removeEventListener('click', suppressNextClick, true);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!start) return;
      if (draggingKeyRef.current !== null) return; // 재정렬 드래그가 활성화되면 패닝은 개입 안 함.
      const dx = e.clientX - start.x;
      if (!start.moved) {
        if (Math.abs(dx) < PAN_THRESHOLD) return;
        start.moved = true;
        node.style.cursor = 'grabbing';
      }
      node.scrollLeft = start.scrollLeft - dx;
      e.preventDefault();
    };
    const endPan = () => {
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', endPan, true);
      window.removeEventListener('pointercancel', endPan, true);
      node.style.cursor = '';
      if (start?.moved) {
        window.addEventListener('click', suppressNextClick, true);
        setTimeout(() => window.removeEventListener('click', suppressNextClick, true), 300);
      }
      start = null;
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      if (draggingKeyRef.current !== null) return; // 재정렬 드래그 중이면 패닝 시작 안 함.
      start = { x: e.clientX, scrollLeft: node.scrollLeft, moved: false };
      window.addEventListener('pointermove', onPointerMove, true);
      window.addEventListener('pointerup', endPan, true);
      window.addEventListener('pointercancel', endPan, true);
    };

    node.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      node.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', endPan, true);
      window.removeEventListener('pointercancel', endPan, true);
      window.removeEventListener('click', suppressNextClick, true);
    };
  }, []);

  // 노출 토글 — 태그·자동구분만(분류는 항상 노출). 캡슐 전용 hiddenCapsules 상태. 낙관 + 실패 복원.
  const toggleHidden = useCallback(
    (capKey: ClassifyTab) => {
      const key = CLASSIFY_TO_CAPSULE[capKey] as HideableCapsule;
      const currently = hiddenSet.includes(key);
      const next = currently
        ? hiddenSet.filter((k) => k !== key)
        : [...hiddenSet, key];
      const prev = hiddenCapsules ?? null;
      setHiddenCapsules(next);
      if (token) {
        api
          .updateProfile(token, { hiddenCapsules: next })
          .catch(() => setHiddenCapsules(prev));
      }
    },
    [hiddenSet, hiddenCapsules, setHiddenCapsules, token],
  );

  // 현재 선택 캡슐이 숨겨지면(X 배지로) 선택을 분류로 이동.
  useEffect(() => {
    if (value === 'friends') return;
    const key = CLASSIFY_TO_CAPSULE[value] as HideableCapsule;
    if (hiddenSet.includes(key)) onChange('friends');
  }, [value, hiddenSet, onChange]);

  return (
    <View style={styles.bar} accessibilityRole="tablist">
      <View style={styles.scrollWrap}>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.scroll, grabCursor]}
          contentContainerStyle={styles.capsuleGroup}
          // 드래그 중엔 스크롤을 꺼서 손가락 이동이 재정렬에만 쓰이게 한다(본 목록 드래그와 같은 규칙).
          scrollEnabled={reorder.draggingKey === null}
          onLayout={handleContainerLayout}
          onContentSizeChange={handleContentSizeChange}
          onScroll={handleScroll}
          scrollEventThrottle={32}
        >
          {renderedOrder.map((capKey, index) => {
            const active = value === capKey;
            const label = t(CLASSIFY_LABEL_KEYS[capKey]);
            const canHide = capKey !== 'friends'; // 분류는 숨김 불가 — 배지 없음·항상 노출
            const isHidden = isCapsuleHidden(capKey);
            return (
              <ClassifyCapsule
                key={capKey}
                capKey={capKey}
                index={index}
                reorder={reorder}
                active={active}
                isHidden={isHidden}
                isDragging={reorder.draggingKey === capKey}
                editMode={editMode}
                canHide={canHide}
                label={label}
                hideLabel={t('friends.hideTab', { name: label })}
                showLabel={t('friends.showTab', { name: label })}
                onLayoutMeasured={(x, width) => {
                  itemLayoutsRef.current[capKey] = { x, width };
                }}
                onPress={() => {
                  if (reorder.didDragRef.current) return; // 드래그 직후 오탭 무시
                  // 편집 모드 중엔 화면 전환 금지 — 흐린(숨긴) 캡슐 탭만 되켜기로 동작.
                  if (editMode) {
                    if (isHidden) toggleHidden(capKey);
                    return;
                  }
                  onChange(capKey);
                  scrollIntoView(capKey);
                }}
                onToggleHidden={() => toggleHidden(capKey)}
              />
            );
          })}
        </ScrollView>
        {/* 양끝 페이드 — 그 방향으로 스크롤할 캡슐이 더 있을 때만(스크롤 위치 따라 토글). */}
        {canScrollLeft ? (
          <LinearGradient
            pointerEvents="none"
            colors={fadeColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.fadeLeft}
          />
        ) : null}
        {canScrollRight ? (
          <LinearGradient
            pointerEvents="none"
            colors={fadeColors}
            start={{ x: 1, y: 0 }}
            end={{ x: 0, y: 0 }}
            style={styles.fadeRight}
          />
        ) : null}
      </View>
      {/* 캡슐 라인 오른쪽 끝 — 평소엔 ⋮(편집 모드 진입), 편집 모드 중엔 체크(편집 완료)로 바뀐다. */}
      <TouchableOpacity
        style={styles.editToggle}
        onPress={editMode ? onExitEditMode : onEnterEditMode}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel={editMode ? t('friends.finishEditTabs') : t('friends.editTabs')}
      >
        {editMode ? (
          <Check size={16} strokeWidth={2} color={colors.textSecondary} />
        ) : (
          <EllipsisVertical size={16} strokeWidth={2} color={colors.textSecondary} />
        )}
      </TouchableOpacity>
    </View>
  );
}

// 분류 탭 컨테이너 — 최상단 캡슐 + 그 아래 통째로 전환되는 리스트.
// 캡슐 상태는 루트(SelectedRoomProvider)에 있어 900px 트리 스왑에도 살아남는다.
// 각 리스트는 자기 화면(FriendsList/TagsScreen/AutoScreen)을 그대로 재사용해 헤더·스와이프·
// 라우팅 문법을 미러링한다(새 문법 없음). 임베드 시 상단 상태바 여백은 캡슐이 진다(embedded).
export function FriendsScreen({
  token,
  onOpenChat,
  onOpenFriend,
  onOpenTag,
  onOpenTagAll,
  onOpenAuto,
  onOpenAutoAll,
  onLogout,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeContainerStyles(colors), [colors]);
  const { classifyTab, setClassifyTab, bumpRooms } = useSelectedRoom();
  // 캡슐 편집 모드(순간적 — X/＋ 배지 노출). 화면 로컬 state로 충분(900px 스왑 생존 불요).
  const [capsuleEditMode, setCapsuleEditMode] = useState(false);
  // 그룹 헤더의 '추가'가 여는 관리 모달(루트 상주). 여긴 열기만.
  const { openManage: openCategoryManage } = useCategoryEdit();
  const { openTagCreate } = useTagCreate();

  // 헤더 '추가'(+) 동작은 활성 캡슐에 따라 갈린다: 분류→분류 추가, 태그→태그 추가(관리 모달),
  // 자동구분→+ 없음(종류가 정적이라 추가 개념이 없다).
  const addAction = useMemo(() => {
    if (classifyTab === 'tags') {
      return {
        key: 'add',
        icon: <Plus size={22} strokeWidth={2} color={colors.ink} />,
        label: t('tags.addTitle'),
        onPress: () => openTagCreate(() => bumpRooms()),
      };
    }
    if (classifyTab === 'friends') {
      return {
        key: 'add',
        icon: <Plus size={22} strokeWidth={2} color={colors.ink} />,
        label: t('friends.add'),
        // 분류 추가 = 픽커 관리 모드(태그 추가와 한 문법). 추가 후 그룹 목록 재조회.
        onPress: () => openCategoryManage(() => bumpRooms()),
      };
    }
    return null; // 자동구분: 추가 없음
  }, [classifyTab, colors.ink, t, openTagCreate, openCategoryManage, bumpRooms]);

  return (
    <View style={styles.container}>
      {/* 그룹 탭 상단 타이틀은 '그룹' 하나. 임베드된 화면들은 자기 타이틀을 렌더하지 않는다(캡슐이 알려주므로). */}
      <TabHeader
        title={t('tabs.group')}
        subtitle={t('tabs.groupInfo')}
        actions={addAction ? [addAction] : undefined}
      />
      <ClassifyCapsuleTabs
        value={classifyTab}
        onChange={setClassifyTab}
        editMode={capsuleEditMode}
        onEnterEditMode={() => setCapsuleEditMode(true)}
        onExitEditMode={() => setCapsuleEditMode(false)}
      />
      {/* 캡슐 아래 본문 — 편집 모드 종료는 캡슐 라인의 체크 버튼이 유일한 경로(바깥 탭 종료 없음). */}
      <View style={styles.body}>
        {classifyTab === 'tags' ? (
          <TagsScreen
            token={token}
            onOpenTag={onOpenTag}
            onOpenTagAll={onOpenTagAll}
            onLogout={onLogout}
            embedded
          />
        ) : classifyTab === 'auto' ? (
          <AutoScreen
            token={token}
            onOpenAuto={onOpenAuto}
            onOpenAutoAll={onOpenAutoAll}
            onLogout={onLogout}
            embedded
          />
        ) : (
          <FriendsList
            token={token}
            onOpenChat={onOpenChat}
            onOpenFriend={onOpenFriend}
            onLogout={onLogout}
            embedded
          />
        )}
      </View>
    </View>
  );
}

const makeContainerStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    // 캡슐 아래 본문.
    body: {
      flex: 1,
    },
  });

// 편집 모드 X/＋ 배지(top:-6, 지름 18)가 캡슐 위로 삐져나오는 만큼의 세로 여유. ScrollView는
// 자기 박스 바깥을 항상 클립하므로, 콘텐츠 쪽에 이만큼 paddingTop을 주고 ScrollView 자신에
// 같은 값만큼 음수 marginTop을 줘서(아래 scroll 스타일) 시각적 위치는 그대로 유지한다.
const CAPSULE_BADGE_CLEARANCE = 10;

const makeCapsuleStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    // 캡슐 바는 그룹 헤더(타이틀 '그룹' + 추가) 바로 아래에 온다 — 상태바 여백은 헤더가 지므로
    // 여기선 짧은 상단 여백만. 아래 임베드된 화면들은 자기 헤더를 렌더하지 않는다.
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: 8,
    },
    // 캡슐 가로 스크롤 영역 — flex:1로 늘어나되, ⋮/체크 버튼은 그 오른쪽 고정 자리에 남는다.
    // 폭이 좁아져도 줄바꿈하지 않고 한 줄을 유지, 대신 이 안에서 가로 스크롤된다(재정렬 보존).
    scrollWrap: {
      flex: 1,
      minWidth: 0,
    },
    // 음수 marginTop: 아래 capsuleGroup의 paddingTop(배지 클리핑 방지용)만큼 끌어올려
    // ScrollView가 차지하는 실제 레이아웃 공간은 배지 여유가 없던 예전과 동일하게 유지한다.
    scroll: {
      flex: 1,
      minWidth: 0,
      marginTop: -CAPSULE_BADGE_CLEARANCE,
    },
    // ScrollView의 contentContainerStyle — 캡슐들을 한 줄로 배열(wrap 없음).
    // paddingTop: 편집 모드 배지가 캡슐 위로 삐져나와도(top:-6) ScrollView 자체 클리핑에
    // 잘리지 않도록 콘텐츠 안쪽에 여유를 준다(위 scroll.marginTop과 짝 — 시각적 위치는 불변).
    capsuleGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingTop: CAPSULE_BADGE_CLEARANCE,
    },
    // 캡슐 바가 가로로 넘칠 때 양끝에 스크롤 가능함을 알리는 페이드(내용이 그 방향으로 더 있을
    // 때만 렌더 — canScrollLeft/Right). 배경(colors.background)과 동일 계열 그라데이션.
    fadeLeft: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 20,
    },
    fadeRight: {
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      width: 20,
    },
    // 캡슐 라인 맨 오른쪽 ⋮·체크 — ChatScreen 헤더 편집(⋮) 문법과 동일(크기 16·textSecondary).
    editToggle: {
      paddingHorizontal: 6,
    },
    // 캡슐만 라운드 999 허용(앱 크롬 나머지는 라운드 0). 라벨 + (있으면) 눈을 한 줄에.
    capsule: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 7,
    },
    capsuleActive: {
      backgroundColor: colors.accent,
    },
    capsuleInactive: {
      borderWidth: 1,
      borderColor: colors.border,
    },
    // 편집 모드에서 숨긴 캡슐 = 흐리게(＋로 되켤 수 있게). 평소엔 아예 렌더 안 됨(겹침 없음).
    capsuleHidden: {
      opacity: 0.45,
    },
    // 드래그로 들린 캡슐 — 형제 위로(그림자 금지, z-lift만).
    capsuleLifted: {
      zIndex: 10,
      elevation: 10,
    },
    // iOS 앱 삭제 배지 문법: 캡슐 우측 상단 밖으로 살짝 삐져나온 작은 원. 그림자 금지, 하드 오프셋.
    badge: {
      position: 'absolute',
      top: -6,
      right: -6,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 20,
      elevation: 20,
    },
    // 숨김(X) — ink 채움 위 onAccent X.
    hideBadge: {
      backgroundColor: colors.ink,
    },
    // 되켜기(＋) — background 채움 + 1px ink 보더 + ink ＋(X와 대구).
    showBadge: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.ink,
    },
  });

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  // 즐겨찾기 드래그 중 헤더(즐겨찾기 섹션)를 본문 셀 위로 — 잡은 행이 본문에 가려지지 않게.
  headerLifted: {
    zIndex: 10,
    elevation: 10,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  // 데스크톱에서 "전체" 방 선택 시 — 연회색 면으로 강조.
  profileRowActive: {
    backgroundColor: colors.surface,
  },
  profileInfo: {
    marginLeft: 14,
  },
  profileStatus: {
    marginTop: 3,
  },
  divider: {
    borderTopWidth: 1,
    borderStyle: 'dotted' as const,
    borderTopColor: colors.border,
    marginHorizontal: 20,
    marginTop: 8,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
    gap: 10,
  },
  sectionTitle: {
    flex: 1,
  },
  // 행 높이 고정(드래그 index 계산의 전제). 배경은 불투명 — 드래그 중 겹침이 깔끔하게 덮이도록.
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_HEIGHT,
    paddingHorizontal: 20,
    backgroundColor: colors.background,
  },
  // 데스크톱 선택된 행: surface 채움(그림자 금지 — 플랫 원칙).
  friendRowFilled: {
    backgroundColor: colors.surface,
  },
  // 드래그로 들린 행: surface 채움 + 1px ink 보더(선택 표시 문법). 그림자 금지 — z-lift·opacity로 뜬 느낌.
  friendRowLifted: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.ink,
  },
  friendMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  friendName: {
    flex: 1,
    marginLeft: 14,
    marginRight: 10,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nameText: {
    flexShrink: 1,
  },
  favoriteIcon: {
    marginLeft: 5,
  },
  // 설명(상태메시지) 캡션 — 이름 아래 한 줄. 있는 행만 렌더되어 그 행만 2줄이 된다.
  descriptionText: {
    marginTop: 2,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyBox: {
    borderWidth: 1,
    borderStyle: 'dotted',
    borderColor: colors.border,
    paddingVertical: 28,
    paddingHorizontal: 24,
    marginHorizontal: 40,
  },
  emptyText: {
    textAlign: 'center',
    lineHeight: 20,
  },
});
