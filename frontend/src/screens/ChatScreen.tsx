import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { api, ApiError, Friend, Message } from '../api';
import { MessageBubble } from '../components/MessageBubble';
import { formatDateStamp, isSameDay } from '../time';
import { colors, layout } from '../theme';

interface Props {
  token: string | null;
  email: string;
  /** null이면 "나에게" 방, 값이 있으면 해당 친구(카테고리) 방 */
  friendId: string | null;
  friendName: string | null;
  onBack: () => void;
  onLogout: () => void;
}

export function ChatScreen({
  token,
  email,
  friendId,
  friendName,
  onBack,
  onLogout,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [friends, setFriends] = useState<Friend[]>([]);
  // ⋮ 버튼이나 길게 누르기로 고른 메시지 (바텀시트의 대상)
  const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const activeQuery = useRef('');
  const sheetRef = useRef<BottomSheetModal>(null);

  const openMenu = (message: Message) => {
    setActionMessage(message);
    sheetRef.current?.present();
  };

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.4}
        pressBehavior="close"
      />
    ),
    [],
  );

  const load = useCallback(
    async (query: string) => {
      // 로그인 없이 URL로 들어온 경우(디자인 미리보기)는 조회를 건너뛴다.
      if (!token) {
        setLoading(false);
        return;
      }
      setLoading(true);
      activeQuery.current = query;
      try {
        const page = await api.listMessages(token, {
          q: query || undefined,
          friendId: friendId ?? undefined,
        });
        // 응답이 도착했을 때 검색어가 이미 바뀌었으면 버린다.
        if (activeQuery.current !== query) return;
        setMessages(page.items);
        setHasMore(page.hasMore);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          onLogout();
          return;
        }
        Alert.alert('알림', '메시지를 불러오지 못했습니다. 서버가 켜져 있는지 확인해주세요.');
      } finally {
        setLoading(false);
      }
    },
    [token, friendId, onLogout],
  );

  useEffect(() => {
    load('');
  }, [load]);

  // 분류 시트와 친구 이름 태그에 쓸 친구 목록
  useEffect(() => {
    if (!token) return;
    api
      .listFriends(token)
      .then(setFriends)
      .catch(() => {});
  }, [token]);

  // 검색어 입력 시 디바운스로 재조회
  useEffect(() => {
    const timer = setTimeout(() => {
      load(searchOpen ? searchText.trim() : '');
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText, searchOpen, load]);

  const loadOlder = async () => {
    if (!token || !hasMore || loading || messages.length === 0) return;
    const oldest = messages[messages.length - 1];
    try {
      const page = await api.listMessages(token, {
        q: activeQuery.current || undefined,
        before: oldest.id,
        friendId: friendId ?? undefined,
      });
      setMessages((prev) => [...prev, ...page.items]);
      setHasMore(page.hasMore);
    } catch {
      // 스크롤 페이지네이션 실패는 조용히 무시 (다시 스크롤하면 재시도됨)
    }
  };

  const send = async () => {
    const content = input.trim();
    if (!content || sending) return;
    if (!token) {
      Alert.alert('알림', '로그인 후 메시지를 보낼 수 있어요.');
      return;
    }
    setSending(true);
    setInput('');
    try {
      const message = await api.createMessage(token, content, friendId ?? undefined);
      setMessages((prev) => [message, ...prev]);
    } catch (error) {
      setInput(content);
      Alert.alert(
        '전송 실패',
        error instanceof Error ? error.message : '잠시 후 다시 시도해주세요.',
      );
    } finally {
      setSending(false);
    }
  };

  // 메시지를 friendId(null=분류 해제)로 분류하고 목록을 갱신한다.
  const assignFriend = async (message: Message, newFriendId: string | null) => {
    if (!token) return;
    sheetRef.current?.dismiss();
    try {
      const updated = await api.updateMessageFriend(token, message.id, newFriendId);
      setMessages((prev) => {
        // 친구 방에서 다른 곳으로 분류하면 그 방 목록에서는 빠진다.
        if (friendId && updated.friendId !== friendId) {
          return prev.filter((m) => m.id !== message.id);
        }
        return prev.map((m) => (m.id === message.id ? updated : m));
      });
    } catch {
      // 실패 시 목록이 그대로라 사용자가 다시 시도할 수 있다.
    }
  };

  const performDelete = async (message: Message) => {
    if (!token) return;
    try {
      await api.deleteMessage(token, message.id);
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
    } catch {
      // 실패 시 목록 유지
    }
  };

  const confirmDelete = (message: Message) => {
    if (!token) return;
    sheetRef.current?.dismiss();
    // Alert.alert는 웹에서 동작하지 않아서 웹은 confirm으로 대체한다.
    if (Platform.OS === 'web') {
      if (window.confirm('이 메시지를 삭제할까요?')) void performDelete(message);
      return;
    }
    Alert.alert('삭제', '이 메시지를 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => void performDelete(message) },
    ]);
  };

  const friendNameById = new Map(friends.map((f) => [f.id, f.name]));

  const canSend = !!input.trim() && !sending;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialCommunityIcons name="chevron-left" size={30} color={colors.ink} />
        </TouchableOpacity>
        {searchOpen ? (
          <TextInput
            style={styles.searchInput}
            placeholder="메시지·링크 검색"
            placeholderTextColor={colors.textTertiary}
            value={searchText}
            onChangeText={setSearchText}
            autoFocus
          />
        ) : (
          <View style={styles.headerTitleBlock}>
            <Text style={styles.headerTitle}>{friendName ?? '나에게'}</Text>
            <Text style={styles.headerSubtitle}>
              {friendName ? '친구' : email || '미리보기 모드'}
            </Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.headerAction}
          onPress={() => {
            if (searchOpen) setSearchText('');
            setSearchOpen(!searchOpen);
          }}
          hitSlop={{ top: 8, bottom: 8 }}
        >
          <Text style={styles.headerActionText}>{searchOpen ? '취소' : '검색'}</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {loading && messages.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.ink} />
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>
              {activeQuery.current
                ? '검색 결과가 없습니다'
                : `${friendName ?? '나'}에게 첫 링크를 보내보세요!\n붙여넣기만 하면 미리보기가 만들어져요.`}
            </Text>
          </View>
        ) : (
          <FlatList
            data={messages}
            inverted
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => {
              // 날짜가 바뀌는 첫 메시지 위에만 날짜 구분선을 띄운다
              // (inverted 목록이라 다음 인덱스가 더 오래된 메시지)
              const older = messages[index + 1];
              const showDateStamp =
                !older ||
                !isSameDay(new Date(item.createdAt), new Date(older.createdAt));
              return (
                <View>
                  {showDateStamp && (
                    <View style={styles.dateStampRow}>
                      <Text style={styles.dateStampText}>
                        {formatDateStamp(item.createdAt)}
                      </Text>
                    </View>
                  )}
                  <MessageBubble
                    message={item}
                    friendLabel={
                      !friendId && item.friendId
                        ? friendNameById.get(item.friendId)
                        : null
                    }
                    onLongPress={(message) => {
                      if (token) openMenu(message);
                    }}
                    onPressMenu={token ? openMenu : undefined}
                  />
                </View>
              );
            }}
            onEndReached={loadOlder}
            onEndReachedThreshold={0.4}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
          />
        )}

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="링크나 메모를 입력하세요"
            placeholderTextColor={colors.textTertiary}
            value={input}
            onChangeText={setInput}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, !canSend && styles.sendDisabled]}
            onPress={send}
            disabled={!canSend}
            activeOpacity={0.85}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.inverse} />
            ) : (
              <MaterialCommunityIcons
                name="arrow-up"
                size={20}
                color={canSend ? colors.inverse : colors.textTertiary}
              />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* 메시지 분류/삭제 바텀시트 — 아래로 끌어내려 닫을 수 있다 */}
      <BottomSheetModal
        ref={sheetRef}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        onDismiss={() => setActionMessage(null)}
        handleIndicatorStyle={styles.sheetHandle}
        backgroundStyle={styles.sheetBackground}
      >
        <BottomSheetView style={styles.sheet}>
            <Text style={styles.sheetTitle}>친구 변경</Text>
            {friends.length === 0 ? (
              <Text style={styles.sheetHint}>
                친구 탭에서 먼저 친구를 추가해보세요
              </Text>
            ) : (
              friends.map((friend) => {
                const selected = actionMessage?.friendId === friend.id;
                return (
                  <TouchableOpacity
                    key={friend.id}
                    style={styles.sheetRow}
                    onPress={() =>
                      actionMessage && assignFriend(actionMessage, friend.id)
                    }
                  >
                    <View style={styles.sheetAvatar}>
                      <Text style={styles.sheetAvatarText}>
                        {friend.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.sheetRowText}>{friend.name}</Text>
                    {selected && <Text style={styles.sheetCheck}>✓</Text>}
                  </TouchableOpacity>
                );
              })
            )}
            {actionMessage?.friendId ? (
              <TouchableOpacity
                style={styles.sheetRow}
                onPress={() => actionMessage && assignFriend(actionMessage, null)}
              >
                <Text style={styles.sheetUnassign}>분류 해제</Text>
              </TouchableOpacity>
            ) : null}
            <View style={styles.sheetDivider} />
            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => actionMessage && confirmDelete(actionMessage)}
            >
              <Text style={styles.sheetDelete}>삭제</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => sheetRef.current?.dismiss()}
            >
              <Text style={styles.sheetCancel}>취소</Text>
            </TouchableOpacity>
        </BottomSheetView>
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: layout.statusBarPad,
    paddingBottom: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  backButton: {
    paddingHorizontal: 6,
    marginRight: 4,
  },
  headerTitleBlock: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 1,
  },
  headerAction: {
    paddingHorizontal: 6,
  },
  headerActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 15,
    marginRight: 10,
    color: colors.textPrimary,
  },
  body: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
  },
  listContent: {
    paddingVertical: 14,
  },
  dateStampRow: {
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 8,
  },
  dateStampText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: layout.bottomPad,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 20,
    fontSize: 15,
    maxHeight: 110,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    color: colors.textPrimary,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    marginBottom: 1,
  },
  sendDisabled: {
    backgroundColor: colors.surface,
  },
  sheetBackground: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  sheetHandle: {
    backgroundColor: colors.hairline,
    width: 40,
  },
  sheet: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  sheetTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  sheetHint: {
    fontSize: 13,
    color: colors.textTertiary,
    paddingVertical: 12,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
  },
  sheetAvatar: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sheetAvatarText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  sheetRowText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  sheetCheck: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  sheetUnassign: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  sheetDivider: {
    height: 1,
    backgroundColor: colors.hairline,
    marginVertical: 6,
  },
  sheetDelete: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  sheetCancel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textTertiary,
  },
});
