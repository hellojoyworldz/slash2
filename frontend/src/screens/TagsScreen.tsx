import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef } from 'react';
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
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Star,
  StarOff,
  Trash2,
} from 'lucide-react-native';
import { api, Tag } from '../api';
import { useAuth } from '../auth';
import { useCollapsedSections } from '../collapsed-sections';
import { HashTile } from '../components/HashTile';
import { SwipeableRow, SwipeableRowMethods } from '../components/SwipeableRow';
import { TabHeader } from '../components/TabHeader';
import { Text } from '../components/Text';
import { useSelectedRoom } from '../selected-room';
import { useTagCreate } from '../tag-create';
import {
  useVarReorder,
  VarReorderControls,
  VarReorderRow,
} from '../use-reorder';
import { layout, ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { useTagCrud } from '../use-tags';

interface Props {
  token: string | null;
  /** 행 탭 → 태그 방 열기(모바일 push / 데스크톱 스플릿뷰 패널 교체). */
  onOpenTag: (tag: Tag) => void;
  /** "전체" 행 탭 → 태그 전체 방 열기(태그 하나 이상 달린 메시지 모음, 보기 전용). */
  onOpenTagAll: () => void;
  onLogout: () => void;
  /** 그룹 탭 캡슐 아래에 임베드될 때 true — 헤더는 그룹 컨테이너가 지므로 여기선 렌더하지 않는다. */
  embedded?: boolean;
}

// 행 높이 — 설명(상태메시지) 유무와 무관하게 모든 행이 같은 높이(분류 탭과 동일 관례,
// 사용자 확정). 설명은 행 안에서 이름 아래 한 줄(numberOfLines=1 ellipsis)로 들어간다.
const ROW_HEIGHT = 68;

// 태그 탭(채팅형) — 분류 탭(FriendsScreen)과 완전히 동일한 문법.
// 접이식 '즐겨찾기' 섹션(★ 태그, 전용 순서 드래그) + 접이식 '태그' 섹션(전체, position 순서 드래그).
// 행 = [# 타일][태그명(+★+고정 핀)(+설명 한 줄)][우측 messageCount][그립]. 색은 분류의 것이라 태그는 색 없음.
// 왼→오 스와이프 [즐겨찾기][삭제][수정] — 태그엔 고정 없음(사용자 확정).
// 즐겨찾기해도 '태그' 섹션에서 빠지지 않는다(분류와 동일).
export function TagsScreen({
  token,
  onOpenTag,
  onOpenTagAll,
  onLogout,
  embedded = false,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { tags, setTags, reload, removeTag } = useTagCrud(token);
  // 데스크톱 스플릿뷰 강조 + 목록 갱신 신호(bumpRooms) — 고정/수정/추가가 보드·선택모달에 반영되게.
  // tagAll: 데스크톱에서 "전체" 태그 방이 열렸는지(상단 전체 행 강조).
  const { tag: selectedTag, tagAll, roomsVersion, bumpRooms } = useSelectedRoom();
  // 태그 추가(관리 모달)·이름수정·전체 프로필 편집은 루트 상주 호스트 — 여기선 열기만.
  const { openTagCreate, openTagRename, openTagAllEdit } = useTagCreate();
  // "전체" 행 프로필 — 색·부제(커스텀 설명이 있으면 그것, 없으면 '전체 메시지 보기').
  const { tagAllColor, tagAllDescription } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width >= layout.desktopBreakpoint;

  // 두 섹션(즐겨찾기·태그) 접기/펼치기 — 서버 저장(분류 탭과 동일 계약).
  const { isCollapsed, toggle: toggleSection } = useCollapsedSections();
  const favoritesExpanded = !isCollapsed('tags.favorites');
  const tagsExpanded = !isCollapsed('tags.list');

  // 즐겨찾기 섹션 = favorite=true인 태그만, favoritePosition 오름차순(없으면 맨 뒤)으로 정렬.
  // 본 목록(태그) 순서와 독립 — 즐겨찾기해도 '태그' 섹션에서 빠지지 않고 두 섹션 모두에 보인다.
  const favorites = useMemo(
    () =>
      tags
        .filter((x) => x.favorite)
        .sort(
          (a, b) =>
            (a.favoritePosition ?? Number.MAX_SAFE_INTEGER) -
            (b.favoritePosition ?? Number.MAX_SAFE_INTEGER),
        ),
    [tags],
  );

  // 드래그가 읽을 현재 순서 — 매 렌더 최신으로 동기화(드래그 콜백이 lazy하게 읽음).
  const tagsRef = useRef<Tag[]>(tags);
  tagsRef.current = tags;
  const favoritesRef = useRef<Tag[]>(favorites);
  favoritesRef.current = favorites;
  const tokenRef = useRef(token);
  tokenRef.current = token;

  // 스와이프 상태(웹에서 드래그 후 탭 무시 · 한 번에 하나만 열기) — 분류 탭과 동일 관례.
  // 태그는 두 섹션에 동시에 나타날 수 있어 refKey(섹션 포함)로 구분한다.
  const swipeDragging = useRef(false);
  const openRowId = useRef<string | null>(null);
  const swipeRefs = useRef(new Map<string, SwipeableRowMethods | null>());

  // 탭 진입·메시지 태그 변경·추가(roomsVersion)마다 목록·개수 최신화.
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      reload();
    }, [token, reload, roomsVersion]),
  );

  // 수정 = 이름·설명 변경(루트 상주 모달). 성공 시 목록의 해당 태그를 최신본으로 교체.
  const onEdit = useCallback(
    (tag: Tag) => {
      openTagRename(tag, (updated) => {
        setTags((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      });
    },
    [openTagRename, setTags],
  );

  // 행 싱글탭 = 방 열기(열린 스와이프면 닫기, 스와이프 드래그 직후면 무시) — 예전 onPress 로직.
  const openRow = useCallback(
    (refKey: string, tag: Tag) => {
      if (swipeDragging.current) return;
      if (openRowId.current === refKey) {
        swipeRefs.current.get(refKey)?.close();
        return;
      }
      onOpenTag(tag);
    },
    [onOpenTag],
  );

  // ── 본 목록(태그) 드래그 ────────────────────────────────────────────
  // 커밋: 새 순서를 낙관적으로 반영 + position 저장(reorderTags). 실패 시 서버 순서로 복원.
  // 행 탭=열기(onActivate), 행 더블탭=수정(onEditRequest). refKey는 섹션(tag:/favtag:)으로 구분.
  const mainDrag = useVarReorder<Tag>({
    getOrder: () => tagsRef.current,
    getId: (x) => x.id,
    getHeight: () => ROW_HEIGHT,
    onCommit: useCallback(
      (next: Tag[]) => {
        setTags(next);
        const tk = tokenRef.current;
        if (tk) api.reorderTags(tk, next.map((x) => x.id)).catch(() => reload());
      },
      [setTags, reload],
    ),
    onActivate: (id) => {
      const tag = tagsRef.current.find((x) => x.id === id);
      if (tag) openRow(`tag:${id}`, tag);
    },
    onEditRequest: (id) => {
      const tag = tagsRef.current.find((x) => x.id === id);
      if (tag) onEdit(tag);
    },
  });

  // ── 즐겨찾기 섹션 드래그(본 목록과 독립) ──────────────────────────────
  // 커밋: 새 즐겨찾기 순서로 favoritePosition을 재부여(본 목록 배열 순서는 불변). 저장은 reorderFavoriteTags.
  const favDrag = useVarReorder<Tag>({
    getOrder: () => favoritesRef.current,
    getId: (x) => x.id,
    getHeight: () => ROW_HEIGHT,
    onCommit: useCallback(
      (nextFavs: Tag[]) => {
        const posById = new Map(nextFavs.map((x, i) => [x.id, i] as const));
        setTags((prev) =>
          prev.map((x) =>
            posById.has(x.id) ? { ...x, favoritePosition: posById.get(x.id)! } : x,
          ),
        );
        const tk = tokenRef.current;
        if (tk) {
          api
            .reorderFavoriteTags(tk, nextFavs.map((x) => x.id))
            .catch(() => reload());
        }
      },
      [setTags, reload],
    ),
    onActivate: (id) => {
      const tag = tagsRef.current.find((x) => x.id === id);
      if (tag) openRow(`favtag:${id}`, tag);
    },
    onEditRequest: (id) => {
      const tag = tagsRef.current.find((x) => x.id === id);
      if (tag) onEdit(tag);
    },
  });

  // 즐겨찾기(★) 토글 — 고정(pinned)과는 무관한 별개 표시. 본 목록(태그) 정렬엔 영향 없음.
  // 낙관 갱신: 별 추가 시 즐겨찾기 섹션 맨 밑(현재 최대 favoritePosition+1)에 오도록 값을 부여, 해제 시 null.
  const toggleFavorite = useCallback(
    async (tag: Tag) => {
      if (!token) return;
      const nextFavorite = !tag.favorite;
      const maxPos = tagsRef.current.reduce(
        (m, x) =>
          x.favorite && x.favoritePosition != null ? Math.max(m, x.favoritePosition) : m,
        -1,
      );
      setTags((prev) =>
        prev.map((x) =>
          x.id === tag.id
            ? {
                ...x,
                favorite: nextFavorite,
                favoritePosition: nextFavorite ? maxPos + 1 : null,
              }
            : x,
        ),
      );
      try {
        await api.updateTagFavorite(token, tag.id, nextFavorite);
      } catch {
        reload();
      }
    },
    [token, setTags, reload],
  );

  // 태그 행 하나를 렌더한다. 두 섹션(즐겨찾기·태그) 모두 VarReorderRow로 드래그 재정렬하며,
  // 각자 독립된 drag 컨텍스트를 받는다. 즐겨찾기한 태그는 두 섹션에 동시에 나타날 수 있어,
  // swipeRefs·openRowId는 item.id가 아니라 섹션까지 포함한 refKey로 구분한다.
  const renderTagRow = (
    item: Tag,
    opts: { refKey: string; drag: VarReorderControls; index: number; isDragging: boolean },
  ) => {
    const { refKey, drag, index, isDragging } = opts;
    const active = isDesktop && selectedTag?.id === item.id;
    return (
      <VarReorderRow
        index={index}
        isDragging={isDragging}
        controls={drag}
      >
        {/* 왼→오 스와이프로 [즐겨찾기][삭제][수정] — 태그엔 고정 없음(사용자 확정). 그립(세로)과 방향으로 공존. */}
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
              onPress: () => removeTag(item),
            },
            {
              key: 'edit',
              icon: Pencil,
              label: t('tags.editTitle'),
              onPress: () => onEdit(item),
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
          {/* 행 전체가 제스처 대상: 탭=열기 / 더블탭=수정 / 꾹 눌러 세로로 끌기=재정렬(그립 없음).
              접근성은 행에 통합 — 열기(activate) + 수정(edit) + 위/아래 이동(increment/decrement). */}
          <GestureDetector gesture={drag.getGesture(item.id)}>
            <View
              style={[
                styles.row,
                active && styles.rowActive,
                isDragging && styles.rowLifted,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={item.name}
              accessibilityActions={[
                { name: 'activate' },
                { name: 'edit', label: t('tags.editTitle') },
                { name: 'increment' },
                { name: 'decrement' },
              ]}
              onAccessibilityAction={(e) => {
                switch (e.nativeEvent.actionName) {
                  case 'edit':
                    onEdit(item);
                    break;
                  case 'increment':
                    drag.moveByOne(item.id, -1);
                    break;
                  case 'decrement':
                    drag.moveByOne(item.id, 1);
                    break;
                  default:
                    openRow(refKey, item);
                }
              }}
              onAccessibilityTap={() => openRow(refKey, item)}
            >
              <View style={styles.rowMain}>
                {/* # 글리프 타일 — 태그 프로필색 배경(없으면 무채 surface). 말풍선 색은 분류의 것. */}
                <HashTile color={item.color ?? null} size={44} />
                <View style={styles.nameCol}>
                  <View style={styles.nameRow}>
                    <Text
                      variant="subheading"
                      style={styles.nameText}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    {item.favorite ? (
                      <MaterialCommunityIcons
                        name="star"
                        size={12}
                        color={colors.ink}
                        style={styles.badgeIcon}
                      />
                    ) : null}
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
      </VarReorderRow>
    );
  };

  return (
    <View style={styles.container}>
      {!embedded ? (
        <TabHeader
          title={t('tags.tabTitle')}
          subtitle={t('tags.info')}
          actions={[
            {
              key: 'add',
              icon: <Plus size={22} strokeWidth={2} color={colors.ink} />,
              label: t('tags.addTitle'),
              onPress: () => openTagCreate(() => reload()),
            },
          ]}
        />
      ) : null}

      <FlatList
        data={tagsExpanded ? tags : []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        // 드래그 중(어느 섹션이든)에는 목록 스크롤을 멈춰 손가락 이동이 재정렬에만 쓰이게 한다.
        scrollEnabled={mainDrag.draggingId === null && favDrag.draggingId === null}
        extraData={[mainDrag.draggingId, tagsExpanded]}
        // 잡은 행의 셀이 이웃 셀에 가려지지 않게(특히 Android).
        CellRendererComponent={mainDrag.CellRendererComponent}
        removeClippedSubviews={false}
        // 즐겨찾기 드래그 중엔 헤더를 본문 셀 위로 — 아래로 끌 때 본문에 가려지지 않게(분류 탭과 통일).
        ListHeaderComponentStyle={
          favDrag.draggingId !== null ? styles.headerLifted : undefined
        }
        ListHeaderComponent={
          <>
            {/* "전체" 행 — 태그 하나 이상 달린 메시지 모음(보기 전용). 분류 탭의 전체(나에게) 행을 미러.
                프로필은 # 글리프 타일(태그 전체 프로필 색 반영). 스와이프 [수정] = 전체 프로필 편집(삭제·즐겨찾기 없음). */}
            <SwipeableRow
              ref={(ref) => {
                swipeRefs.current.set('tagall', ref);
              }}
              actions={[
                {
                  key: 'edit',
                  icon: Pencil,
                  label: t('tags.editTitle'),
                  onPress: openTagAllEdit,
                },
              ]}
              onDragStateChange={(dragging) => {
                swipeDragging.current = dragging;
              }}
              onOpenChange={(open) => {
                if (open) {
                  const prev = openRowId.current;
                  if (prev && prev !== 'tagall') swipeRefs.current.get(prev)?.close();
                  openRowId.current = 'tagall';
                } else if (openRowId.current === 'tagall') {
                  openRowId.current = null;
                }
              }}
            >
              <TouchableOpacity
                style={[styles.allRow, isDesktop && tagAll && styles.allRowActive]}
                onPress={() => {
                  if (swipeDragging.current) return;
                  if (openRowId.current === 'tagall') {
                    swipeRefs.current.get('tagall')?.close();
                    return;
                  }
                  onOpenTagAll();
                }}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel={t('common.all')}
                accessibilityState={{ selected: isDesktop && tagAll }}
              >
                <HashTile color={tagAllColor ?? null} size={56} />
                <View style={styles.allInfo}>
                  <Text variant="heading">{t('common.all')}</Text>
                  <Text
                    variant="label"
                    color={colors.textSecondary}
                    style={styles.allStatus}
                  >
                    {tagAllDescription || t('friends.sendToMe')}
                  </Text>
                </View>
              </TouchableOpacity>
            </SwipeableRow>
            <View style={styles.divider} />

            {/* 즐겨찾기 섹션 — favorite=true인 태그만, favoritePosition 순. 하나도 없으면 렌더 안 함. */}
            {favorites.length > 0 ? (
              <>
                <TouchableOpacity
                  style={styles.sectionRow}
                  onPress={() => toggleSection('tags.favorites')}
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
                    {favorites.length}
                  </Text>
                </TouchableOpacity>
                {favoritesExpanded &&
                  favorites.map((f, i) => (
                    <View key={`favtag:${f.id}`}>
                      {renderTagRow(f, {
                        refKey: `favtag:${f.id}`,
                        drag: favDrag,
                        index: i,
                        isDragging: favDrag.draggingId === f.id,
                      })}
                    </View>
                  ))}
                <View style={styles.divider} />
              </>
            ) : null}

            {/* '목록' 섹션 헤더 — 전체 태그. 하나라도 있으면 렌더(분류·자동구분 본 섹션과 공통 라벨). */}
            {tags.length > 0 ? (
              <TouchableOpacity
                style={styles.sectionRow}
                onPress={() => toggleSection('tags.list')}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityState={{ expanded: tagsExpanded }}
                accessibilityLabel={t('common.listSection')}
              >
                {tagsExpanded ? (
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
                  {tags.length}
                </Text>
              </TouchableOpacity>
            ) : null}
          </>
        }
        renderItem={({ item, index }) =>
          renderTagRow(item, {
            refKey: `tag:${item.id}`,
            drag: mainDrag,
            index,
            isDragging: mainDrag.draggingId === item.id,
          })
        }
        ListEmptyComponent={
          // 접기(data=[])로도 비므로, "첫 태그" 힌트는 정말 태그가 0개일 때만.
          tags.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyBox}>
                <Text style={styles.emptyGlyph} color={colors.ink}>
                  #
                </Text>
                <Text
                  variant="label"
                  color={colors.textTertiary}
                  style={styles.emptyText}
                >
                  {t('tags.emptyHint')}
                </Text>
              </View>
            </View>
          ) : null
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
      flexGrow: 1,
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
    // 데스크톱 선택 행 — 연회색 면으로 강조(자동구분·분류 탭과 동일 문법).
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
    nameCol: {
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
    badgeIcon: {
      marginLeft: 5,
    },
    // 설명(상태메시지) 캡션 — 이름 아래 한 줄. 있는 행만 렌더되어 그 행만 2줄이 된다(분류 탭과 동일).
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
    emptyGlyph: {
      fontSize: 22,
      textAlign: 'center',
      marginBottom: 10,
    },
    emptyText: {
      textAlign: 'center',
      lineHeight: 20,
    },
  });
