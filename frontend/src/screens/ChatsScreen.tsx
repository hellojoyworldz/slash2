import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError, Message, RoomsSummary } from '../api';
import { SwipeableRow, SwipeableRowMethods } from '../components/SwipeableRow';
import { formatListTime } from '../time';
import { colors, layout } from '../theme';

interface Props {
  token: string | null;
  email: string;
  onOpenChat: () => void;
  onOpenFriend: (friend: { id: string; name: string }) => void;
  onLogout: () => void;
}

interface RoomRow {
  friendId: string | null;
  name: string;
  isSelf: boolean;
  pinned: boolean;
  lastMessage: Message | null;
}

function previewText(message: Message | null): string {
  if (!message) return '첫 메시지를 보내보세요';
  if (message.kind === 'link') {
    return message.ogTitle ?? message.url ?? message.content;
  }
  return message.content;
}

// 고정된 방 먼저, 그 안에서는 가나다순
function sortFriendRooms(rooms: RoomsSummary['friends']) {
  return [...rooms].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return a.name.localeCompare(b.name, 'ko');
  });
}

export function ChatsScreen({ token, email, onOpenChat, onOpenFriend, onLogout }: Props) {
  const [rooms, setRooms] = useState<RoomsSummary | null>(null);
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
    }, [token, onLogout]),
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
    } catch {
      const summary = await api.listRooms(token).catch(() => null);
      if (summary) setRooms(summary);
    }
  };

  const myName = email.split('@')[0] || '나';

  // "나에게" 방이 항상 맨 위, 그 아래 친구 방들
  const rows: RoomRow[] = [
    {
      friendId: null,
      name: '나에게',
      isSelf: true,
      pinned: false,
      lastMessage: rooms?.self ?? null,
    },
    ...(rooms?.friends ?? []).map((friend) => ({
      friendId: friend.id,
      name: friend.name,
      isSelf: false,
      pinned: friend.pinned,
      lastMessage: friend.lastMessage,
    })),
  ];

  const renderRow = (item: RoomRow) => (
    <TouchableOpacity
      style={styles.roomRow}
      activeOpacity={0.6}
      onPress={() => {
        // 스와이프 직후의 탭은 무시 (웹에서 드래그를 놓으면 탭으로도 인식됨)
        if (dragging.current) return;
        // 고정 버튼이 열려 있는 행을 누르면 이동 대신 닫는다
        if (!item.isSelf && openRowId.current === item.friendId) {
          swipeRefs.current.get(item.friendId!)?.close();
          return;
        }
        if (item.isSelf) onOpenChat();
        else onOpenFriend({ id: item.friendId!, name: item.name });
      }}
    >
      <View style={[styles.avatar, !item.isSelf && styles.friendAvatar]}>
        <Text style={[styles.avatarText, !item.isSelf && styles.friendAvatarText]}>
          {(item.isSelf ? myName : item.name).charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.roomInfo}>
        <View style={styles.roomNameRow}>
          <Text style={styles.roomName}>{item.name}</Text>
          {item.pinned && (
            <MaterialCommunityIcons
              name="pin"
              size={12}
              color={colors.textTertiary}
              style={styles.pinIcon}
            />
          )}
        </View>
        <Text style={styles.roomPreview} numberOfLines={1}>
          {previewText(item.lastMessage)}
        </Text>
      </View>
      {item.lastMessage && (
        <Text style={styles.roomTime}>{formatListTime(item.lastMessage.createdAt)}</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>채팅</Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.friendId ?? 'self'}
        renderItem={({ item }) =>
          item.isSelf ? (
            renderRow(item)
          ) : (
            // 오른쪽으로 스와이프하면 고정/해제 버튼이 나온다
            <SwipeableRow
              ref={(ref) => {
                if (item.friendId) swipeRefs.current.set(item.friendId, ref);
              }}
              actionWidth={84}
              action={
                <TouchableOpacity
                  style={styles.pinAction}
                  activeOpacity={0.85}
                  onPress={() => {
                    swipeRefs.current.get(item.friendId!)?.close();
                    togglePin(item);
                  }}
                >
                  <MaterialCommunityIcons
                    name={item.pinned ? 'pin-off' : 'pin'}
                    size={22}
                    color={colors.inverse}
                  />
                </TouchableOpacity>
              }
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
              {renderRow(item)}
            </SwipeableRow>
          )
        }
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: layout.statusBarPad + 4,
    paddingBottom: 14,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: colors.textPrimary,
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
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 19,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.inverse,
  },
  friendAvatar: {
    backgroundColor: colors.surface,
  },
  friendAvatarText: {
    color: colors.ink,
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
  roomName: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  pinIcon: {
    marginLeft: 5,
  },
  roomPreview: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 3,
  },
  roomTime: {
    fontSize: 11,
    color: colors.textTertiary,
    alignSelf: 'flex-start',
    marginTop: 5,
  },
  pinAction: {
    flex: 1,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
