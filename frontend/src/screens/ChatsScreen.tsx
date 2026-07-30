import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  StyleSheet,
  Pressable,
  useWindowDimensions,
  View,
} from 'react-native';
import { TFunction } from 'i18next';
import { Pencil, Pin, PinOff, Plus, Trash2 } from 'lucide-react-native';
import { api, ApiError, Message, RoomsSummary } from '../api';
import { useAuth } from '../auth';
import { useCategoryEdit } from '../category-edit';
import { CategoryAvatar } from '../components/CategoryAvatar';
import {
  buildSwipeActionsA11y,
  SwipeableRow,
  SwipeableRowMethods,
  SwipeAction,
  SwipeActionsA11y,
} from '../components/SwipeableRow';
import { TabHeader } from '../components/TabHeader';
import { Text } from '../components/Text';
import { confirmDialog } from '../notify';
import { useSelectedRoom } from '../selected-room';
import { formatListTime } from '../time';
import { layout, SELF_DEFAULT_COLOR, ThemeColors } from '../theme';
import { useTheme } from '../theme-context';

interface Props {
  token: string | null;
  onOpenChat: () => void;
  onOpenFriend: (friend: { id: string; name: string }) => void;
  onLogout: () => void;
}

interface RoomRow {
  friendId: string | null;
  name: string;
  color?: string | null;
  description?: string | null;
  isSelf: boolean;
  pinned: boolean;
  lastMessage: Message | null;
}

function previewText(message: Message | null, t: TFunction): string {
  if (!message) return t('chats.firstMessage');
  if (message.kind === 'link') {
    return message.ogTitle ?? message.url ?? message.content;
  }
  return message.content;
}

// 메신저 정렬(서버와 동일 규칙): 고정 먼저 → 마지막 메시지 최신순 → 가나다순
function sortFriendRooms(rooms: RoomsSummary['friends']) {
  return [...rooms].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const at = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const bt = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
    if (at !== bt) return bt - at;
    return a.name.localeCompare(b.name, 'ko');
  });
}

