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
import { GripVertical, Pencil, Plus, Star, StarOff, Trash2 } from 'lucide-react-native';
import {
  FlatList,
  Platform,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { api, ApiError, Friend } from '../api';
import { useAuth } from '../auth';
import { useCategoryEdit } from '../category-edit';
import { CategoryAvatar } from '../components/CategoryAvatar';
import { SwipeableRow, SwipeableRowMethods } from '../components/SwipeableRow';
import { TabHeader } from '../components/TabHeader';
import { Text } from '../components/Text';
import { confirmDialog } from '../notify';
import { useSelectedRoom } from '../selected-room';
import { layout, SELF_DEFAULT_COLOR, ThemeColors } from '../theme';
import { useTheme } from '../theme-context';

// 분류 행 높이 — 기본 1줄. 설명(상태메시지)이 있는 행만 캡션 줄만큼 더 높다.
// 드래그 재정렬은 행마다 실제 높이가 다를 수 있어 인덱스*고정높이가 아니라
// 누적 높이(오프셋) 기반으로 계산한다(아래 rowHeightOf·useDragReorder 참고).
const ROW_HEIGHT = 64;
const DESC_EXTRA = 18;
const rowHeightOf = (f: Friend) => (f.description ? ROW_HEIGHT + DESC_EXTRA : ROW_HEIGHT);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// 웹에서만 그랩 커서 (RN 타입에 없는 값이라 캐스팅) — 스플리터의 col-resize와 같은 방식.
const grabCursor =
  Platform.OS === 'web'
    ? ({ cursor: 'grab' } as unknown as ViewStyle)
    : null;

// 들린 행: opacity(그림자 금지 — DESIGN) + zIndex/elevation로 형제 위로.
const LIFT = { opacity: 0.95, zIndex: 10, elevation: 10 } as const;
// 비켜나는 행 애니메이션 시간.
const SHIFT_TIMING = { duration: 130 } as const;

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
    <Animated.View style={[rowStyle, isDragging && LIFT]}>{children}</Animated.View>
  );
}

