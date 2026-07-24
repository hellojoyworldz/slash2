import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import {
  ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import {
  Asterisk,
  ChevronDown,
  ChevronRight,
  Link as LinkIcon,
  MapPin,
  Play,
  ShoppingBag,
  Star,
  StarOff,
  StickyNote,
} from 'lucide-react-native';
import { api, ApiError, AutoCounts, AutoKind } from '../api';
import { useAuth } from '../auth';
import { useCollapsedSections } from '../collapsed-sections';
import { resolveAutoFavorites, resolveAutoOrder } from '../auto-filter';
import {
  buildSwipeActionsA11y,
  SwipeAction,
  SwipeableRow,
  SwipeableRowMethods,
} from '../components/SwipeableRow';
import { TabHeader } from '../components/TabHeader';
import { Text } from '../components/Text';
import { useSelectedRoom } from '../selected-room';
import { ReorderControls, ReorderRow, useReorder } from '../use-reorder';
import { layout, ThemeColors } from '../theme';
import { useTheme } from '../theme-context';

// lucide 아이콘 컴포넌트 타입(색·크기는 호출부가 결정) — SwipeableRow와 같은 표기.
type IconComponent = ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

// 자동구분 5종 아이콘. 이름은 i18n(auto.names.<key>), 순서는 users.autoOrder(없으면 기본).
// 아이콘 타일은 무채색(surface 채움 + ink 아이콘) — 자동구분은 색을 갖지 않는다(색은 분류의 것).
const AUTO_ICONS: Record<AutoKind, IconComponent> = {
  place: MapPin,
  video: Play,
  item: ShoppingBag,
  memo: StickyNote,
  link: LinkIcon,
};

// 행 높이 균일(그립 드래그 재정렬의 전제) — tile 44 + 세로 패딩.
const ROW_HEIGHT = 68;

interface Props {
  token: string | null;
  onOpenAuto: (kind: AutoKind) => void;
  /** "전체" 행 탭 → 자동구분 전체 방 열기(링크가 하나라도 잡힌 메시지 모음, 보기 전용). */
  onOpenAutoAll: () => void;
  onLogout: () => void;
  /** 그룹 탭 캡슐 아래에 임베드될 때 true — 헤더는 그룹 컨테이너가 지므로 여기선 렌더하지 않는다. */
  embedded?: boolean;
}

// 자동구분 탭 — 분류·태그 탭과 동일한 문법. 종류 6종은 정적이라 즐겨찾기는 users.autoFavorites에 저장한다.
// 접이식 '즐겨찾기' 섹션(★ 종류, 전용 순서 드래그) + 접이식 '자동구분' 섹션(전체 6종, autoOrder 드래그).
// 왼→오 스와이프 [즐겨찾기] 하나. 즐겨찾기해도 '자동구분' 섹션에서 빠지지 않는다(분류·태그와 동일).
export function AutoScreen({
  token,
  onOpenAuto,
  onOpenAutoAll,
  onLogout,
  embedded = false,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // 데스크톱 스플릿뷰에서만 현재 선택된 자동구분을 강조한다.
  // autoAll: "전체" 자동구분 방이 열렸는지(상단 전체 행 강조).
  const { autoKind, autoAll } = useSelectedRoom();
  // 자동구분 순서·즐겨찾기(사용자 값 우선) + 저장 후 컨텍스트 갱신.
  const { autoOrder, setAutoOrder, autoFavorites, setAutoFavorites } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width >= layout.desktopBreakpoint;

  const [counts, setCounts] = useState<AutoCounts | null>(null);
  // 두 섹션(즐겨찾기·자동구분) 접기/펼치기 — 서버 저장(분류·태그 탭과 동일 계약).
  const { isCollapsed, toggle: toggleSection } = useCollapsedSections();
  const favoritesExpanded = !isCollapsed('auto.favorites');
  const autoExpanded = !isCollapsed('auto.list');

  // 본 목록 순서(드래그 낙관 반영). 컨텍스트 autoOrder가 바뀌면 동기화.
  const [order, setOrder] = useState<AutoKind[]>(() => resolveAutoOrder(autoOrder));
  const orderRef = useRef<string[]>(order);
  orderRef.current = order;
  useEffect(() => {
    const next = resolveAutoOrder(autoOrder);
    setOrder(next);
    orderRef.current = next;
  }, [autoOrder]);

  // 즐겨찾기 순서(부분집합, 배열 순서=즐겨찾기 순서). 컨텍스트 autoFavorites가 바뀌면 동기화.
  const [favOrder, setFavOrder] = useState<AutoKind[]>(() =>
    resolveAutoFavorites(autoFavorites),
  );
  const favOrderRef = useRef<string[]>(favOrder);
  favOrderRef.current = favOrder;
  useEffect(() => {
    const next = resolveAutoFavorites(autoFavorites);
    setFavOrder(next);
    favOrderRef.current = next;
  }, [autoFavorites]);

  const tokenRef = useRef(token);
  tokenRef.current = token;

  // 스와이프 상태(웹에서 드래그 후 탭 무시 · 한 번에 하나만 열기). 두 섹션 공존 → refKey로 구분.
  const swipeDragging = useRef(false);
  const openRowId = useRef<string | null>(null);
  const swipeRefs = useRef(new Map<string, SwipeableRowMethods | null>());

  // 본 목록 순서 확정 → 낙관 반영(컨텍스트 → 칩·보드·탭 전파) + 서버 저장. 실패 시 이전 순서로 복원.
  const commitOrder = useCallback(
    (ids: string[]) => {
      const next = ids as AutoKind[];
      const prev = orderRef.current as AutoKind[];
      setOrder(next);
      setAutoOrder(next);
      const tk = tokenRef.current;
      if (tk) {
        api.updateProfile(tk, { autoOrder: next }).catch(() => {
          setOrder(prev);
          setAutoOrder(prev);
        });
      }
    },
    [setAutoOrder],
  );

  // 즐겨찾기 순서 확정 → 낙관 반영 + 서버 저장. 빈 배열은 컨텍스트/서버에서 null로 통일.
  // 실패 시 이전 순서로 복원.
  const commitFavOrder = useCallback(
    (ids: string[]) => {
      const next = ids as AutoKind[];
      const prev = favOrderRef.current as AutoKind[];
      setFavOrder(next);
      setAutoFavorites(next.length ? next : null);
      const tk = tokenRef.current;
      if (tk) {
        api.updateProfile(tk, { autoFavorites: next }).catch(() => {
          setFavOrder(prev);
          setAutoFavorites(prev.length ? prev : null);
        });
      }
    },
    [setAutoFavorites],
  );

  // 행 싱글탭 = 방 열기(열린 스와이프면 닫기, 스와이프 드래그 직후면 무시) — 예전 onPress 로직.
  const openRow = useCallback(
    (refKey: string, item: AutoKind) => {
      if (swipeDragging.current) return;
      if (openRowId.current === refKey) {
        swipeRefs.current.get(refKey)?.close();
        return;
      }
      onOpenAuto(item);
    },
    [onOpenAuto],
  );

  // 웹 마우스 hover된 행(refKey) — surface로 강조. 종류가 두 섹션에 겹쳐 나오므로 refKey로 구분.
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  // 자동구분 종류는 수정 폼이 없다 → onActivate(열기)만, onEditRequest 없음(더블탭 수정 제외).
  const mainReorder = useReorder({
    rowHeight: ROW_HEIGHT,
    orderRef,
    onCommit: commitOrder,
    onActivate: (id) => openRow(`auto:${id}`, id as AutoKind),
    onHover: (id, h) => setHoveredKey(h ? `auto:${id}` : null),
  });
  const favReorder = useReorder({
    rowHeight: ROW_HEIGHT,
    orderRef: favOrderRef,
    onCommit: commitFavOrder,
    onActivate: (id) => openRow(`fav:${id}`, id as AutoKind),
    onHover: (id, h) => setHoveredKey(h ? `fav:${id}` : null),
  });

  // 즐겨찾기(★) 토글 — 없으면 맨 밑에 추가, 있으면 제거. 본 목록(자동구분) 순서엔 영향 없음.
  // 실패 시 이전 상태로 복원.
  const toggleFavorite = useCallback(
    (kind: AutoKind) => {
      const current = favOrderRef.current as AutoKind[];
      const isFav = current.includes(kind);
      const next = isFav ? current.filter((k) => k !== kind) : [...current, kind];
      setFavOrder(next);
      setAutoFavorites(next.length ? next : null);
      const tk = tokenRef.current;
      if (tk) {
        api.updateProfile(tk, { autoFavorites: next }).catch(() => {
          setFavOrder(current);
          setAutoFavorites(current.length ? current : null);
        });
      }
    },
    [setAutoFavorites],
  );

  // 탭 진입 시마다 개수 갱신(방에서 돌아오면 최신 반영).
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let cancelled = false;
      (async () => {
        try {
          const data = await api.autoCounts(token);
          if (!cancelled) setCounts(data);
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) onLogout();
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [token, onLogout]),
  );

  // 자동구분 행 하나를 렌더한다. 두 섹션(즐겨찾기·자동구분) 모두 그립+ReorderRow로 드래그 재정렬하며,
  // 각자 독립된 reorder 컨텍스트를 받는다. 종류는 두 섹션에 동시에 나타날 수 있어 refKey로 구분한다.
  const renderAutoRow = (
    item: AutoKind,
    opts: {
      refKey: string;
      reorder: ReorderControls;
      index: number;
      isDragging: boolean;
      isFavorite: boolean;
    },
  ) => {
    const { refKey, reorder, index, isDragging, isFavorite } = opts;
    const Icon = AUTO_ICONS[item];
    const active = isDesktop && autoKind === item;
    const count = counts?.[item] ?? 0;
    // 왼→오 스와이프 액션([즐겨찾기] 하나) — 아래 SwipeableRow와 스크린리더 대안(a11y 액션 병합)
    // 양쪽이 이 배열을 공유한다.
    const swipeActions: SwipeAction[] = [
      {
        key: 'favorite',
        icon: isFavorite ? StarOff : Star,
        label: isFavorite ? t('a11y.unfavorite') : t('a11y.favorite'),
        onPress: () => toggleFavorite(item),
      },
    ];
    const swipeA11y = buildSwipeActionsA11y(swipeActions);
    return (
      <ReorderRow index={index} isDragging={isDragging} controls={reorder}>
        {/* 왼→오 스와이프로 [즐겨찾기] 하나(종류는 정적이라 삭제·수정·고정 없음). */}
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
          {/* 행 전체가 제스처 대상: 탭=열기 / 꾹 눌러 세로로 끌기=재정렬(그립 없음).
              접근성은 행에 통합 — 열기(activate) + 위/아래 이동(increment/decrement). */}
          <GestureDetector gesture={reorder.getGesture(item)}>
            <View
              style={[
                styles.row,
                (active || hoveredKey === refKey) && styles.rowActive,
                isDragging && styles.rowLifted,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t(`auto.names.${item}`)}
              accessibilityState={{ selected: active }}
              accessibilityActions={[
                { name: 'activate' },
                { name: 'increment', label: t('a11y.moveUp') },
                { name: 'decrement', label: t('a11y.moveDown') },
                // 스와이프 전용 액션(즐겨찾기).
                ...swipeA11y.accessibilityActions,
              ]}
              onAccessibilityAction={(e) => {
                switch (e.nativeEvent.actionName) {
                  case 'increment':
                    reorder.moveByOne(item, -1);
                    break;
                  case 'decrement':
                    reorder.moveByOne(item, 1);
                    break;
                  case 'activate':
                    openRow(refKey, item);
                    break;
                  default:
                    // favorite 등 스와이프 전용 액션은 swipeActions의 onPress로 위임.
                    swipeA11y.onAccessibilityAction(e);
                }
              }}
              onAccessibilityTap={() => openRow(refKey, item)}
            >
              <View style={styles.rowMain}>
                <View style={styles.tile}>
                  <Icon size={22} strokeWidth={2} color={colors.ink} />
                </View>
                <View style={styles.nameRow}>
                  <Text variant="subheading" style={styles.name} numberOfLines={1}>
                    {t(`auto.names.${item}`)}
                  </Text>
                  {isFavorite ? (
                    <MaterialCommunityIcons
                      name="star"
                      size={12}
                      color={colors.ink}
                      style={styles.badgeIcon}
                    />
                  ) : null}
                </View>
                <Text variant="micro" color={colors.textTertiary}>
                  {count}
                </Text>
              </View>
            </View>
          </GestureDetector>
        </SwipeableRow>
      </ReorderRow>
    );
  };

  const favSet = useMemo(() => new Set(favOrder), [favOrder]);

  return (
    <View style={styles.container}>
      {!embedded ? (
        <TabHeader title={t('auto.title')} subtitle={t('auto.info')} />
      ) : null}

      <FlatList
        data={autoExpanded ? order : []}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.listContent}
        scrollEnabled={mainReorder.draggingId === null && favReorder.draggingId === null}
        extraData={[mainReorder.draggingId, autoExpanded, favSet, hoveredKey]}
        // 잡은 행의 셀이 이웃 셀에 가려지지 않게(특히 Android).
        CellRendererComponent={mainReorder.CellRendererComponent}
        removeClippedSubviews={false}
        // 즐겨찾기 드래그 중엔 헤더를 본문 셀 위로 — 아래로 끌 때 본문에 가려지지 않게(분류 탭과 통일).
        ListHeaderComponentStyle={
          favReorder.draggingId !== null ? styles.headerLifted : undefined
        }
        ListHeaderComponent={
          <>
            {/* "전체" 행 — 링크가 하나라도 잡힌 메시지 모음(보기 전용). 분류 탭의 전체(나에게) 행을 미러하되,
                프로필은 ✳(asterisk) 타일(무채/잉크, 자동구분 정체성 글리프), 스와이프·드래그·더블탭은 없다. */}
            <TouchableOpacity
              style={[styles.allRow, isDesktop && autoAll && styles.allRowActive]}
              onPress={onOpenAutoAll}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={t('common.all')}
              accessibilityState={{ selected: isDesktop && autoAll }}
            >
              <View style={styles.allTile}>
                <Asterisk size={26} strokeWidth={2} color={colors.ink} />
              </View>
              <View style={styles.allInfo}>
                <Text variant="heading">{t('common.all')}</Text>
                <Text
                  variant="label"
                  color={colors.textSecondary}
                  style={styles.allStatus}
                >
                  {t('friends.sendToMe')}
                </Text>
              </View>
            </TouchableOpacity>
            <View style={styles.divider} />

            {/* 즐겨찾기 섹션 — favOrder(부분집합) 순. 하나도 없으면 렌더 안 함. */}
            {favOrder.length > 0 ? (
              <>
                <TouchableOpacity
                  style={styles.sectionRow}
                  onPress={() => toggleSection('auto.favorites')}
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
                  <Text
                    variant="caption"
                    color={colors.textSecondary}
                    style={styles.sectionTitle}
                  >
                    {t('friends.favoritesSection')}
                  </Text>
                  <Text variant="micro" color={colors.textSecondary}>
                    {favOrder.length}
                  </Text>
                </TouchableOpacity>
                {favoritesExpanded &&
                  favOrder.map((k, i) => (
                    <View key={`fav:${k}`}>
                      {renderAutoRow(k, {
                        refKey: `fav:${k}`,
                        reorder: favReorder,
                        index: i,
                        isDragging: favReorder.draggingId === k,
                        isFavorite: true,
                      })}
                    </View>
                  ))}
                <View style={styles.divider} />
              </>
            ) : null}

            {/* '자동구분' 섹션 헤더 — 전체 6종. */}
            <TouchableOpacity
              style={styles.sectionRow}
              onPress={() => toggleSection('auto.list')}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityState={{ expanded: autoExpanded }}
              accessibilityLabel={t('common.listSection')}
            >
              {autoExpanded ? (
                <ChevronDown size={16} strokeWidth={2} color={colors.textSecondary} />
              ) : (
                <ChevronRight size={16} strokeWidth={2} color={colors.textSecondary} />
              )}
              <Text
                variant="caption"
                color={colors.textSecondary}
                style={styles.sectionTitle}
              >
                {t('common.listSection')}
              </Text>
              <Text variant="micro" color={colors.textSecondary}>
                {order.length}
              </Text>
            </TouchableOpacity>
          </>
        }
        renderItem={({ item, index }) =>
          renderAutoRow(item, {
            refKey: `auto:${item}`,
            reorder: mainReorder,
            index,
            isDragging: mainReorder.draggingId === item,
            isFavorite: favSet.has(item),
          })
        }
      />
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    // 즐겨찾기 드래그 중 헤더(즐겨찾기 섹션)를 본문 셀 위로 — 잡은 행이 본문에 가려지지 않게.
    headerLifted: {
      zIndex: 10,
      elevation: 10,
    },
    listContent: {
      paddingTop: 4,
      paddingBottom: 20,
    },
    // "전체" 행 — 분류 탭 전체(나에게) 행과 동일 규격(큰 타일 + 제목 + 부제).
    allRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 14,
    },
    // 데스크톱에서 전체 방 선택 시 — 연회색 면으로 강조(다른 선택 행과 동일 문법).
    allRowActive: {
      backgroundColor: colors.surface,
    },
    // ✳ 아이덴티티 타일 — 무채 surface 채움 + 1px 보더(태그 전체의 # 타일과 대구), 라운드 0.
    allTile: {
      width: 56,
      height: 56,
      borderRadius: 0,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    allInfo: {
      marginLeft: 14,
    },
    allStatus: {
      marginTop: 3,
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
    divider: {
      borderTopWidth: 1,
      borderStyle: 'dotted' as const,
      borderTopColor: colors.border,
      marginHorizontal: 20,
      marginTop: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      height: ROW_HEIGHT,
      paddingHorizontal: 20,
      backgroundColor: colors.background,
    },
    // 데스크톱 선택 행 — 연회색 면으로 강조(채팅·분류 탭과 동일 문법).
    rowActive: {
      backgroundColor: colors.surface,
    },
    // 드래그로 들린 행: surface 채움 + 1px ink 보더(선택 표시 문법). 그림자 금지.
    rowLifted: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.ink,
    },
    rowMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    // 무채색 아이콘 타일(보더 없음) — 색은 분류의 것이라 자동구분은 색을 갖지 않는다.
    tile: {
      width: 44,
      height: 44,
      borderRadius: 0,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nameRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: 14,
      marginRight: 10,
    },
    name: {
      flexShrink: 1,
    },
    badgeIcon: {
      marginLeft: 5,
    },
  });