export function ChatsScreen({
  token,
  onOpenChat,
  onOpenFriend,
  onLogout,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { selfColor } = useAuth();
  // 분류 추가·수정 편집기(루트 상주) — 헤더 +버튼·행 스와이프 수정에서 연다.
  // open = 스와이프/롱프레스 [수정](색 프로필 폼), openManage = 헤더 + 분류 추가(픽커 관리 모드).
  const { open: openCategoryEditor } = useCategoryEdit();
  const [rooms, setRooms] = useState<RoomsSummary | null>(null);
  // 상주 대화 패널에서 전송/삭제/분류가 일어나면 목록도 갱신 (데스크톱 스플릿뷰)
  // room: 현재 선택된 방 — 데스크톱에서 active 행 하이라이트에 쓴다.
  const { roomsVersion, room, setRoom, bumpRooms } = useSelectedRoom();
  // 데스크톱(스플릿뷰)에서만 선택 방을 강조한다. 모바일은 목록·대화가 동시에 안 보여 무의미.
  const { width } = useWindowDimensions();
  const isDesktop = width >= layout.desktopBreakpoint;
  // 웹에서는 스와이프가 탭을 취소해주지 않아서 직접 구분한다.
  const dragging = useRef(false);
  const openRowId = useRef<string | null>(null);
  const swipeRefs = useRef(new Map<string, SwipeableRowMethods | null>());

  // 탭에 들어올 때마다 방 목록 갱신
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let cancelled = false;
      (async () => {
        try {
          const summary = await api.listRooms(token);
          if (!cancelled) setRooms(summary);
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) onLogout();
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [token, onLogout, roomsVersion]),
  );

  const togglePin = async (row: RoomRow) => {
    if (!token || !row.friendId) return;
    const nextPinned = !row.pinned;
    // 낙관적 갱신: 바로 정렬을 바꾸고, 실패하면 서버 상태로 되돌린다.
    setRooms((prev) =>
      prev
        ? {
            ...prev,
            friends: sortFriendRooms(
              prev.friends.map((f) =>
                f.id === row.friendId ? { ...f, pinned: nextPinned } : f,
              ),
            ),
          }
        : prev,
    );
    try {
      await api.updateFriendPinned(token, row.friendId, nextPinned);
      // 분류 탭 핀 표시도 함께 갱신되도록 신호.
      bumpRooms();
    } catch {
      const summary = await api.listRooms(token).catch(() => null);
      if (summary) setRooms(summary);
    }
  };

  // 분류 삭제(destructive) — confirmDialog 확인 후.
  const confirmDeleteRoom = async (row: RoomRow) => {
    if (!token || !row.friendId) return;
    const friendId = row.friendId;
    const ok = await confirmDialog({
      title: t('common.delete'),
      message: t('friends.confirmDelete', { name: row.name }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.deleteFriend(token, friendId);
      setRooms((prev) =>
        prev
          ? { ...prev, friends: prev.friends.filter((f) => f.id !== friendId) }
          : prev,
      );
      bumpRooms();
      // 데스크톱 상주 대화가 방금 지운 분류면 "전체"로 되돌린다.
      if (room?.friendId === friendId) setRoom(null);
    } catch {
      const summary = await api.listRooms(token).catch(() => null);
      if (summary) setRooms(summary);
    }
  };

  const editRoom = (row: RoomRow) => {
    if (!row.friendId) return;
    openCategoryEditor({
      id: row.friendId,
      name: row.name,
      color: row.color,
      description: row.description,
    });
  };

  // "나에게" 방이 항상 맨 위, 그 아래 친구 방들
  const rows: RoomRow[] = [
    {
      friendId: null,
      name: t('chats.myRoom'),
      isSelf: true,
      pinned: false,
      lastMessage: rooms?.self ?? null,
    },
    ...(rooms?.friends ?? []).map((friend) => ({
      friendId: friend.id,
      name: friend.name,
      color: friend.color,
      description: friend.description,
      isSelf: false,
      pinned: friend.pinned,
      lastMessage: friend.lastMessage,
    })),
  ];

  // a11y: 스와이프 액션은 포인터 제스처라 스크린리더에 안 보인다. 스와이프 행은 액션을 접근성
  // 커스텀 액션으로 행 터처블에 얹어(a11y 인자) 로터/액션 메뉴로 [고정][삭제][수정]을 실행하게 한다.
  const renderRow = (item: RoomRow, selected: boolean, a11y?: SwipeActionsA11y) => (
    <Pressable
      style={({ pressed, hovered }) => [
        styles.roomRow,
        (selected || pressed || hovered) && styles.roomRowActive,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityActions={a11y?.accessibilityActions}
      onAccessibilityAction={a11y?.onAccessibilityAction}
      onPress={() => {
        // 스와이프 직후의 탭은 무시 (웹에서 드래그를 놓으면 탭으로도 인식됨)
        if (dragging.current) return;
        // 액션이 열려 있는 행을 누르면 이동 대신 닫는다
        if (!item.isSelf && openRowId.current === item.friendId) {
          swipeRefs.current.get(item.friendId!)?.close();
          return;
        }
        if (item.isSelf) onOpenChat();
        else onOpenFriend({ id: item.friendId!, name: item.name });
      }}
    >
      {/* 전체 방 아바타도 분류처럼 CategoryAvatar(전체 프로필 색). null이면 기본 검정. */}
      <CategoryAvatar
        color={item.isSelf ? selfColor ?? SELF_DEFAULT_COLOR : item.color}
        size={50}
      />
      <View style={styles.roomInfo}>
        <View style={styles.roomNameRow}>
          <Text variant="subheading">{item.name}</Text>
          {item.pinned && (
            <MaterialCommunityIcons
              name="pin"
              size={12}
              color={colors.textTertiary}
              style={styles.pinIcon}
            />
          )}
        </View>
        <Text
          variant="label"
          color={colors.textSecondary}
          style={styles.roomPreview}
          numberOfLines={1}
        >
          {previewText(item.lastMessage, t)}
        </Text>
      </View>
      {item.lastMessage && (
        <Text variant="micro" color={colors.textTertiary} style={styles.roomTime}>
          {formatListTime(item.lastMessage.createdAt)}
        </Text>
      )}
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <TabHeader
        title={t('chats.title')}
        subtitle={t('chats.info')}
        actions={[
          {
            key: 'add',
            icon: <Plus size={22} strokeWidth={2} color={colors.ink} />,
            label: t('friends.add'),
            // + = 분류 추가 폼 바로(목록 모달 경유 없음 — 사용자 확정).
            onPress: () => openCategoryEditor(),
          },
        ]}
      />

      <FlatList
        data={rows}
        keyExtractor={(item) => item.friendId ?? 'self'}
        renderItem={({ item }) => {
          // 선택 표시(데스크톱만): 분류 방은 friendId 일치, 전체 방은 room===null.
          const selected =
            isDesktop &&
            (item.isSelf ? room === null : room?.friendId === item.friendId);
          if (item.isSelf) return renderRow(item, selected);
          // 왼→오 스와이프로 [고정][삭제][수정] 액션이 드러난다.
          const actions: SwipeAction[] = [
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
              onPress: () => confirmDeleteRoom(item),
            },
            {
              key: 'edit',
              icon: Pencil,
              label: t('friends.editTitle'),
              onPress: () => editRoom(item),
            },
          ];
          return (
            <SwipeableRow
              ref={(ref) => {
                if (item.friendId) swipeRefs.current.set(item.friendId, ref);
              }}
              actions={actions}
              onDragStateChange={(isDragging) => {
                dragging.current = isDragging;
              }}
              onOpenChange={(open) => {
                if (open) {
                  // 다른 행이 열려 있으면 닫는다 (한 번에 하나만)
                  const prev = openRowId.current;
                  if (prev && prev !== item.friendId) {
                    swipeRefs.current.get(prev)?.close();
                  }
                  openRowId.current = item.friendId;
                } else if (openRowId.current === item.friendId) {
                  openRowId.current = null;
                }
              }}
            >
              {/* 스크린리더 대안: 스와이프 액션을 행 터처블의 접근성 커스텀 액션으로 노출. */}
              {renderRow(item, selected, buildSwipeActionsA11y(actions))}
            </SwipeableRow>
          );
        }}
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
    paddingBottom: 20,
  },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.background,
  },
  // 데스크톱 스플릿뷰에서 현재 선택된 방 — 연회색 면으로 강조(불투명이라 스와이프 액션도 안 비친다).
  roomRowActive: {
    backgroundColor: colors.surface,
  },
  roomInfo: {
    flex: 1,
    marginLeft: 14,
    marginRight: 10,
  },
  roomNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pinIcon: {
    marginLeft: 5,
  },
  roomPreview: {
    marginTop: 3,
  },
  roomTime: {
    alignSelf: 'flex-start',
    marginTop: 5,
  },
});
