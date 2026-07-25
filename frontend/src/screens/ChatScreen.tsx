import { MaterialCommunityIcons } from '@expo/vector-icons';
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
import { EllipsisVertical, Search, X } from 'lucide-react-native';
import { api, ApiError, AutoKind, Friend, Message, Tag } from '../api';
import { useAuth } from '../auth';
import { useCategoryEdit } from '../category-edit';
import { useTagCreate } from '../tag-create';
import { confirmDialog, notify } from '../notify';
import { MessageBubble } from '../components/MessageBubble';
import { NoticeBanner } from '../components/NoticeBanner';
import { Text } from '../components/Text';
import { useMessageActions } from '../message-actions';
import { useMessageDetail } from '../message-detail';
import { copyToClipboard, messagePayload, shareContent } from '../share';
import { useSelectedRoom } from '../selected-room';
import { formatDateStamp, isSameDay } from '../time';
import { layout, ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { useDesktopClassInput } from '../use-desktop-input';
import { useReducedMotion } from 'react-native-reanimated';
import { hapticImpactLight, hapticImpactMedium } from '../haptics';

interface Props {
  token: string | null;
  /** null이면 "나에게" 방, 값이 있으면 해당 친구(카테고리) 방 */
  friendId: string | null;
  friendName: string | null;
  onBack: () => void;
  onLogout: () => void;
  /** 데스크톱 상주 패널에서 "나에게" 방일 땐 뒤로갈 곳이 없어 숨긴다 */
  showBack?: boolean;
  /** 자동구분 방 모드: 있으면 전 방 통합으로 이 종류만 모아 보는 "보기 전용" 방.
   *  friendId는 무시되고, 입력창·프로필 편집(펜)이 숨겨진다. */
  auto?: AutoKind | null;
  /** 태그 방 모드: 있으면 이 태그가 붙은 메시지를 전 방 통합으로 모아 보는 "보기 전용" 방.
   *  자동구분 방과 동일하게 friendId는 무시되고, 입력창·프로필 편집(펜)이 숨겨진다.
   *  헤더는 #태그명, 말풍선은 메시지별 자기 분류 색. */
  tag?: Tag | null;
  /** 태그 전체 방 모드: 태그가 하나 이상 달린 메시지를 전 방 통합으로 모아 보는 "보기 전용" 방.
   *  자동구분 방과 동일하게 friendId는 무시되고, 입력창·프로필 편집(펜)·공지가 없다.
   *  헤더는 #전체, 말풍선은 메시지별 자기 분류 색. */
  tagAll?: boolean;
  /** 자동구분 전체 방 모드: 링크가 하나라도 잡힌 메시지를 전 방 통합으로 모아 보는 "보기 전용" 방.
   *  자동구분 방과 동일한 보기 전용 경로. 헤더는 전체. */
  autoAll?: boolean;
  /** 하단에 탭바가 깔린 채로(모바일 (tabs) 방 라우트) 렌더될 때 true.
   *  이 경우 하단 safe-area는 탭바가 책임지므로 입력창은 안전영역 패딩을 빼
   *  탭바와의 이중 여백(빈틈)을 없앤다. 데스크톱 상주 패널은 false(입력창이 창 바닥). */
  bottomTabBar?: boolean;
}

export function ChatScreen({
  token,
  friendId,
  friendName,
  onBack,
  onLogout,
  showBack = true,
  auto = null,
  tag = null,
  tagAll = false,
  autoAll = false,
  bottomTabBar = false,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // 접근성 "동작 줄이기"가 켜지면 목록 자동 스크롤을 애니메이션 없이(즉시 점프) 처리한다.
  const reducedMotion = useReducedMotion();
  // 전송·삭제·분류 성공 시 채팅 목록 갱신 + 900px 교차용 draft 저장/복원.
  // roomsVersion은 분류 프로필(색) 편집 신호 — 열린 대화의 말풍선 색을 갱신하는 데 쓴다.
  const {
    bumpRooms,
    roomsVersion,
    syncVersion,
    saveChatDraft,
    readChatDraft,
    setTag,
    pollPreview,
    subscribePreview,
  } = useSelectedRoom();
  // 분류/전체 프로필 편집기(루트 상주) — 헤더 펜 아이콘에서 연다.
  const { open: openCategoryEditor } = useCategoryEdit();
  // 태그 이름·설명 수정 폼(루트 상주) — 태그 방 헤더 펜에서 연다.
  // openTagAllEdit — 태그 전체 방 헤더 ⋮에서 태그 전체 프로필(색·설명) 편집 폼을 연다.
  const { openTagRename, openTagAllEdit } = useTagCreate();
  // 메시지 액션(⋮ 메뉴·태그 선택·내용 수정)은 루트 상주 호스트로 이동 — 여기선 열기만.
  const { openMessageMenu } = useMessageActions();
  // 메시지 상세 모달(공지 배너 탭)도 루트 상주 호스트 — 여기선 열기만.
  const { openMessageDetail } = useMessageDetail();
  // "전체" 방(미분류) 말풍선 색 + self 편집 프리필에 쓰는 전체 프로필 색.
  const { selfColor } = useAuth();
  // 태그 방의 태그를 로컬 상태로 든다 — 헤더 펜으로 이름을 수정하면 즉시 갱신하기 위함.
  // prop(tag)이 바뀌면(데스크톱: selected-room.setTag / 모바일: 라우트 재구성) 그 값으로 재시드한다.
  const [roomTag, setRoomTag] = useState<Tag | null>(tag);
  useEffect(() => {
    setRoomTag(tag);
  }, [tag]);
  // 자동구분·태그 방은 입력창·펜(분류 프로필)·공지가 없는 "보기 전용" 방(전 방 통합 모음).
  // 태그 전체·자동구분 전체 방도 동일하게 보기 전용(어느 방/태그로 보낼지 정의가 없다).
  const viewOnly = !!auto || !!roomTag || tagAll || autoAll;
  // 입력창을 숨기는 방 — 일반 태그 방(roomTag)만 예외로 입력이 열린다(전송 시 그 태그 자동 부착).
  // 자동구분·태그 전체·자동구분 전체는 어느 방/태그로 보낼지 정의가 없어 입력창을 숨긴다.
  const hideInput = !!auto || autoAll || tagAll;
  // 방 구분 키. 저장된 draft가 이 값과 일치할 때만 복원한다(다른 방이면 빈 상태).
  // 자동구분/태그 방은 friendId(null)로 'self'와 겹치지 않게 접두어로 태깅한다(이름 수정엔 불변 — id 기준).
  const roomKey = tagAll
    ? 'tag:all'
    : autoAll
      ? 'auto:all'
      : roomTag
        ? `tag:${roomTag.id}`
        : auto
          ? `auto:${auto}`
          : friendId ?? 'self';
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
  // 전역 태그 목록(말풍선 #태그명 표시용).
  const [tags, setTags] = useState<Tag[]>([]);
  // 이 방의 공지 메시지(없으면 null). 방 진입 시 GET notice로 로드, 등록/해제 시 즉시 갱신.
  const [noticeMessage, setNoticeMessage] = useState<Message | null>(null);
  const activeQuery = useRef('');
  // 첫 로드 여부: 첫 조회는 디바운스 없이 즉시(복원된 검색어로) 실행하기 위한 플래그
  const firstLoadRef = useRef(true);
  // 사용자가 위로 스크롤해 과거 페이지를 불러왔는지. 실시간 동기화(silentReload)가
  // 전체 교체 대신 병합(새 메시지만 앞에 붙이고 로드된 과거는 보존)해 스크롤 튐을 막는 데 쓴다.
  // 새 load()(방 진입·검색·재조회)마다 false로 리셋.
  const hasPaginatedRef = useRef(false);
  // 물리 키보드 기기(데스크톱급)에서만 Enter=전송, Shift+Enter=줄바꿈
  const desktopInput = useDesktopClassInput();
  const inputRef = useRef<TextInput>(null);
  const sendRef = useRef<() => void>(() => {});
  // 전송 직후 방금 보낸 메시지(맨 아래)로 스크롤하기 위한 타임라인 ref.
  // inverted 목록이라 화면 최하단 = offset 0. 모바일·데스크톱 패널 공용.
  const listRef = useRef<FlatList<Message>>(null);

  // 태그 저장·내용 수정 성공 시 목록의 해당 메시지를 최신본으로 교체(루트 호스트가 콜백 호출).
  const applyUpdated = (updated: Message) => {
    setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    bumpRooms();
  };

  // 비동기 미리보기 폴링이 채운 갱신 메시지를 목록·공지 배너에 교체 반영한다(전송한 화면이 이 화면이든,
  // 900px 스왑으로 새로 마운트된 화면이든 동일하게). 어느 방에서 보냈든 자기 목록에 있으면 교체.
  useEffect(
    () =>
      subscribePreview((updated) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === updated.id ? updated : m)),
        );
        setNoticeMessage((n) => (n && n.id === updated.id ? updated : n));
        bumpRooms();
      }),
    [subscribePreview, bumpRooms],
  );

  // 메시지 상세 모달 페이로드 조립 — 공지 배너 탭·⋮ 메뉴의 "상세보기"·"내용 수정"이 공유한다.
  // 분류명·색·태그명은 현재 로드된 friends/tags/selfColor에서 뽑는다.
  // startInEdit=true면 상세 모달이 열리자마자 인라인 수정 모드로 시작한다
  // (⋮ 메뉴 [내용 수정] 경로 — 별도 수정 모달 없이 상세 모달 하나로 통일).
  // 메시지 → 메타(분류명·색·태그명) 파생. 상세 페이로드의 초기 메타이자,
  // 상세 모달이 픽커 변경을 즉시 반영할 때(resolveMeta) 쓰는 파생 함수다.
  // 현재 로드된 friends/tags/selfColor를 클로저로 캡처한다.
  const resolveDetailMeta = (m: Message) => {
    const friend = m.friendId ? friends.find((f) => f.id === m.friendId) : null;
    const names = (m.tagIds ?? [])
      .map((id) => tags.find((tg) => tg.id === id)?.name)
      .filter((n): n is string => !!n);
    return {
      categoryName: friend?.name ?? t('list.uncategorized'),
      categoryColor: friend?.color ?? selfColor ?? null,
      tagNames: names,
    };
  };

  const buildDetailPayload = (m: Message, startInEdit = false) => ({
    message: m,
    ...resolveDetailMeta(m),
    onSaved: applyUpdated,
    startInEdit,
    // 메타 블록 연필(분류·태그 인라인 편집)용 — 픽커 선택지·즉시 반영·목록 동기화 배선.
    friends,
    selfColor,
    resolveMeta: resolveDetailMeta,
    onCategoryChanged: applyCategoryChange,
    onFriendsChanged: bumpRooms,
    onTagsChanged: reloadTags,
  });

  // ⋮/long-press → 루트 상주 액션 메뉴를 연다. 화면 고유 효과는 콜백으로 위임한다.
  // 분류 변경은 호스트가 분류 선택 모달(step)로 전환한다 — 선택지(friends·selfColor)와
  // 적용 결과 반영 콜백(applyCategoryChange)만 넘긴다(PATCH는 모달이 직접 수행).
  const openMenu = (message: Message) => {
    if (!token) return;
    const isNoticeMsg = !!message.isNotice || noticeMessage?.id === message.id;
    openMessageMenu({
      message,
      isNotice: isNoticeMsg,
      onDetail: () => openMessageDetail(buildDetailPayload(message)),
      onCopy: () => void doCopy(message),
      onShare: () => void doShare(message),
      onNotice: () => void doNotice(message),
      onEditContent: () => openMessageDetail(buildDetailPayload(message, true)),
      onDelete: () => void confirmDelete(message),
      onSaved: applyUpdated,
      onTagsChanged: reloadTags,
      friends,
      selfColor,
      onCategoryChanged: applyCategoryChange,
      onFriendsChanged: bumpRooms,
    });
  };

  // 복사: 링크=url, 메모=content 클립보드 복사. 성공 확인창은 띄우지 않는다(사용자 확정 — 조용히).
  const doCopy = async (message: Message) => {
    try {
      await copyToClipboard(messagePayload(message));
    } catch {
      notify(t('common.notice'), t('chat.tryAgainLater'));
    }
  };

  // 공유: 네이티브 Share.share / 웹 navigator.share, 없으면 복사 폴백(조용히).
  const doShare = async (message: Message) => {
    try {
      await shareContent(messagePayload(message));
    } catch {
      // 공유 실패·취소는 조용히 무시.
    }
  };

  // 공지 토글: 이미 공지면 해제(false), 아니면 이 방 공지로(true, 기존 공지는 서버가 자동 해제).
  const doNotice = async (message: Message) => {
    if (!token) return;
    const makeNotice = !(message.isNotice || noticeMessage?.id === message.id);
    try {
      const updated = await api.updateMessageNotice(token, message.id, makeNotice);
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === updated.id) return updated;
          // 방당 1개 — 같은 방(friendId)의 기존 공지는 해제 표시.
          if (makeNotice && m.friendId === updated.friendId && m.isNotice) {
            return { ...m, isNotice: false };
          }
          return m;
        }),
      );
      setNoticeMessage(makeNotice ? updated : null);
    } catch {
      notify(t('common.notice'), t('chat.tryAgainLater'));
    }
  };

  // 공지 배너 탭 = 메시지 상세 모달 열기(입력 순서 그대로 본문 전체 표시).
  const openNoticeDetail = () => {
    if (!noticeMessage) return;
    openMessageDetail(buildDetailPayload(noticeMessage));
  };

  // 공지 배너 X = 확인 후 해제.
  const dismissNotice = async () => {
    if (!token || !noticeMessage) return;
    const target = noticeMessage;
    const ok = await confirmDialog({
      title: t('chat.noticeBanner.dismissTitle'),
      message: t('chat.noticeBanner.dismissMessage'),
      confirmLabel: t('common.confirm'),
      cancelLabel: t('common.cancel'),
    });
    if (!ok) return;
    try {
      const updated = await api.updateMessageNotice(token, target.id, false);
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setNoticeMessage(null);
    } catch {
      notify(t('common.notice'), t('chat.tryAgainLater'));
    }
  };

  // 이 방을 조회하는 쿼리 파라미터(검색어 제외). 태그/자동구분 전체 방은 특수값 'all',
  // 태그 방은 tagId, 자동구분 방은 auto로 전 방 통합, 일반 방은 friendId. load·loadOlder·silentReload 공용.
  const roomQuery = useMemo(
    () =>
      tagAll
        ? { tagId: 'all' as const }
        : autoAll
          ? { auto: 'all' as const }
          : roomTag
            ? { tagId: roomTag.id }
            : auto
              ? { auto }
              : { friendId: friendId ?? undefined },
    [tagAll, autoAll, roomTag, auto, friendId],
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
      // 첫 페이지로 되돌아가므로 과거 페이지 로드 상태를 리셋(silentReload가 전체 교체하도록).
      hasPaginatedRef.current = false;
      try {
        const page = await api.listMessages(token, {
          q: query || undefined,
          ...roomQuery,
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
    [token, roomQuery, onLogout, t],
  );

  // 실시간 동기화: SSE 이벤트(syncVersion)를 받으면 로딩 스피너 없이 조용히 재조회한다.
  // 과거 페이지를 안 불러온 상태면 첫 페이지로 전체 교체(추가·수정·삭제 모두 반영),
  // 불러온 상태면 병합(새 메시지만 앞에 붙이고 기존은 최신본으로 갱신)해 스크롤을 보존한다.
  const silentReload = useCallback(async () => {
    if (!token) return;
    try {
      const page = await api.listMessages(token, {
        q: activeQuery.current || undefined,
        ...roomQuery,
      });
      if (!hasPaginatedRef.current) {
        setMessages(page.items);
        setHasMore(page.hasMore);
        return;
      }
      setMessages((prev) => {
        const byId = new Map(page.items.map((m) => [m.id, m]));
        const existingIds = new Set(prev.map((m) => m.id));
        const prepend = page.items.filter((m) => !existingIds.has(m.id));
        return [...prepend, ...prev.map((m) => byId.get(m.id) ?? m)];
      });
    } catch {
      // 조용한 재조회 실패는 무시(다음 이벤트/포커스에서 다시 시도).
    }
  }, [token, roomQuery]);

  // 분류 시트와 친구 이름 태그·말풍선 색에 쓸 친구 목록.
  // roomsVersion을 의존성에 넣어, 분류 프로필(색)이 바뀌면 열린 대화의 말풍선도 갱신된다.
  useEffect(() => {
    if (!token) return;
    api
      .listFriends(token)
      .then(setFriends)
      .catch(() => {});
  }, [token, roomsVersion]);

  // 전역 태그 목록. 마운트 시 + 태그 모달에서 생성·수정·삭제 후 갱신.
  const reloadTags = useCallback(() => {
    if (!token) return;
    api.listTags(token).then(setTags).catch(() => {});
  }, [token]);
  useEffect(() => {
    reloadTags();
  }, [reloadTags]);
  const tagNameById = useMemo(
    () => new Map(tags.map((tg) => [tg.id, tg.name])),
    [tags],
  );

  // 방 진입 시 공지 로드(자동구분·태그 방은 공지 개념 없음 → null). 백엔드 미배포면 조용히 null.
  useEffect(() => {
    if (!token || viewOnly) {
      setNoticeMessage(null);
      return;
    }
    let cancelled = false;
    api
      .getNoticeMessage(token, friendId)
      .then((m) => {
        if (!cancelled) setNoticeMessage(m);
      })
      .catch(() => {
        if (!cancelled) setNoticeMessage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, friendId, viewOnly]);

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

  // 실시간 동기화 신호(syncVersion)가 바뀌면 조용히 재조회. silentReload는 ref로 잡아
  // (방 전환 등으로 identity가 바뀌어도) 실제 SSE 이벤트(syncVersion 증가)에만 반응하게 한다.
  // 첫 렌더(마운트 시 load가 이미 도는 시점)는 건너뛴다.
  const silentReloadRef = useRef(silentReload);
  silentReloadRef.current = silentReload;
  const firstSyncRef = useRef(true);
  useEffect(() => {
    if (firstSyncRef.current) {
      firstSyncRef.current = false;
      return;
    }
    void silentReloadRef.current();
  }, [syncVersion]);

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
        ...roomQuery,
      });
      // 과거 페이지를 불렀음을 표시 — 이후 silentReload는 전체 교체 대신 병합해 스크롤을 보존한다.
      hasPaginatedRef.current = true;
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
      // 태그 방에서 전송하면 분류 없는(friendId 없음) 새 메시지에 그 태그를 자동 부착 →
      // 지금 보는 태그 방 목록에 바로 나타난다. 그 외 방은 기존대로 friendId만.
      const message = await api.createMessage(
        token,
        content,
        friendId ?? undefined,
        roomTag ? [roomTag.id] : undefined,
      );
      setMessages((prev) => [message, ...prev]);
      bumpRooms();
      hapticImpactLight(); // 전송 성공 — 가벼운 커밋 피드백
      // 링크 메시지는 언퍼얼 전(og 빈 카드)으로 즉시 떴으니, 백그라운드 채움을 폴링해 카드를 교체한다.
      // 폴링은 루트(selected-room)에 있어 900px 스왑으로 이 화면이 언마운트돼도 계속된다.
      pollPreview(message);
      // 새 메시지가 반영된 다음 프레임에 최하단(방금 보낸 메시지)으로 스크롤.
      // inverted라 offset 0이 화면 아래. 검색 중이라 새 메시지가 결과에 없어도 안전(맨 아래로).
      // 동작 줄이기 시엔 애니메이션 없이 즉시 점프(전정계 자극 회피).
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: !reducedMotion });
      });
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

  // 분류 선택 모달이 PATCH를 마친 뒤, 서버가 돌려준 최신 메시지를 목록에 반영한다.
  // 친구 방에서 다른 분류로 옮기면 그 방 목록에서는 빠지고, 그 외엔 제자리 교체.
  const applyCategoryChange = (updated: Message) => {
    setMessages((prev) => {
      if (friendId && updated.friendId !== friendId) {
        return prev.filter((m) => m.id !== updated.id);
      }
      return prev.map((m) => (m.id === updated.id ? updated : m));
    });
    bumpRooms();
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
    const ok = await confirmDialog({
      title: t('common.delete'),
      message: t('chat.confirmDelete'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (ok) void performDelete(message);
  };

  // 태그 방 헤더 펜 — 이름·설명 수정 폼을 연다. 저장되면 헤더를 즉시 갱신한다:
  //  - setRoomTag: 로컬 상태(모바일 /tag-room 라우트 포함) 즉시 반영.
  //  - setTag: 데스크톱 selected-room 동기화(모바일에선 쓰이지 않아 무해). bumpRooms는 폼이 수행.
  const openTagEditor = () => {
    if (!roomTag) return;
    openTagRename(roomTag, (updated) => {
      setRoomTag(updated);
      setTag(updated);
    });
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
  // 자동구분 방이면 종류 이름(장소/영상/…)을 헤더·빈상태에 쓴다.
  const autoName = auto ? t(`auto.names.${auto}`) : null;
  // 태그 방이면 #태그명을 헤더 제목으로 쓴다(로컬 roomTag라 이름 수정 즉시 반영).
  // 태그 전체 방은 태그 섹터 문법(#) 그대로 #전체, 자동구분 전체 방은 전체(접두어 없음).
  const tagTitle = tagAll
    ? `#${t('common.all')}`
    : roomTag
      ? `#${roomTag.name}`
      : null;
  const autoTitle = autoAll ? t('common.all') : autoName;
  const roomName = tagTitle ?? autoTitle ?? currentFriend?.name ?? friendName;

  // 헤더 우측 편집(⋮) 대상 — 태그 방=태그 수정, 태그 전체 방=태그 전체 프로필, 전체 방=전체 프로필, 분류 방=그 분류.
  // 자동구분·자동구분 전체 방(편집 대상 없음)은 없음. 동작·a11y 라벨은 기존 연필과 동일, 표현만 ⋮로.
  const headerEdit = roomTag
    ? { onPress: openTagEditor, label: t('tags.editTitle') }
    : tagAll
      ? { onPress: openTagAllEdit, label: t('tags.editTitle') }
      : viewOnly
      ? null
      : friendId === null
        ? {
            onPress: () => openCategoryEditor({ self: true }),
            label: t('friends.profileLabel'),
          }
        : currentFriend
          ? {
              onPress: () => openCategoryEditor(currentFriend),
              label: t('friends.editTitle'),
            }
          : null;

  const canSend = !!input.trim() && !sending;

  // 방은 항상 말풍선 타임라인 원본 그대로(자동구분 필터 칩 제거됨 — 사용자 확정).
  const chatMessages = messages;

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
            accessibilityLabel={t('a11y.searchNotes')}
          />
        ) : (
          <View style={styles.headerTitleBlock}>
            <Text variant="heading" numberOfLines={1} style={styles.headerTitleText}>
              {roomName ?? t('chat.myRoom')}
            </Text>
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
        {/* 편집(⋮) — 돋보기 오른쪽 맨 끝. 동작은 기존 연필과 동일(방 종류별 편집기). 검색 중엔 숨김. */}
        {!searchOpen && headerEdit ? (
          <TouchableOpacity
            style={styles.headerAction}
            onPress={headerEdit.onPress}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={headerEdit.label}
          >
            <EllipsisVertical size={16} strokeWidth={2} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* 채팅방 상단 공지 배너 — 자동구분·태그 방 제외. 탭 = 링크면 원본 열기, X = 확인 후 해제. */}
      {!viewOnly && noticeMessage ? (
        <NoticeBanner
          message={noticeMessage}
          onPress={openNoticeDetail}
          onDismiss={dismissNotice}
        />
      ) : null}

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
                  : tagAll
                    ? t('tags.allRoomEmpty')
                    : autoAll
                      ? t('auto.allRoomEmpty')
                      : roomTag
                        ? t('tags.roomEmpty')
                        : auto
                          ? t('auto.empty', { name: autoName })
                          : t('chat.emptyFirstLink', { name: roomName ?? t('common.me') })}
              </Text>
            </View>
          </View>
        ) : (
          // 채팅 뷰(말풍선 타임라인). 자동구분 필터 칩은 제거됨(사용자 확정) —
          // 종류별 보기는 자동구분 방(전 방 통합 모음)이 담당한다.
          <FlatList
                ref={listRef}
                data={chatMessages}
                inverted
                keyExtractor={(item) => item.id}
                renderItem={({ item, index }) => {
                  // 날짜가 바뀌는 첫 메시지 위에만 날짜 구분선을 띄운다
                  // (inverted 목록이라 다음 인덱스가 더 오래된 메시지)
                  const older = chatMessages[index + 1];
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
                        tagNames={(item.tagIds ?? [])
                          .map((id) => tagNameById.get(id))
                          .filter((n): n is string => !!n)}
                        onLongPress={(message) => {
                          if (token) {
                            hapticImpactMedium(); // 컨텍스트 메뉴 열림 — 들어올림 피드백
                            openMenu(message);
                          }
                        }}
                        onPressMenu={token ? openMenu : undefined}
                        onDetail={() => openMessageDetail(buildDetailPayload(item))}
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

        {/* 자동구분·태그 전체·자동구분 전체 방은 입력창을 숨긴다(어느 방/태그로 보낼지 정의가 없는 보기 전용 모음).
            일반 태그 방만 입력창을 연다 — 전송 시 분류 없는 새 메시지에 이 태그가 자동 부착된다.
            (펜·공지 배너 등 나머지 편집 UI는 viewOnly로 태그 방에서도 계속 숨김) */}
        {hideInput ? null : (
        <View style={[styles.inputBar, bottomTabBar && styles.inputBarWithTabBar]}>
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
            accessibilityLabel={t('a11y.noteInput')}
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
        )}
      </KeyboardAvoidingView>
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
  // 이름은 줄여서(numberOfLines) 우측 액션(돋보기·⋮) 자리를 늘 남긴다.
  headerTitleText: {
    flexShrink: 1,
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
  // 하단 탭바가 안전영역을 책임질 때: 입력창은 작은 여백만 둬 탭바와 이중 여백을 없앤다.
  inputBarWithTabBar: {
    paddingBottom: 10,
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
});
