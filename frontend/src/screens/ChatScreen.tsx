import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Pencil, Search, X } from 'lucide-react-native';
import { api, ApiError, Friend, Message } from '../api';
import { useAuth } from '../auth';
import { useCategoryEdit } from '../category-edit';
import { confirmDialog, notify } from '../notify';
import { CategoryAvatar } from '../components/CategoryAvatar';
import { MessageBubble } from '../components/MessageBubble';
import { Text } from '../components/Text';
import { useSelectedRoom } from '../selected-room';
import { formatDateStamp, isSameDay } from '../time';
import { layout, ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { useDesktopClassInput } from '../use-desktop-input';

interface Props {
  token: string | null;
  /** null이면 "나에게" 방, 값이 있으면 해당 친구(카테고리) 방 */
  friendId: string | null;
  friendName: string | null;
  onBack: () => void;
  onLogout: () => void;
  /** 데스크톱 상주 패널에서 "나에게" 방일 땐 뒤로갈 곳이 없어 숨긴다 */
  showBack?: boolean;
}

export function ChatScreen({
  token,
  friendId,
  friendName,
  onBack,
  onLogout,
  showBack = true,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // 전송·삭제·분류 성공 시 채팅 목록 갱신 + 900px 교차용 draft 저장/복원.
  // roomsVersion은 분류 프로필(색) 편집 신호 — 열린 대화의 말풍선 색을 갱신하는 데 쓴다.
  const { bumpRooms, roomsVersion, saveChatDraft, readChatDraft } = useSelectedRoom();
  // 분류/전체 프로필 편집기(루트 상주) — 헤더 펜 아이콘에서 연다.
  const { open: openCategoryEditor } = useCategoryEdit();
  // "전체" 방(미분류) 말풍선 색 + self 편집 프리필에 쓰는 전체 프로필 색.
  const { selfColor } = useAuth();
  // 방 구분 키. 저장된 draft가 이 값과 일치할 때만 복원한다(다른 방이면 빈 상태).
  const roomKey = friendId ?? 'self';
  // 마운트 시 1회: 같은 방의 draft가 있으면 검색·입력 상태를 그걸로 시작한다.
  const [initialDraft] = useState(() => readChatDraft(roomKey));
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [input, setInput] = useState(initialDraft?.input ?? '');
  // 입력창 높이: 한 줄 40에서 시작해 개행되면 내용만큼 자란다 (최대 120).
  // 네이티브는 multiline이 알아서 자라지만 웹(textarea)은 안 자라서 직접 잰다.
  const [inputHeight, setInputHeight] = useState(initialDraft?.inputHeight ?? 40);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(initialDraft?.searchOpen ?? false);
  const [searchText, setSearchText] = useState(initialDraft?.searchText ?? '');
  const [friends, setFriends] = useState<Friend[]>([]);
  // ⋮ 버튼이나 길게 누르기로 고른 메시지 (바텀시트의 대상)
  const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const activeQuery = useRef('');
  // 첫 로드 여부: 첫 조회는 디바운스 없이 즉시(복원된 검색어로) 실행하기 위한 플래그
  const firstLoadRef = useRef(true);
  const sheetRef = useRef<BottomSheetModal>(null);
  // 물리 키보드 기기(데스크톱급)에서만 Enter=전송, Shift+Enter=줄바꿈
  const desktopInput = useDesktopClassInput();
  const inputRef = useRef<TextInput>(null);
  const sendRef = useRef<() => void>(() => {});

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

  // 분류 시트와 친구 이름 태그·말풍선 색에 쓸 친구 목록.
  // roomsVersion을 의존성에 넣어, 분류 프로필(색)이 바뀌면 열린 대화의 말풍선도 갱신된다.
  useEffect(() => {
    if (!token) return;
    api
      .listFriends(token)
      .then(setFriends)
      .catch(() => {});
  }, [token, roomsVersion]);

  // 첫 로드는 즉시 실행하되 "현재 검색어"로 조회한다.
  // 복원된 검색어(searchOpen+searchText)가 있으면 그 결과가 바로 보이고,
  // 없으면 전체 목록을 연다. 이후 검색어 변경은 300ms 디바운스로 재조회.
  useEffect(() => {
    const query = searchOpen ? searchText.trim() : '';
    if (firstLoadRef.current) {
      firstLoadRef.current = false;
      load(query);
      return;
    }
    const timer = setTimeout(() => load(query), 300);
    return () => clearTimeout(timer);
  }, [searchText, searchOpen, load]);

  // 검색·입력 상태를 루트 store에 계속 반영해 둔다(900px 트리 스왑에도 살아남게).
  useEffect(() => {
    saveChatDraft({ roomKey, searchOpen, searchText, input, inputHeight });
  }, [saveChatDraft, roomKey, searchOpen, searchText, input, inputHeight]);

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
    setInputHeight(40); // 비웠으니 한 줄 높이로 복귀
    try {
      const message = await api.createMessage(token, content, friendId ?? undefined);
      setMessages((prev) => [message, ...prev]);
      bumpRooms();
    } catch {
      setInput(content);
      notify(t('chat.sendFailedTitle'), t('chat.tryAgainLater'));
    } finally {
      setSending(false);
    }
  };
  // keydown 핸들러가 항상 최신 send를 부르도록 ref로 연결
  sendRef.current = send;

  // 데스크톱급(웹+물리키보드)에서만: Enter=전송, Shift+Enter=줄바꿈.
  // RNW의 TextInput ref는 실제 textarea DOM이라 keydown을 직접 단다.
  // 한글 IME 조합 중 Enter(isComposing/229)는 무시 — 마지막 글자 잘림/이중전송 방지.
  useEffect(() => {
    if (!desktopInput) return;
    const el = inputRef.current as unknown as HTMLTextAreaElement | null;
    if (!el || typeof el.addEventListener !== 'function') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      if (e.isComposing || e.keyCode === 229) return; // 한글 조합 중
      e.preventDefault(); // 줄바꿈 삽입 방지 (빈 입력이어도)
      sendRef.current();
    };
    el.addEventListener('keydown', onKeyDown);
    return () => el.removeEventListener('keydown', onKeyDown);
  }, [desktopInput]);

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
      bumpRooms();
    } catch {
      // 실패 시 목록이 그대로라 사용자가 다시 시도할 수 있다.
    }
  };

  const performDelete = async (message: Message) => {
    if (!token) return;
    try {
      await api.deleteMessage(token, message.id);
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
      bumpRooms();
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
  // 메시지별 말풍선 색: 그 메시지가 속한 분류의 color.
  // 분류 방에서는 모든 메시지가 이 방 분류라 한 색으로 통일되고,
  // 전체 방에서는 메시지마다 자기 분류 색(미분류·색 없는 분류는 null → 기본 회색).
  const friendColorById = new Map(friends.map((f) => [f.id, f.color ?? null]));

  // 헤더에 쓸 현재 분류(분류 방일 때만). 목록에서 찾은 이름을 우선 써서,
  // /chat 라우트 params.name이나 데스크톱 room.name이 rename 후 stale해도 최신 이름이 보인다.
  const currentFriend = friendId
    ? friends.find((f) => f.id === friendId) ?? null
    : null;
  const roomName = currentFriend?.name ?? friendName;

  const canSend = !!input.trim() && !sending;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {showBack && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.back')}
          >
            <MaterialCommunityIcons name="chevron-left" size={30} color={colors.ink} />
          </TouchableOpacity>
        )}
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
            <Text variant="heading" numberOfLines={1} style={styles.headerTitleText}>
              {roomName ?? t('chat.myRoom')}
            </Text>
            {/* 펜(프로필 수정): 전체 방(friendId=null) → 전체 프로필, 분류 방 → 그 분류. */}
            {friendId === null ? (
              <TouchableOpacity
                style={styles.headerEdit}
                onPress={() => openCategoryEditor({ self: true })}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={t('friends.profileLabel')}
              >
                <Pencil size={16} strokeWidth={2} color={colors.textSecondary} />
              </TouchableOpacity>
            ) : currentFriend ? (
              <TouchableOpacity
                style={styles.headerEdit}
                onPress={() => openCategoryEditor(currentFriend)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={t('friends.editTitle')}
              >
                <Pencil size={16} strokeWidth={2} color={colors.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>
        )}
        <TouchableOpacity
          style={styles.headerAction}
          onPress={() => {
            if (searchOpen) setSearchText('');
            setSearchOpen(!searchOpen);
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={searchOpen ? t('common.cancel') : t('chat.search')}
        >
          {searchOpen ? (
            <X size={22} strokeWidth={2} color={colors.ink} />
          ) : (
            <Search size={22} strokeWidth={2} color={colors.ink} />
          )}
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
            <View style={styles.emptyBox}>
              <Text style={{ fontSize: 22, textAlign: 'center', marginBottom: 10 }} color={colors.ink}>✳</Text>
              <Text variant="body" color={colors.textSecondary} style={styles.emptyText}>
                {activeQuery.current
                  ? t('chat.noResults')
                  : t('chat.emptyFirstLink', { name: roomName ?? t('common.me') })}
              </Text>
            </View>
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
                        color={colors.textTertiary}
                        style={styles.dateStampText}
                      >
                        {'─── '}{formatDateStamp(item.createdAt)}{' ───'}
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
                    bubbleColor={
                      item.friendId
                        ? friendColorById.get(item.friendId) ?? null
                        : selfColor ?? null
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
            ref={inputRef}
            style={[
              styles.input,
              // 웹 textarea는 자동으로 안 자라서 잰 높이를 직접 준다
              Platform.OS === 'web' && { height: inputHeight },
            ]}
            placeholder={
              desktopInput
                ? t('chat.inputPlaceholderDesktop')
                : t('chat.inputPlaceholder')
            }
            placeholderTextColor={colors.textTertiary}
            value={input}
            onChangeText={setInput}
            onContentSizeChange={(e) => {
              const h = Math.ceil(e.nativeEvent.contentSize.height);
              setInputHeight(Math.min(120, Math.max(40, h)));
            }}
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
                color={canSend ? colors.onAccent : colors.textTertiary}
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
                    <CategoryAvatar
                      color={friend.color}
                      size={32}
                      style={styles.sheetAvatar}
                    />
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

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // 헤더 높이는 어떤 조합(뒤로가기·펜·검색 유무)에서도 동일해야 한다 —
  // 조건부 back chevron(30)이나 검색 입력(~40)이 최고 높이 요소라 있고 없고에 따라
  // 헤더가 줄었다 늘었다 하던 문제를, 콘텐츠 슬롯이 최고 요소를 담을 minHeight로 고정해 없앤다.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: layout.statusBarPad + 54,
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
    flexDirection: 'row',
    alignItems: 'center',
  },
  // 이름은 줄여서(numberOfLines) 펜 아이콘 자리를 늘 남긴다.
  headerTitleText: {
    flexShrink: 1,
  },
  headerEdit: {
    marginLeft: 8,
    paddingVertical: 2,
  },
  headerAction: {
    paddingHorizontal: 6,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: colors.border,
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
  dateStampText: {},
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: layout.bottomPad,
  },
  // 한 줄일 때 전송 버튼과 같은 40 높이, 개행되면 최대 120까지 자란다.
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 15,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 11 : 9,
    paddingBottom: Platform.OS === 'ios' ? 11 : 9,
    color: colors.textPrimary,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 0,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sendDisabled: {
    backgroundColor: colors.surface,
  },
  sheetBackground: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sheetHandle: {
    backgroundColor: colors.hairline,
    borderRadius: 0,
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
    marginRight: 12,
  },
  sheetRowText: {
    flex: 1,
  },
  sheetDivider: {
    borderTopWidth: 1,
    borderStyle: 'dotted' as const,
    borderTopColor: colors.border,
    marginVertical: 6,
  },
});