// 높이 가변 그립 드래그 재정렬을 한 벌로 캡슐화한 훅. 서로 다른 섹션(분류 본목록 · 즐겨찾기)에서
// 각각 독립 인스턴스로 호출하면 shared value·세션 ref·제스처 캐시가 전부 분리되어, 한쪽 드래그가
// 다른 쪽 행을 움직이거나 상태를 섞지 않는다(물리적으로 한 번에 한 포인터만 드래그하므로 안전).
// - getList: 현재 순서의 원천(드래그 시점의 실제 배열). 항상 최신을 읽도록 ref로 감싼다.
// - onCommit(next): 놓을 때(또는 접근성 이동) 재정렬된 배열을 넘긴다 — 호출부가 상태 반영·서버 저장을 담당.
function useDragReorder(getList: () => Friend[], onCommit: (next: Friend[]) => void) {
  // 재정렬 공유값: activeIndex(잡은 행 index, -1=유휴), targetIndex(현재 목표 슬롯),
  // dragY(잡은 행 translateY), draggedHeight(잡은 행 자신의 실제 높이 — 설명 유무로 가변).
  const activeIndex = useSharedValue(-1);
  const targetIndex = useSharedValue(-1);
  const dragY = useSharedValue(0);
  const draggedHeight = useSharedValue(ROW_HEIGHT);
  // draggingId(들린 스타일·scrollEnabled)는 세션당 1회만 바뀐다 — 드래그 중에는 데이터·셀을
  // 건드리지 않으므로 리렌더/리마운트/제스처 간섭이 없다.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const startIndexRef = useRef(0);
  // 드래그 세션 동안의 경계값(픽셀) — onStart에서 그 시점 순서의 실제 높이로 계산해 고정한다.
  const dragBoundsRef = useRef({ min: 0, max: 0 });
  // 잡은 행의 원래 상단 오프셋(누적 높이) — 드래그 중 목표 슬롯 계산에 쓴다.
  const dragTopOffsetRef = useRef(0);
  // 잡은 행을 뺀 "나머지" 행들의 높이 배열 — 그 사이 어디에 꽂히는지로 targetIndex를 구한다.
  const othersHeightsRef = useRef<number[]>([]);
  // 제스처를 id별로 한 번만 만들어 캐시한다 — 목록 재정렬(setState)로 리렌더돼도 GestureDetector가
  // 같은 제스처 객체를 받아 드래그 도중 재부착되지 않는다.
  const gesturesRef = useRef(new Map<string, ReturnType<typeof Gesture.Pan>>());
  // 제스처는 한 번만 생성·캐시되므로 최신 getList/onCommit을 ref로 읽는다.
  const getListRef = useRef(getList);
  const onCommitRef = useRef(onCommit);
  getListRef.current = getList;
  onCommitRef.current = onCommit;

  const getDragGesture = useCallback(
    (id: string) => {
      const cache = gesturesRef.current;
      const cached = cache.get(id);
      if (cached) return cached;
      const gesture = Gesture.Pan()
        .runOnJS(true)
        // 핸들에서 세로로 조금만 움직여도 잡는다(탭·가로 스와이프와 구분).
        .activeOffsetY([-6, 6])
        .onStart(() => {
          const list = getListRef.current();
          const idx = list.findIndex((f) => f.id === id);
          if (idx < 0) return;
          startIndexRef.current = idx;
          // 이 드래그 세션 동안 쓸 높이 스냅샷 — 놓을 때까지 데이터는 안 바뀌므로 고정해도 안전.
          const heights = list.map(rowHeightOf);
          const h = heights[idx];
          draggedHeight.value = h;
          const topOffset = heights.slice(0, idx).reduce((s, v) => s + v, 0);
          const total = heights.reduce((s, v) => s + v, 0);
          dragTopOffsetRef.current = topOffset;
          dragBoundsRef.current = { min: -topOffset, max: total - h - topOffset };
          othersHeightsRef.current = heights.filter((_, i) => i !== idx);
          activeIndex.value = idx;
          targetIndex.value = idx;
          dragY.value = 0;
          // 세션당 1회 리렌더(들린 스타일 + scrollEnabled false). 이후 드래그 중엔 setState 없음.
          setDraggingId(id);
        })
        .onUpdate((event) => {
          const n = getListRef.current().length;
          if (n === 0) return;
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
        })
        .onFinalize(() => {
          const start = startIndexRef.current;
          const target = targetIndex.value;
          const list = getListRef.current();
          const n = list.length;
          // 놓을 때 딱 한 번 커밋: splice 결과를 onCommit에 넘긴다(상태·저장은 호출부 몫).
          if (target !== start && target >= 0 && target < n && activeIndex.value !== -1) {
            const next = [...list];
            const [moved] = next.splice(start, 1);
            next.splice(target, 0, moved);
            onCommitRef.current(next);
          }
          // 커밋과 동시에 리셋 — activeIndex=-1이면 모든 offset이 즉시 0이 되어(withTiming 아님)
          // 새 데이터 순서와 정확히 맞물려 시각 점프가 없다. (setState 뒤에 리셋 = 같은 프레임에서 정합)
          activeIndex.value = -1;
          targetIndex.value = -1;
          dragY.value = 0;
          setDraggingId(null);
        });
      cache.set(id, gesture);
      return gesture;
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

  return {
    activeIndex,
    targetIndex,
    dragY,
    draggedHeight,
    draggingId,
    getDragGesture,
    moveByOne,
  };
}

type DragReorder = ReturnType<typeof useDragReorder>;

interface Props {
  token: string | null;
  onOpenChat: () => void;
  onOpenFriend: (friend: Friend) => void;
  onLogout: () => void;
}

export function FriendsScreen({
  token,
  onOpenChat,
  onOpenFriend,
  onLogout,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { selfColor } = useAuth();
  // roomsVersion: 대화 패널·분류 편집(루트 CategoryEditProvider)이 개수·목록을 바꾸는 신호.
  // room: 데스크톱 스플릿뷰에서 현재 방 — active 행 강조에 쓴다.
  const { roomsVersion, room, setRoom, bumpRooms } = useSelectedRoom();
  // 분류 추가·수정 편집기는 루트 프로바이더로 승격됨 — 여기선 열기만 한다.
  const { open: openCategoryEditor } = useCategoryEdit();
  // 데스크톱(스플릿뷰)에서만 선택 방을 강조한다.
  const { width } = useWindowDimensions();
  const isDesktop = width >= layout.desktopBreakpoint;

  const [friends, setFriends] = useState<Friend[]>([]);
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

  // ── 본 목록(분류) 드래그 ────────────────────────────────────────────
  // 커밋: splice된 새 순서를 낙관적으로 반영하고 서버에 저장. 실패하면 서버 순서로 복원.
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
    const row = (
      // 왼→오 스와이프로 [즐겨찾기][삭제][수정] 액션이 드러난다. 그립(세로)과는 방향으로 공존.
      <SwipeableRow
        ref={(ref) => {
          swipeRefs.current.set(refKey, ref);
        }}
        actions={[
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
        ]}
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
        <View
          style={[
            styles.friendRow,
            { height: rowHeightOf(item) },
            active && styles.friendRowFilled,
            isDragging && styles.friendRowLifted,
          ]}
        >
          {/* 탭=열기(열린 스와이프면 닫기) / long-press=편집. */}
          <TouchableOpacity
            style={styles.friendMain}
            activeOpacity={0.6}
            onPress={() => {
              if (swipeDragging.current) return;
              if (openRowId.current === refKey) {
                swipeRefs.current.get(refKey)?.close();
                return;
              }
              onOpenFriend(item);
            }}
            onLongPress={() => openCategoryEditor(item)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
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
          </TouchableOpacity>
          {/* 드래그 핸들 — 여기서만 세로 재정렬을 시작한다(행 탭/편집/가로 스와이프와 충돌 없게).
              섹션별 drag 컨텍스트를 받아, 즐겨찾기 그립은 즐겨찾기 순서만·분류 그립은 분류 순서만 바꾼다. */}
          <GestureDetector gesture={drag.getDragGesture(item.id)}>
            <View
              style={[styles.dragHandle, grabCursor]}
              accessibilityRole="adjustable"
              accessibilityLabel={t('a11y.reorder')}
              accessibilityActions={[
                { name: 'increment' },
                { name: 'decrement' },
              ]}
              onAccessibilityAction={(e) => {
                // increment = 위로 한 칸, decrement = 아래로 한 칸.
                drag.moveByOne(
                  item.id,
                  e.nativeEvent.actionName === 'increment' ? -1 : 1,
                );
              }}
            >
              <GripVertical size={18} strokeWidth={2} color={colors.textTertiary} />
            </View>
          </GestureDetector>
        </View>
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
      <TabHeader
        title={t('friends.title')}
        actions={[
          {
            key: 'add',
            icon: <Plus size={22} strokeWidth={2} color={colors.ink} />,
            label: t('friends.add'),
            onPress: () => openCategoryEditor(),
          },
        ]}
      />

      <FlatList
        data={friends}
        keyExtractor={(item) => item.id}
        // 드래그 중(어느 섹션이든)에는 목록 스크롤을 멈춰 손가락 이동이 재정렬에만 쓰이게 한다.
        scrollEnabled={mainDrag.draggingId === null && favDrag.draggingId === null}
        extraData={mainDrag.draggingId}
        ListHeaderComponent={
          <>
            {/* "전체" 프로필 — 누르면 전체(나에게) 채팅으로. 아바타는 전체 프로필 색. */}
            <TouchableOpacity
              style={[styles.profileRow, allActive && styles.profileRowActive]}
              onPress={onOpenChat}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityState={{ selected: allActive }}
            >
              <CategoryAvatar color={selfColor ?? SELF_DEFAULT_COLOR} size={56} />
              <View style={styles.profileInfo}>
                <Text variant="heading">{t('chats.myRoom')}</Text>
                <Text
                  variant="label"
                  color={colors.textSecondary}
                  style={styles.profileStatus}
                >
                  {t('friends.sendToMe')}
                </Text>
              </View>
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* 즐겨찾기 섹션 — favorite=true인 분류만, favoritePosition 순. 하나도 없으면 렌더 안 함.
                이 섹션의 그립 드래그는 favDrag(즐겨찾기 전용 순서)만 바꾼다 — 본 목록 순서와 독립. */}
            {favorites.length > 0 && (
              <>
                <View style={styles.sectionRow}>
                  <Text variant="caption" color={colors.textSecondary}>
                    {t('friends.favoritesSection')}
                  </Text>
                  <View style={styles.sectionLeader} />
                  <Text variant="micro" color={colors.textSecondary}>{favorites.length}</Text>
                </View>
                {favorites.map((f, i) => (
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

            <View style={styles.sectionRow}>
              <Text variant="caption" color={colors.textSecondary}>{t('tabs.friends')}</Text>
              <View style={styles.sectionLeader} />
              <Text variant="micro" color={colors.textSecondary}>{friends.length}</Text>
            </View>
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
          <View style={styles.empty}>
            <View style={styles.emptyBox}>
              <Text style={{ fontSize: 22, textAlign: 'center', marginBottom: 10 }} color={colors.ink}>✳</Text>
              <Text variant="label" color={colors.textTertiary} style={styles.emptyText}>
                {t('friends.emptyHint')}
              </Text>
            </View>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 20,
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
  sectionLeader: {
    flex: 1,
    borderTopWidth: 1,
    borderStyle: 'dotted' as const,
    borderTopColor: colors.border,
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
  dragHandle: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 12,
    paddingRight: 2,
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
