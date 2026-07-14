import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { api, ApiError, Friend, Message } from '../api';
import { confirmDialog, notify } from '../notify';
import { MessageBubble } from '../components/MessageBubble';
import { Text } from '../components/Text';
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
  const { t } = useTranslation();
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
        notify(t('common.notice'), t('chat.loadFailed'));
      } finally {
        setLoading(false);
      }
    },
    [token, friendId, onLogout, t],
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
      notify(t('common.notice'), t('chat.loginToSend'));
      return;
    }
    setSending(true);
    setInput('');
    try {
      const message = await api.createMessage(token, content, friendId ?? undefined);
      setMessages((prev) => [message, ...prev]);
    } catch {
      setInput(content);
      notify(t('chat.sendFailedTitle'), t('chat.tryAgainLater'));
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

  const confirmDelete = async (message: Message) => {
    if (!token) return;
    sheetRef.current?.dismiss();
    const ok = await confirmDialog({
      title: t('common.delete'),
      message: t('chat.confirmDelete'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (ok) void performDelete(message);
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
          accessibilityRole="button"
          accessibilityLabel={t('a11y.back')}
        >
          <MaterialCommunityIcons name="chevron-left" size={30} color={colors.ink} />
        </TouchableOpacity>
        {searchOpen ? (
          <TextInput
            style={styles.searchInput}
            placeholder={t('chat.searchPlaceholder')}
            placeholderTextColor={colors.textTertiary}
            value={searchText}
            onChangeText={setSearchText}
            autoFocus
          />
        ) : (
          <View style={styles.headerTitleBlock}>
            <Text variant="heading">{friendName ?? t('chat.myRoom')}</Text>
            <Text variant="micro" color={colors.textTertiary} style={styles.headerSubtitle}>
              {friendName ? t('chat.friend') : email || t('chat.previewMode')}
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
          accessibilityRole="button"
        >
          <Text variant="label" color={colors.ink}>
            {searchOpen ? t('common.cancel') : t('chat.search')}
          </Text>
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
            <Text variant="body" color={colors.textSecondary} style={styles.emptyText}>
              {activeQuery.current
                ? t('chat.noResults')
                : t('chat.emptyFirstLink', { name: friendName ?? t('common.me') })}
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
                      <Text
                        variant="micro"
                        color={colors.textSecondary}
                        style={styles.dateStampText}
                      >
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
            placeholder={t('chat.inputPlaceholder')}
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
            accessibilityRole="button"
            accessibilityLabel={t('a11y.send')}
            accessibilityState={{ disabled: !canSend }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
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
            <Text
              variant="label"
              color={colors.textSecondary}
              style={styles.sheetTitle}
            >
              {t('chat.changeFriend')}
            </Text>
            {friends.length === 0 ? (
              <Text
                variant="label"
                color={colors.textTertiary}
                style={styles.sheetHint}
              >
                {t('chat.addFriendFirst')}
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
                    accessibilityRole="button"
                  >
                    <View style={styles.sheetAvatar}>
                      <Text variant="label" color={colors.ink}>
                        {friend.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text variant="bodyStrong" style={styles.sheetRowText}>
                      {friend.name}
                    </Text>
                    {selected && (
                      <Text variant="bodyStrong" color={colors.ink}>
                        ✓
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
            {actionMessage?.friendId ? (
              <TouchableOpacity
                style={styles.sheetRow}
                onPress={() => actionMessage && assignFriend(actionMessage, null)}
                accessibilityRole="button"
              >
                <Text variant="bodyStrong" color={colors.textSecondary}>
                  {t('chat.unassign')}
                </Text>
              </TouchableOpacity>
            ) : null}
            <View style={styles.sheetDivider} />
            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => actionMessage && confirmDelete(actionMessage)}
              accessibilityRole="button"
            >
              <Text variant="bodyStrong" color={colors.ink}>
                {t('common.delete')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => sheetRef.current?.dismiss()}
              accessibilityRole="button"
            >
              <Text variant="bodyStrong" color={colors.textTertiary}>
                {t('common.cancel')}
              </Text>
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
  headerSubtitle: {
    marginTop: 1,
  },
  headerAction: {
    paddingHorizontal: 6,
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
    marginBottom: 6,
  },
  sheetHint: {
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
  sheetRowText: {
    flex: 1,
  },
  sheetDivider: {
    height: 1,
    backgroundColor: colors.hairline,
    marginVertical: 6,
  },
});
