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
import { GripVertical, Pencil, Pin, PinOff, Plus, Trash2 } from 'lucide-react-native';
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

// 분류 행은 높이 고정 — 드래그 시 dy/rowHeight로 대상 index를 계산한다.
const ROW_HEIGHT = 64;

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
  children,
}: {
  index: number;
  isDragging: boolean;
  activeIndex: SharedValue<number>;
  targetIndex: SharedValue<number>;
  dragY: SharedValue<number>;
  children: ReactNode;
}) {
  // 비켜남 오프셋 — activeIndex/targetIndex에만 의존(매 프레임 아님) → 슬롯 hop마다 부드럽게 timing.
  const offset = useDerivedValue(() => {
    const ai = activeIndex.value;
    if (ai === -1) return 0; // 유휴/커밋: 즉시 0(데이터가 새 순서로 바뀌므로 점프 없음)
    if (index === ai) return 0; // 잡은 행은 rowStyle에서 dragY로 처리
    const ti = targetIndex.value;
    if (ai < ti && index > ai && index <= ti) return withTiming(-ROW_HEIGHT, SHIFT_TIMING);
    if (ai > ti && index >= ti && index < ai) return withTiming(ROW_HEIGHT, SHIFT_TIMING);
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
  // 드래그 재정렬 상태. draggingId(들린 스타일·scrollEnabled)는 세션당 1회만 바뀐다 —
  // 드래그 중에는 데이터·셀을 건드리지 않으므로 리렌더/리마운트/제스처 간섭이 없다.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const orderRef = useRef<Friend[]>([]); // 현재 순서의 원천(드래그 중 불변, 놓을 때만 커밋)
  const startIndexRef = useRef(0);
  // 제스처는 ref로 최신 값을 읽으므로 token/재조회는 ref로 넘긴다(스플리터 패턴).
  const tokenRef = useRef(token);
  const reloadRef = useRef<() => void>(() => {});
  // 스와이프 상태(웹에서 드래그 후 탭 무시 · 한 번에 하나만 열기).
  const swipeDragging = useRef(false);
  const openRowId = useRef<string | null>(null);
  const swipeRefs = useRef(new Map<string, SwipeableRowMethods | null>());
  // 재정렬 공유값: activeIndex(잡은 행 index, -1=유휴), targetIndex(현재 목표 슬롯), dragY(잡은 행 translateY).
  const activeIndex = useSharedValue(-1);
  const targetIndex = useSharedValue(-1);
  const dragY = useSharedValue(0);

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

  // 낙관적으로 확정한 순서를 서버에 저장. 실패하면 서버 순서로 복원.
  const persistOrder = useCallback((next: Friend[]) => {
    const tk = tokenRef.current;
    if (!tk) return;
    api
      .reorderFriends(tk, next.map((f) => f.id))
      .catch(() => reloadRef.current());
  }, []);

  // 배열에서 id를 delta칸 옮긴다(접근성 increment/decrement, 드래그 공용).
  const moveByOne = useCallback(
    (id: string, delta: number) => {
      const arr = orderRef.current;
      const idx = arr.findIndex((f) => f.id === id);
      if (idx < 0) return;
      const target = clamp(idx + delta, 0, arr.length - 1);
      if (target === idx) return;
      const next = [...arr];
      const [moved] = next.splice(idx, 1);
      next.splice(target, 0, moved);
      orderRef.current = next;
      setFriends(next);
      persistOrder(next);
    },
    [persistOrder],
  );

  // 고정 토글 — 채팅 탭 정렬·배지에 반영(bumpRooms). 분류 탭 순서(position)는 그대로.
  const togglePin = useCallback(
    async (friend: Friend) => {
      if (!token) return;
      const nextPinned = !friend.pinned;
      const next = orderRef.current.map((f) =>
        f.id === friend.id ? { ...f, pinned: nextPinned } : f,
      );
      orderRef.current = next;
      setFriends(next);
      try {
        await api.updateFriendPinned(token, friend.id, nextPinned);
        bumpRooms();
      } catch {
        reloadRef.current();
      }
    },
    [token, bumpRooms],
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

  // 제스처를 분류 id별로 한 번만 만들어 캐시한다 — 목록 재정렬(setFriends)로
  // 리렌더돼도 GestureDetector가 같은 제스처 객체를 받아 드래그 도중 재부착되지 않는다.
  const gesturesRef = useRef(new Map<string, ReturnType<typeof Gesture.Pan>>());
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
          const idx = orderRef.current.findIndex((f) => f.id === id);
          if (idx < 0) return;
          startIndexRef.current = idx;
          activeIndex.value = idx;
          targetIndex.value = idx;
          dragY.value = 0;
          // 세션당 1회 리렌더(들린 스타일 + scrollEnabled false). 이후 드래그 중엔 setState 없음.
          setDraggingId(id);
        })
        .onUpdate((event) => {
          const n = orderRef.current.length;
          if (n === 0) return;
          const start = startIndexRef.current;
          // 잡은 행: translationY 그대로, 리스트 상하 경계로만 클램프(보정 불필요 — 슬롯 불변).
          dragY.value = clamp(
            event.translationY,
            -start * ROW_HEIGHT,
            (n - 1 - start) * ROW_HEIGHT,
          );
          // 목표 슬롯: 데이터는 안 바꾸고 이 값만 갱신 → 다른 행들이 비켜난다(AnimatedRow offset).
          targetIndex.value = clamp(
            start + Math.round(event.translationY / ROW_HEIGHT),
            0,
            n - 1,
          );
        })
        .onFinalize(() => {
          const start = startIndexRef.current;
          const target = targetIndex.value;
          const n = orderRef.current.length;
          // 놓을 때 딱 한 번 커밋: splice + setFriends + persist.
          if (target !== start && target >= 0 && target < n && activeIndex.value !== -1) {
            const next = [...orderRef.current];
            const [moved] = next.splice(start, 1);
            next.splice(target, 0, moved);
            orderRef.current = next;
            setFriends(next);
            persistOrder(next);
          }
          // 커밋과 동시에 리셋 — activeIndex=-1이면 모든 offset이 즉시 0이 되어(withTiming 아님)
          // 새 데이터 순서와 정확히 맞물려 시각 점프가 없다. (setFriends 뒤에 리셋 = 같은 프레임에서 정합)
          activeIndex.value = -1;
          targetIndex.value = -1;
          dragY.value = 0;
          setDraggingId(null);
        });
      cache.set(id, gesture);
      return gesture;
    },
    [persistOrder, activeIndex, targetIndex, dragY],
  );

  // 데스크톱에서 현재 방이 "전체"(room===null)면 상단 프로필 행을 강조.
  const allActive = isDesktop && room === null;

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
        // 드래그 중에는 목록 스크롤을 멈춰 손가락 이동이 재정렬에만 쓰이게 한다.
        scrollEnabled={draggingId === null}
        extraData={draggingId}
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
            <View style={styles.sectionRow}>
              <Text variant="caption" color={colors.textSecondary}>{t('tabs.friends')}</Text>
              <View style={styles.sectionLeader} />
              <Text variant="micro" color={colors.textSecondary}>{friends.length}</Text>
            </View>
          </>
        }
        renderItem={({ item, index }) => {
          const isDragging = draggingId === item.id;
          const active = isDesktop && room?.friendId === item.id;
          return (
            // AnimatedRow: 잡은 행은 dragY 추종, 나머지는 슬롯 비켜남(offset). 드래그 중 데이터 불변.
            <AnimatedRow
              index={index}
              isDragging={isDragging}
              activeIndex={activeIndex}
              targetIndex={targetIndex}
              dragY={dragY}
            >
            {/* 왼→오 스와이프로 [고정][삭제][수정] 액션이 드러난다. 그립(세로)과는 방향으로 공존. */}
            <SwipeableRow
              ref={(ref) => {
                swipeRefs.current.set(item.id, ref);
              }}
              actions={[
                {
                  key: 'pin',
                  icon: item.pinned ? PinOff : Pin,
                  label: item.pinned ? t('a11y.unpin') : t('a11y.pin'),
                  onPress: () => togglePin(item),
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
                  if (prev && prev !== item.id) swipeRefs.current.get(prev)?.close();
                  openRowId.current = item.id;
                } else if (openRowId.current === item.id) {
                  openRowId.current = null;
                }
              }}
            >
              <View
                style={[
                  styles.friendRow,
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
                    if (openRowId.current === item.id) {
                      swipeRefs.current.get(item.id)?.close();
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
                      {item.pinned && (
                        <MaterialCommunityIcons
                          name="pin"
                          size={12}
                          color={colors.textTertiary}
                          style={styles.pinIcon}
                        />
                      )}
                    </View>
                  </View>
                  <Text variant="micro" color={colors.textTertiary}>
                    {item.messageCount ?? 0}
                  </Text>
                </TouchableOpacity>
                {/* 드래그 핸들 — 여기서만 세로 재정렬을 시작한다(행 탭/편집/가로 스와이프와 충돌 없게). */}
                <GestureDetector gesture={getDragGesture(item.id)}>
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
                      moveByOne(
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
            </AnimatedRow>
          );
        }}
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
  pinIcon: {
    marginLeft: 5,
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
