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
import { GripVertical, Pencil, Pin, PinOff, Plus, Trash2 } from 'lucide-react-native';
import { api, Tag } from '../api';
import { SwipeableRow, SwipeableRowMethods } from '../components/SwipeableRow';
import { TabHeader } from '../components/TabHeader';
import { Text } from '../components/Text';
import { useSelectedRoom } from '../selected-room';
import { useTagCreate } from '../tag-create';
import { grabCursor, ReorderRow, useReorder } from '../use-reorder';
import { layout, ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { useTagCrud } from '../use-tags';

interface Props {
  token: string | null;
  /** 행 탭 → 태그 방 열기(모바일 push / 데스크톱 스플릿뷰 패널 교체). */
  onOpenTag: (tag: Tag) => void;
  onLogout: () => void;
}

// 행 높이 균일(그립 드래그 재정렬의 전제) — # 타일 44 + 세로 패딩.
const ROW_HEIGHT = 68;

// 태그 탭(채팅형) — 분류 탭과 완전히 동일한 행 문법.
// 행 = [# 글리프 타일(무채색 surface)][태그명(+고정 핀)][우측 messageCount(micro 모노)][그립].
// + 버튼 = 태그 추가(루트 상주 호스트). 왼→오 스와이프 [고정][삭제][수정](분류 탭과 동일),
// 오른쪽 그립 드래그 = 순서 변경(position 저장). 색은 분류의 것이라 태그는 색을 갖지 않는다.
export function TagsScreen({ token, onOpenTag, onLogout }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { tags, setTags, reload, removeTag } = useTagCrud(token);
  // 데스크톱 스플릿뷰 강조 + 목록 갱신 신호(bumpRooms) — 고정/수정이 보드·선택모달에 반영되게.
  const { tag: selectedTag, roomsVersion, bumpRooms } = useSelectedRoom();
  // 태그 추가·이름수정은 루트 상주 호스트 — 여기선 열기만.
  const { openTagCreate, openTagRename } = useTagCreate();
  const { width } = useWindowDimensions();
  const isDesktop = width >= layout.desktopBreakpoint;

  // 스와이프 상태(웹에서 드래그 후 탭 무시 · 한 번에 하나만 열기) — 분류 탭과 동일 관례.
  const swipeDragging = useRef(false);
  const openRowId = useRef<string | null>(null);
  const swipeRefs = useRef(new Map<string, SwipeableRowMethods | null>());

  // 그립 드래그 재정렬 — orderRef(태그 id 순서)를 목록과 동기화한다.
  const orderRef = useRef<string[]>([]);
  orderRef.current = tags.map((tg) => tg.id);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  // 확정된 순서를 낙관적으로 반영 + 서버 저장(reorderFriends와 동일 관례 — 실패 시 서버 순서로 복원).
  const commitOrder = useCallback(
    (ids: string[]) => {
      setTags((prev) => {
        const byId = new Map(prev.map((tg) => [tg.id, tg]));
        return ids.map((id) => byId.get(id)).filter((x): x is Tag => !!x);
      });
      const tk = tokenRef.current;
      if (tk) api.reorderTags(tk, ids).catch(() => reload());
    },
    [setTags, reload],
  );

  const reorder = useReorder({ rowHeight: ROW_HEIGHT, orderRef, onCommit: commitOrder });

  // 탭 진입·메시지 태그 변경(roomsVersion)마다 목록·개수 최신화.
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      reload();
    }, [token, reload, roomsVersion]),
  );

  // 고정 토글 — 낙관적으로 고정 항목을 상단으로 재배치(그룹 내 순서는 유지). 실패 시 서버로 복원.
  const togglePin = useCallback(
    async (tag: Tag) => {
      if (!token) return;
      const nextPinned = !tag.pinned;
      setTags((prev) => {
        const updated = prev.map((x) =>
          x.id === tag.id ? { ...x, pinned: nextPinned } : x,
        );
        const pinned = updated.filter((x) => x.pinned);
        const rest = updated.filter((x) => !x.pinned);
        return [...pinned, ...rest];
      });
      try {
        await api.updateTagPinned(token, tag.id, nextPinned);
        bumpRooms();
      } catch {
        reload();
      }
    },
    [token, setTags, reload, bumpRooms],
  );

  // 수정 = 이름 변경(루트 상주 모달). 성공 시 목록의 해당 태그를 최신본으로 교체.
  const onEdit = useCallback(
    (tag: Tag) => {
      openTagRename(tag, (updated) => {
        setTags((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      });
    },
    [openTagRename, setTags],
  );

  return (
    <View style={styles.container}>
      <TabHeader
        title={t('tags.tabTitle')}
        actions={[
          {
            key: 'add',
            icon: <Plus size={22} strokeWidth={2} color={colors.ink} />,
            label: t('tags.addTitle'),
            onPress: () => openTagCreate(() => reload()),
          },
        ]}
      />

      <FlatList
        data={tags}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        scrollEnabled={reorder.draggingId === null}
        extraData={reorder.draggingId}
        // 잡은 행의 셀이 이웃 셀에 가려지지 않게(특히 Android — 셀 형제 레벨에서 zIndex/elevation 필요).
        CellRendererComponent={reorder.CellRendererComponent}
        removeClippedSubviews={false}
        renderItem={({ item, index }) => {
          const active = isDesktop && selectedTag?.id === item.id;
          const isDragging = reorder.draggingId === item.id;
          return (
            <ReorderRow index={index} isDragging={isDragging} controls={reorder}>
              {/* 왼→오 스와이프로 [고정][삭제][수정](분류 탭과 동일). 그립(세로)과 방향으로 공존. */}
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
                    if (prev && prev !== item.id) swipeRefs.current.get(prev)?.close();
                    openRowId.current = item.id;
                  } else if (openRowId.current === item.id) {
                    openRowId.current = null;
                  }
                }}
              >
                <View
                  style={[
                    styles.row,
                    active && styles.rowActive,
                    isDragging && styles.rowLifted,
                  ]}
                >
                  {/* 탭 = 방 열기(열린 스와이프면 닫기) / long-press = 이름 수정 모달. */}
                  <TouchableOpacity
                    style={styles.rowMain}
                    activeOpacity={0.6}
                    onPress={() => {
                      if (swipeDragging.current) return;
                      if (openRowId.current === item.id) {
                        swipeRefs.current.get(item.id)?.close();
                        return;
                      }
                      onOpenTag(item);
                    }}
                    onLongPress={() => onEdit(item)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={item.name}
                  >
                    {/* # 글리프 타일 — 무채색 surface(색은 분류의 것). */}
                    <View style={styles.tile}>
                      <Text variant="subheading" color={colors.ink}>
                        #
                      </Text>
                    </View>
                    <View style={styles.nameWrap}>
                      <Text
                        variant="subheading"
                        style={styles.nameText}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                      {item.pinned ? (
                        <Pin
                          size={12}
                          strokeWidth={2}
                          color={colors.textTertiary}
                          style={styles.pinIcon}
                        />
                      ) : null}
                    </View>
                    <Text variant="micro" color={colors.textTertiary}>
                      {item.messageCount ?? 0}
                    </Text>
                  </TouchableOpacity>
                  {/* 그립 = 세로 드래그 재정렬(분류 탭과 동일). */}
                  <GestureDetector gesture={reorder.getGesture(item.id)}>
                    <View
                      style={[styles.dragHandle, grabCursor]}
                      accessibilityRole="adjustable"
                      accessibilityLabel={t('a11y.reorder')}
                      accessibilityActions={[
                        { name: 'increment' },
                        { name: 'decrement' },
                      ]}
                      onAccessibilityAction={(e) =>
                        reorder.moveByOne(
                          item.id,
                          e.nativeEvent.actionName === 'increment' ? -1 : 1,
                        )
                      }
                    >
                      <GripVertical size={18} strokeWidth={2} color={colors.textTertiary} />
                    </View>
                  </GestureDetector>
                </View>
              </SwipeableRow>
            </ReorderRow>
          );
        }}
        ListEmptyComponent={
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
    listContent: {
      flexGrow: 1,
      paddingTop: 4,
      paddingBottom: 20,
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
    // 무채색 # 타일(보더 없음) — 색은 분류의 것이라 태그는 색을 갖지 않는다.
    tile: {
      width: 44,
      height: 44,
      borderRadius: 0,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nameWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      marginLeft: 14,
      marginRight: 10,
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
