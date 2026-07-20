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
  LayoutChangeEvent,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  FileText,
  GripVertical,
  Link as LinkIcon,
  MapPin,
  Play,
  Plus,
  Search,
  ShoppingBag,
  StickyNote,
  X,
} from 'lucide-react-native';
import { ComponentType } from 'react';
import { api, ApiError, AutoKind, Friend, Message, Tag } from '../api';
import { useAuth } from '../auth';
import {
  ListFilter,
  matchesAutoFilter,
  messageAutoKind,
  resolveAutoOrder,
} from '../auto-filter';
import { useCategoryEdit } from '../category-edit';
import { confirmDialog, notify } from '../notify';
import { AutoChips } from '../components/AutoChips';
import { CardDetailPanel } from '../components/CardDetailPanel';
import { CategoryAvatar } from '../components/CategoryAvatar';
import { GalleryCard } from '../components/GalleryCard';
import { ModalCard } from '../components/ModalCard';
import { Text } from '../components/Text';
import { useMessageActions } from '../message-actions';
import { useTagCreate } from '../tag-create';
import { copyToClipboard, messagePayload, shareContent } from '../share';
import { useSelectedRoom } from '../selected-room';
import { layout, SELF_DEFAULT_COLOR, ThemeColors } from '../theme';
import { useTheme } from '../theme-context';

// 미분류(전체) 섹션 키 — 실제 friendId와 겹치지 않게 접두어 형태로.
const SELF_KEY = '__self__';
const H_PAD = 16;
const GUTTER = 12;
// 카드 목표 폭 — 이걸 기준으로 컨테이너 폭을 나눠 열 수를 정한다(모바일 2 ~ 넓으면 4).
const TARGET_CARD = 240;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// 보드 종류: 분류별 그룹(category) · 자동구분별 그룹(auto) · 태그별 그룹(tags).
// URL이 진실원천(라우트로 구분).
export type BoardKind = 'category' | 'auto' | 'tags';

// lucide 아이콘 컴포넌트 타입(AutoScreen과 동일 표기).
type IconComponent = ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

// 자동구분 6종 고정 순서·아이콘(AutoScreen의 AUTO_ITEMS와 동일 매핑).
const AUTO_ORDER: { key: AutoKind; Icon: IconComponent }[] = [
  { key: 'place', Icon: MapPin },
  { key: 'video', Icon: Play },
  { key: 'item', Icon: ShoppingBag },
  { key: 'article', Icon: FileText },
  { key: 'memo', Icon: StickyNote },
  { key: 'link', Icon: LinkIcon },
];

// 카드 줄을 이루는 셀: 실제 카드 또는 (분류 보드 전용) 섹션 하단 "추가" ghost 카드.
type Cell =
  | { kind: 'card'; message: Message; color: string | null }
  | { kind: 'add'; friendId: string | null };

// FlatList가 렌더할 행: 섹션 헤더 또는 카드 한 줄(열 수만큼 묶음).
type BoardRow =
  | {
      type: 'header';
      id: string;
      sectionKey: string;
      title: string;
      color: string | null;
      count: number;
      collapsed: boolean;
      /** 자동구분 보드면 그 종류(아이콘 렌더용), 분류 보드면 undefined(아바타 렌더). */
      autoKind?: AutoKind;
      /** 태그 보드면 true(# 글리프 렌더). 색·아바타·아이콘 대신 무채색 # 타일. */
      tagSection?: boolean;
    }
  | { type: 'cards'; id: string; cells: Cell[] };

interface Props {
  token: string | null;
  /** 현재 보드(분류/자동구분). 라우트가 정한다 — URL이 진실원천. */
  board: BoardKind;
  /** 보드 전환(라우트 이동). 세그먼트 탭이 호출. */
  onSwitchBoard: (board: BoardKind) => void;
  /** 헤더 ⋯ → 더보기(목록형에서 채팅형으로 되돌아가는 유일 경로). */
  onOpenMore: () => void;
  onLogout: () => void;
}

// 목록형 메인(노션 DB 뷰): 분류별 그룹 섹션 + 갤러리 카드 그리드.
// 데이터는 기존 API만 사용 — 분류 목록(friends) + 전체 메시지(listMessages)를 클라이언트에서
// friendId로 그룹핑. 목록형(테마)에서 (tabs)의 /friends·/auto 라우트가 렌더하는 전폭 단일 페이지.
export function ListBoardScreen({
  token,
  board,
  onSwitchBoard,
  onOpenMore,
  onLogout,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // 미분류(전체) 섹션 아바타·카드 점에 쓸 "전체" 프로필 색 + 자동구분 표시 순서.
  const { selfColor, autoOrder } = useAuth();
  // 헤더 + 버튼 = 분류 추가(채팅형 분류 탭 +와 동일 경로, 루트 상주 편집기).
  const { open: openCategoryEditor } = useCategoryEdit();
  // 메시지 액션·태그 추가 모달은 루트 상주 호스트 — 여기선 열기만.
  const { openMessageMenu } = useMessageActions();
  const { openTagCreate } = useTagCreate();
  // 자동구분 보드 섹션 순서(사용자 순서 우선, 없으면 기본).
  const autoKindOrder = useMemo(() => resolveAutoOrder(autoOrder), [autoOrder]);
  // 생성·삭제·분류 변경을 채팅형 목록과 동기화하는 신호.
  const { bumpRooms, roomsVersion } = useSelectedRoom();

  const [messages, setMessages] = useState<Message[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  // 전역 태그 목록(카드·상세 #태그명 표시용).
  const [tags, setTags] = useState<Tag[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autoFilter, setAutoFilter] = useState<ListFilter>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  // 접힌 섹션(로컬 v1). 자기 방일 때만 복원하는 등의 태깅은 목록형이 단일 트리라 불필요.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  // 그리드 열 계산용 컨테이너 실측 폭(비례 규칙 — 창 폭이 아니라 담긴 폭 기준).
  const [containerW, setContainerW] = useState(0);

  // "새로 만들기" 모달 상태.
  const [createOpen, setCreateOpen] = useState(false);
  const [createInput, setCreateInput] = useState('');
  const [createFriendId, setCreateFriendId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // long-press/⋯ 액션 대상 메시지 — 분류 변경 바텀시트의 대상(메뉴·태그·수정은 루트 호스트).
  const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const sheetRef = useRef<BottomSheetModal>(null);

  // 카드 탭 상세 패널(오른쪽 사이드 픽). 목록형은 단일 트리라 화면 로컬 상태로 충분.
  const [detailMessage, setDetailMessage] = useState<Message | null>(null);

  // 섹션 재정렬 시트(위로/아래로 이동) 대상 분류 id.
  const [reorderTarget, setReorderTarget] = useState<string | null>(null);
  const reorderSheetRef = useRef<BottomSheetModal>(null);

  const activeQuery = useRef('');
  const firstLoadRef = useRef(true);

  const winW = useWindowDimensions().width;
  const measuredW = containerW || winW;
  const cols = clamp(Math.floor((measuredW - H_PAD * 2) / TARGET_CARD), 2, 4);
  const cardWidth = Math.floor(
    (measuredW - H_PAD * 2 - GUTTER * (cols - 1)) / cols,
  );

  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerW(e.nativeEvent.layout.width);
  }, []);

  // 전체 메시지 조회(친구 필터 없이) — "전체" 방과 같은 데이터. 검색어(q)는 서버가 처리.
  const load = useCallback(
    async (query: string) => {
      if (!token) {
        setLoading(false);
        return;
      }
      setLoading(true);
      activeQuery.current = query;
      try {
        const page = await api.listMessages(token, { q: query || undefined });
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
    [token, onLogout, t],
  );

  // 첫 로드는 즉시, 이후 검색어 변경은 300ms 디바운스(ChatScreen과 동일 관례).
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

  // 분류 목록(이름·색). 생성·삭제·분류 변경(roomsVersion)마다 최신화.
  useEffect(() => {
    if (!token) return;
    api.listFriends(token).then(setFriends).catch(() => {});
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
  const tagNamesFor = useCallback(
    (m: Message): string[] =>
      (m.tagIds ?? [])
        .map((id) => tagNameById.get(id))
        .filter((n): n is string => !!n),
    [tagNameById],
  );

  const loadOlder = async () => {
    if (!token || !hasMore || loading || messages.length === 0) return;
    const oldest = messages[messages.length - 1];
    try {
      const page = await api.listMessages(token, {
        q: activeQuery.current || undefined,
        before: oldest.id,
      });
      setMessages((prev) => [...prev, ...page.items]);
      setHasMore(page.hasMore);
    } catch {
      // 스크롤 페이지네이션 실패는 조용히 무시(다시 스크롤하면 재시도).
    }
  };

  // 자동구분 칩(전역 필터) 적용.
  const filtered = useMemo(
    () =>
      autoFilter === 'all'
        ? messages
        : messages.filter((m) => matchesAutoFilter(m, autoFilter)),
    [messages, autoFilter],
  );

  // friendId → 분류색 조회(자동구분 보드에서 카드마다 자기 분류색 점을 얹기 위함).
  const friendColor = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const f of friends) map.set(f.id, f.color ?? null);
    return map;
  }, [friends]);

  // 검색 중이면 빈 섹션을 억지로 만들지 않는다(결과 없음 문구를 대신 보여줌).
  const isSearching = searchOpen && searchText.trim().length > 0;

  // 섹션 그룹핑. 분류 보드=friendId별(미분류 먼저), 자동구분 보드=자동구분 종류별(고정 순서).
  // 항목 있는 섹션만 노출 — 단 분류 보드는 검색·필터가 아닐 때 "전체(미분류)" 섹션을
  // 비어 있어도 항상 노출한다(그 섹션의 "+추가" 카드가 첫 항목 입력 진입점이 되도록).
  const sections = useMemo(() => {
    const result: {
      key: string;
      title: string;
      color: string | null;
      items: Message[];
      autoKind?: AutoKind;
      tagSection?: boolean;
    }[] = [];

    if (board === 'tags') {
      // 태그별 섹션(전역 태그 순서). 한 메시지가 태그 여러 개면 여러 섹션에 등장(노션식).
      // 태그 없는 메시지는 숨긴다(태그 보드는 태그로 탐색하는 뷰라 미태그 버킷을 두지 않는다).
      // 항목 있는 섹션만 노출(자동구분 보드가 빈 종류를 감추는 것과 동일).
      const byTag = new Map<string, Message[]>();
      for (const m of filtered) {
        for (const id of m.tagIds ?? []) {
          const arr = byTag.get(id);
          if (arr) arr.push(m);
          else byTag.set(id, [m]);
        }
      }
      for (const tg of tags) {
        const items = byTag.get(tg.id);
        if (items && items.length) {
          result.push({
            key: `tag:${tg.id}`,
            // 제목엔 접두 #를 붙이지 않는다 — 섹션 글리프 슬롯의 # 타일이 그 역할을 한다.
            title: tg.name,
            color: null,
            items,
            tagSection: true,
          });
        }
      }
      return result;
    }

    if (board === 'auto') {
      const byKind = new Map<AutoKind, Message[]>();
      for (const m of filtered) {
        const key = messageAutoKind(m);
        const arr = byKind.get(key);
        if (arr) arr.push(m);
        else byKind.set(key, [m]);
      }
      for (const key of autoKindOrder) {
        const items = byKind.get(key);
        if (items && items.length) {
          result.push({
            key,
            title: t(`auto.names.${key}`),
            color: null,
            items,
            autoKind: key,
          });
        }
      }
      return result;
    }

    // 분류 보드
    const byKey = new Map<string, Message[]>();
    for (const m of filtered) {
      const key = m.friendId ?? SELF_KEY;
      const arr = byKey.get(key);
      if (arr) arr.push(m);
      else byKey.set(key, [m]);
    }
    const selfItems = byKey.get(SELF_KEY);
    const showEmptySelf = !isSearching && autoFilter === 'all';
    if ((selfItems && selfItems.length) || showEmptySelf) {
      result.push({
        key: SELF_KEY,
        title: t('list.uncategorized'),
        color: selfColor ?? SELF_DEFAULT_COLOR,
        items: selfItems ?? [],
      });
    }
    for (const f of friends) {
      const items = byKey.get(f.id);
      if (items && items.length) {
        result.push({ key: f.id, title: f.name, color: f.color ?? null, items });
      }
    }
    return result;
  }, [board, filtered, friends, tags, selfColor, isSearching, autoFilter, autoKindOrder, t]);

  // 섹션 → FlatList 행(헤더 + 열 수만큼 묶은 카드 줄). 접힌 섹션은 헤더만.
  // 분류 보드는 각 섹션 끝에 "+추가" ghost 셀을 붙여 그 분류로 프리셀렉트된 입력을 연다.
  const rows = useMemo(() => {
    const out: BoardRow[] = [];
    for (const s of sections) {
      const isCollapsed = collapsed.has(s.key);
      out.push({
        type: 'header',
        id: `h:${s.key}`,
        sectionKey: s.key,
        title: s.title,
        color: s.color,
        count: s.items.length,
        collapsed: isCollapsed,
        autoKind: s.autoKind,
        tagSection: s.tagSection,
      });
      if (isCollapsed) continue;
      const cells: Cell[] = s.items.map((m) => ({
        kind: 'card',
        message: m,
        // 자동구분·태그 보드는 카드마다 자기 분류색(색은 분류의 것), 분류 보드는 섹션 색.
        color:
          board === 'auto' || board === 'tags'
            ? m.friendId
              ? friendColor.get(m.friendId) ?? null
              : selfColor ?? SELF_DEFAULT_COLOR
            : s.color,
      }));
      if (board === 'category') {
        cells.push({
          kind: 'add',
          friendId: s.key === SELF_KEY ? null : s.key,
        });
      }
      for (let i = 0; i < cells.length; i += cols) {
        out.push({
          type: 'cards',
          id: `r:${s.key}:${i}`,
          cells: cells.slice(i, i + cols),
        });
      }
    }
    return out;
  }, [sections, collapsed, cols, board, friendColor, selfColor]);

  const toggleSection = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // 목록형 카드 탭 = 항상 오른쪽 상세 패널을 연다(URL 바로 열기·장소 시트 대신).
  // (채팅형 말풍선·시트 동작은 그대로 — 여긴 목록형 보드 전용)
  const handleCardPress = useCallback((m: Message) => {
    setDetailMessage(m);
  }, []);

  // 태그 저장·내용 수정 성공 시 목록·상세 패널을 최신본으로 교체(루트 호스트가 콜백 호출).
  const applyUpdated = useCallback((updated: Message) => {
    setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    setDetailMessage((d) => (d && d.id === updated.id ? updated : d));
    bumpRooms();
  }, [bumpRooms]);

  // long-press/⋯ → 루트 상주 액션 메뉴를 연다(채팅형과 동일한 공용 호스트).
  // 화면 고유 효과는 콜백으로 위임하고, 분류 변경 바텀시트를 위해 actionMessage도 세팅한다.
  const openMenu = useCallback(
    (m: Message) => {
      if (!token) return;
      setActionMessage(m);
      openMessageMenu({
        message: m,
        isNotice: !!m.isNotice,
        onCopy: () => void doCopy(m),
        onShare: () => void doShare(m),
        onNotice: () => void doNotice(m),
        onEditCategory: () => sheetRef.current?.present(),
        onDelete: () => void confirmDelete(m),
        onSaved: applyUpdated,
        onTagsChanged: reloadTags,
      });
    },
    // doCopy·doShare·doNotice·confirmDelete는 렌더마다 재생성되지만 클로저로 최신 값을 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, openMessageMenu, applyUpdated, reloadTags],
  );

  // 복사: 링크=url, 메모=content 클립보드 복사 후 짧은 확인.
  const doCopy = async (m: Message) => {
    try {
      await copyToClipboard(messagePayload(m));
      notify(t('chat.copied'));
    } catch {
      notify(t('common.notice'), t('chat.tryAgainLater'));
    }
  };

  // 공유: 네이티브 Share.share / 웹 navigator.share, 없으면 복사 폴백(확인 문구).
  const doShare = async (m: Message) => {
    try {
      const result = await shareContent(messagePayload(m));
      if (result === 'copied') notify(t('chat.copied'));
    } catch {
      // 공유 실패·취소는 조용히 무시.
    }
  };

  // 공지 토글(목록형은 배너 없음 — 플래그만 갱신). 방당 1개라 같은 방 기존 공지는 해제 표시.
  const doNotice = async (m: Message) => {
    if (!token) return;
    const makeNotice = !m.isNotice;
    try {
      const updated = await api.updateMessageNotice(token, m.id, makeNotice);
      const apply = (x: Message): Message => {
        if (x.id === updated.id) return updated;
        if (makeNotice && x.friendId === updated.friendId && x.isNotice) {
          return { ...x, isNotice: false };
        }
        return x;
      };
      setMessages((prev) => prev.map(apply));
      setDetailMessage((d) => (d ? apply(d) : d));
    } catch {
      notify(t('common.notice'), t('chat.tryAgainLater'));
    }
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

  // 분류 변경(채팅 액션 시트와 동일). 전체 보기라 목록에서 빠지지 않고 섹션만 이동한다.
  const assignFriend = async (message: Message, newFriendId: string | null) => {
    if (!token) return;
    sheetRef.current?.dismiss();
    try {
      const updated = await api.updateMessageFriend(token, message.id, newFriendId);
      setMessages((prev) => prev.map((m) => (m.id === message.id ? updated : m)));
      // 상세 패널이 이 카드를 보고 있으면 새 분류로 갱신(패널 분류 행 즉시 반영).
      setDetailMessage((d) => (d && d.id === message.id ? updated : d));
      bumpRooms();
    } catch {
      // 실패 시 목록 유지 — 다시 시도 가능.
    }
  };

  const performDelete = async (message: Message) => {
    if (!token) return;
    try {
      await api.deleteMessage(token, message.id);
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
      // 상세 패널이 이 카드를 보고 있었다면 닫는다(대상이 사라짐).
      setDetailMessage((d) => (d && d.id === message.id ? null : d));
      bumpRooms();
    } catch {
      // 실패 시 목록 유지.
    }
  };

  // 섹션(분류) 재정렬 — 분류 탭과 같은 규칙(reorderFriends)으로 저장, bumpRooms로 즉시 반영.
  // 전체 friends 배열 기준 ±1로 옮긴다(보드에 안 보이는 빈 분류도 포함한 유효 순열을 저장).
  const moveSection = (friendId: string, delta: number) => {
    reorderSheetRef.current?.dismiss();
    const idx = friends.findIndex((f) => f.id === friendId);
    if (idx < 0) return;
    const target = clamp(idx + delta, 0, friends.length - 1);
    if (target === idx) return;
    const next = [...friends];
    const [moved] = next.splice(idx, 1);
    next.splice(target, 0, moved);
    setFriends(next);
    if (!token) return;
    api
      .reorderFriends(
        token,
        next.map((f) => f.id),
      )
      .then(() => bumpRooms())
      .catch(() => {
        // 저장 실패 시 서버 순서로 복원.
        if (token) api.listFriends(token).then(setFriends).catch(() => {});
      });
  };

  const confirmDelete = async (message: Message) => {
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

  // 섹션 하단 "+추가" 카드 → 그 섹션의 분류가 미리 선택된 입력 모달을 연다.
  const openCreateFor = (friendId: string | null) => {
    setCreateInput('');
    setCreateFriendId(friendId);
    setCreateOpen(true);
  };

  // 저장 = 채팅 전송과 동일 payload(createMessage). 고른 분류로 보낸다(없으면 미분류).
  const submitCreate = async () => {
    const content = createInput.trim();
    if (!content || creating) return;
    if (!token) {
      notify(t('common.notice'), t('chat.loginToSend'));
      return;
    }
    setCreating(true);
    try {
      const msg = await api.createMessage(token, content, createFriendId ?? undefined);
      setMessages((prev) => [msg, ...prev]);
      // 필터가 걸려 있으면 방금 만든 게 가려질 수 있어 '전체'로 되돌린다.
      setAutoFilter('all');
      bumpRooms();
      setCreateOpen(false);
      setCreateInput('');
    } catch {
      notify(t('chat.sendFailedTitle'), t('chat.tryAgainLater'));
    } finally {
      setCreating(false);
    }
  };

  // 빈 상태 문구: 검색 중 → 결과 없음, 필터 중 → 해당 없음, 그 외 → 첫 사용 안내.
  const emptyText = activeQuery.current
    ? t('list.noResults')
    : autoFilter !== 'all'
      ? t('viewMode.emptyFilter')
      : board === 'tags'
        ? t('list.tagsEmpty')
        : t('list.empty');

  const showLabel = measuredW >= 400;

  const renderRow = ({ item }: { item: BoardRow }) => {
    if (item.type === 'header') {
      const Chevron = item.collapsed ? ChevronRight : ChevronDown;
      // 자동구분 보드는 색이 없으므로 아바타 대신 lucide 아이콘(무채색)을 쓴다.
      const AutoIcon = item.autoKind
        ? AUTO_ORDER.find((a) => a.key === item.autoKind)?.Icon
        : undefined;
      // 재정렬 가능한 섹션 = 분류 보드의 분류 섹션(미분류·자동구분은 순서 고정).
      const canReorder =
        board === 'category' &&
        item.autoKind === undefined &&
        item.sectionKey !== SELF_KEY;
      return (
        // 그립을 collapse 토글의 자식으로 두면 웹(onClick 버블)에서 두 핸들러가 같이 터진다 —
        // 바깥은 View, collapse 영역과 그립을 형제 Touchable로 분리한다.
        <View style={styles.sectionHeader}>
          <TouchableOpacity
            style={styles.sectionHeaderMain}
            onPress={() => toggleSection(item.sectionKey)}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityState={{ expanded: !item.collapsed }}
            accessibilityLabel={item.title}
          >
            <Chevron size={18} strokeWidth={2} color={colors.textSecondary} />
            {item.tagSection ? (
              // 태그 섹션 — 무채색 # 글리프(색은 분류의 것이라 태그는 색이 없다).
              <View style={styles.sectionIcon}>
                <Text variant="bodyStrong" color={colors.ink}>
                  #
                </Text>
              </View>
            ) : AutoIcon ? (
              <View style={styles.sectionIcon}>
                <AutoIcon size={18} strokeWidth={2} color={colors.ink} />
              </View>
            ) : (
              <CategoryAvatar color={item.color} size={22} style={styles.sectionAvatar} />
            )}
            <Text variant="bodyStrong" numberOfLines={1} style={styles.sectionTitle}>
              {item.title}
            </Text>
            <View style={styles.sectionLeader} />
            <Text variant="micro" color={colors.textSecondary}>
              {item.count}
            </Text>
          </TouchableOpacity>
          {/* 그립 = 섹션 재정렬(위로/아래로 이동 시트). 보드 구조(FlatList·가변 높이 섹션)상
              RNGH 드래그는 웹에서 불안정해, 그립 탭으로 이동 메뉴를 여는 방식으로 폴백한다. */}
          {canReorder ? (
            <TouchableOpacity
              style={styles.gripButton}
              onPress={() => {
                setReorderTarget(item.sectionKey);
                reorderSheetRef.current?.present();
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('a11y.reorder')}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(e) =>
                moveSection(
                  item.sectionKey,
                  e.nativeEvent.actionName === 'increment' ? -1 : 1,
                )
              }
            >
              <GripVertical size={16} strokeWidth={2} color={colors.textTertiary} />
            </TouchableOpacity>
          ) : null}
        </View>
      );
    }
    return (
      <View style={styles.cardRow}>
        {item.cells.map((cell) =>
          cell.kind === 'card' ? (
            <GalleryCard
              key={cell.message.id}
              message={cell.message}
              width={cardWidth}
              color={cell.color}
              tagNames={tagNamesFor(cell.message)}
              onPress={handleCardPress}
              onLongPress={openMenu}
            />
          ) : (
            // 섹션 하단 "+추가" ghost 카드(점선 보더·라운드 0) — 노션 그룹 하단 문법.
            <TouchableOpacity
              key={`add:${cell.friendId ?? SELF_KEY}`}
              style={[styles.addCard, { width: cardWidth }]}
              onPress={() => openCreateFor(cell.friendId)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('list.newTitle')}
            >
              <Plus size={20} strokeWidth={2} color={colors.textSecondary} />
              <Text variant="micro" color={colors.textTertiary} style={styles.addLabel}>
                {t('friends.add')}
              </Text>
            </TouchableOpacity>
          ),
        )}
      </View>
    );
  };

  return (
    <View style={styles.container} onLayout={onContainerLayout}>
      {/* 헤더: ✳ slash 워드마크(검색 열리면 입력) · 검색 · [+ 분류] · ⋯ */}
      <View style={styles.header}>
        {searchOpen ? (
          <TextInput
            style={styles.searchInput}
            placeholder={t('list.searchPlaceholder')}
            placeholderTextColor={colors.textTertiary}
            value={searchText}
            onChangeText={setSearchText}
            autoFocus
          />
        ) : (
          <Text variant="heading" color={colors.ink} style={styles.wordmark}>
            ✳ slash
          </Text>
        )}
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => {
            if (searchOpen) setSearchText('');
            setSearchOpen(!searchOpen);
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={searchOpen ? t('common.cancel') : t('chat.search')}
        >
          {searchOpen ? (
            <X size={22} strokeWidth={2} color={colors.ink} />
          ) : (
            <Search size={22} strokeWidth={2} color={colors.ink} />
          )}
        </TouchableOpacity>
        {/* + 버튼 = 태그 보드면 태그 추가, 그 외엔 분류 추가(루트 상주 편집기).
            채팅형 각 탭의 + 관례와 동일 경로. */}
        <TouchableOpacity
          style={styles.newButton}
          onPress={() => {
            if (board === 'tags') {
              // 태그 추가는 루트 상주 호스트 — 생성 후 이 보드의 태그 목록만 갱신.
              openTagCreate(() => reloadTags());
            } else {
              openCategoryEditor();
            }
          }}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={
            board === 'tags' ? t('tags.addTitle') : t('friends.addTitle')
          }
        >
          <Plus size={18} strokeWidth={2} color={colors.onAccent} />
          {showLabel ? (
            <Text variant="label" color={colors.onAccent} style={styles.newLabel}>
              {board === 'tags' ? t('tabs.tags') : t('tabs.friends')}
            </Text>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={onOpenMore}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('tabs.more')}
        >
          <Ellipsis size={22} strokeWidth={2} color={colors.ink} />
        </TouchableOpacity>
      </View>

      {/* 보드 전환 세그먼트: [분류][자동구분][태그]. 활성 = ink 채움(DESIGN 활성 문법). */}
      <View style={styles.segmentRow}>
        {(['category', 'auto', 'tags'] as const).map((b) => {
          const active = board === b;
          const label =
            b === 'category'
              ? t('tabs.friends')
              : b === 'auto'
                ? t('tabs.auto')
                : t('tabs.tags');
          return (
            <TouchableOpacity
              key={b}
              style={[styles.segment, active && styles.segmentActive]}
              onPress={() => onSwitchBoard(b)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
            >
              <Text
                variant="label"
                color={active ? colors.onAccent : colors.textSecondary}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 자동구분 칩 = 전역 필터. 자동구분 보드는 섹션이 곧 자동구분이라 불필요, 나머지(분류·태그)는 노출 */}
      {board !== 'auto' ? (
        <AutoChips value={autoFilter} onChange={setAutoFilter} />
      ) : null}

      {loading && messages.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.ink} />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <View style={styles.emptyBox}>
            <Text style={styles.emptyGlyph} color={colors.ink}>
              ✳
            </Text>
            <Text
              variant="body"
              color={colors.textSecondary}
              style={styles.emptyText}
            >
              {emptyText}
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={renderRow}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.5}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* "+ 새로 만들기" — 분류 선택 + 링크/메모 입력(ModalCard 단일 문법) */}
      <ModalCard
        visible={createOpen}
        title={t('list.newTitle')}
        onClose={() => setCreateOpen(false)}
        confirmLabel={t('common.save')}
        cancelLabel={t('common.cancel')}
        onConfirm={submitCreate}
        busy={creating}
      >
        <Text variant="caption" color={colors.textSecondary} style={styles.createLabel}>
          {t('list.category')}
        </Text>
        <View style={styles.swatchRow}>
          {/* 전체(미분류) — self 프로필 색 */}
          <TouchableOpacity
            style={[
              styles.swatchRing,
              createFriendId === null && styles.swatchRingActive,
            ]}
            onPress={() => setCreateFriendId(null)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: createFriendId === null }}
            accessibilityLabel={t('list.uncategorized')}
          >
            <CategoryAvatar color={selfColor ?? SELF_DEFAULT_COLOR} size={38} />
          </TouchableOpacity>
          {friends.map((f) => {
            const selected = createFriendId === f.id;
            return (
              <TouchableOpacity
                key={f.id}
                style={[styles.swatchRing, selected && styles.swatchRingActive]}
                onPress={() => setCreateFriendId(f.id)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={f.name}
              >
                <CategoryAvatar color={f.color} size={38} />
              </TouchableOpacity>
            );
          })}
        </View>
        <TextInput
          style={styles.createInput}
          placeholder={t('list.inputPlaceholder')}
          placeholderTextColor={colors.textTertiary}
          value={createInput}
          onChangeText={setCreateInput}
          multiline
        />
      </ModalCard>

      {/* 카드 long-press 액션 시트 — 채팅과 동일(분류 변경/해제/삭제). */}
      <BottomSheetModal
        ref={sheetRef}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        onDismiss={() => setActionMessage(null)}
        handleIndicatorStyle={styles.sheetHandle}
        backgroundStyle={styles.sheetBackground}
      >
        <BottomSheetView style={styles.sheet}>
          <Text variant="label" color={colors.textSecondary} style={styles.sheetTitle}>
            {t('chat.changeFriend')}
          </Text>
          {friends.length === 0 ? (
            <Text variant="label" color={colors.textTertiary} style={styles.sheetHint}>
              {t('chat.addFriendFirst')}
            </Text>
          ) : (
            friends.map((friend) => {
              const selected = actionMessage?.friendId === friend.id;
              return (
                <TouchableOpacity
                  key={friend.id}
                  style={styles.sheetRow}
                  onPress={() => actionMessage && assignFriend(actionMessage, friend.id)}
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
            onPress={() => sheetRef.current?.dismiss()}
            accessibilityRole="button"
          >
            <Text variant="bodyStrong" color={colors.textTertiary}>
              {t('common.cancel')}
            </Text>
          </TouchableOpacity>
        </BottomSheetView>
      </BottomSheetModal>

      {/* 섹션 재정렬 시트 — 위로/아래로 이동(reorderFriends 저장, 분류 탭 즉시 반영). */}
      <BottomSheetModal
        ref={reorderSheetRef}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        onDismiss={() => setReorderTarget(null)}
        handleIndicatorStyle={styles.sheetHandle}
        backgroundStyle={styles.sheetBackground}
      >
        <BottomSheetView style={styles.sheet}>
          <Text variant="label" color={colors.textSecondary} style={styles.sheetTitle}>
            {t('a11y.reorder')}
          </Text>
          <TouchableOpacity
            style={styles.sheetRow}
            onPress={() => reorderTarget && moveSection(reorderTarget, -1)}
            accessibilityRole="button"
          >
            <ArrowUp size={18} strokeWidth={2} color={colors.ink} style={styles.sheetIcon} />
            <Text variant="bodyStrong">{t('list.moveUp')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sheetRow}
            onPress={() => reorderTarget && moveSection(reorderTarget, 1)}
            accessibilityRole="button"
          >
            <ArrowDown size={18} strokeWidth={2} color={colors.ink} style={styles.sheetIcon} />
            <Text variant="bodyStrong">{t('list.moveDown')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sheetRow}
            onPress={() => reorderSheetRef.current?.dismiss()}
            accessibilityRole="button"
          >
            <Text variant="bodyStrong" color={colors.textTertiary}>
              {t('common.cancel')}
            </Text>
          </TouchableOpacity>
        </BottomSheetView>
      </BottomSheetModal>

      {/* 카드 상세 = 오른쪽 사이드 픽(데스크톱) / 전체 오버레이(모바일). */}
      {detailMessage ? (
        <CardDetailPanel
          message={detailMessage}
          friendName={
            detailMessage.friendId
              ? friends.find((f) => f.id === detailMessage.friendId)?.name ??
                t('list.uncategorized')
              : t('list.uncategorized')
          }
          color={
            detailMessage.friendId
              ? friendColor.get(detailMessage.friendId) ?? null
              : selfColor ?? SELF_DEFAULT_COLOR
          }
          autoKind={messageAutoKind(detailMessage)}
          tagNames={tagNamesFor(detailMessage)}
          onClose={() => setDetailMessage(null)}
          onOpenMenu={openMenu}
        />
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: layout.statusBarPad + 54,
      paddingTop: layout.statusBarPad,
      paddingBottom: 12,
      paddingHorizontal: H_PAD,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.hairline,
      gap: 8,
    },
    wordmark: {
      flex: 1,
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
      color: colors.textPrimary,
    },
    iconButton: {
      paddingHorizontal: 2,
    },
    // primary ink 블록(BAT CTA 문법) — 보더 없음·라운드 0.
    newButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 34,
      paddingHorizontal: 12,
      backgroundColor: colors.accent,
      borderRadius: 0,
    },
    newLabel: {},
    // 보드 전환 세그먼트 줄 — 1px border 세그먼트, 활성 = ink 채움(AutoChips 활성 문법과 통일).
    segmentRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: H_PAD,
      paddingTop: 12,
      paddingBottom: 4,
    },
    segment: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 0,
      backgroundColor: colors.background,
      paddingHorizontal: 16,
      paddingVertical: 7,
    },
    segmentActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
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
    },
    emptyGlyph: {
      fontSize: 22,
      textAlign: 'center',
      marginBottom: 10,
    },
    emptyText: {
      textAlign: 'center',
      lineHeight: 22,
    },
    listContent: {
      paddingTop: 6,
      paddingBottom: 24,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: H_PAD,
      paddingTop: 18,
      paddingBottom: 10,
    },
    // collapse 토글 영역 — 남는 폭을 채워 count까지 담고, 그립은 이 바깥 형제.
    sectionHeaderMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sectionAvatar: {},
    // 자동구분 섹션 헤더 아이콘 자리 — 아바타(22)와 같은 폭을 잡아 정렬을 맞춘다.
    sectionIcon: {
      width: 22,
      height: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionTitle: {
      flexShrink: 1,
    },
    // 헤더 이름과 count 사이 점선 리더(웹코어).
    sectionLeader: {
      flex: 1,
      minWidth: 12,
      marginHorizontal: 4,
      borderTopWidth: 1,
      borderStyle: 'dotted',
      borderTopColor: colors.border,
    },
    // 섹션 재정렬 그립 — count 뒤 조용한 핸들.
    gripButton: {
      marginLeft: 8,
      paddingHorizontal: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardRow: {
      flexDirection: 'row',
      gap: GUTTER,
      paddingHorizontal: H_PAD,
      marginBottom: GUTTER,
    },
    // "+추가" ghost 카드 — 점선 보더(빈상태/추가 어포던스 관례)·라운드 0·채움 없음.
    addCard: {
      minHeight: 120,
      borderWidth: 1,
      borderStyle: 'dotted',
      borderColor: colors.border,
      borderRadius: 0,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    addLabel: {
      letterSpacing: 0.8,
    },
    // ── 새로 만들기 모달 ──
    createLabel: {
      marginBottom: 10,
    },
    swatchRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 10,
    },
    swatchRing: {
      width: 38 + 6,
      height: 38 + 6,
      borderRadius: 0,
      borderWidth: 1,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    swatchRingActive: {
      borderColor: colors.ink,
    },
    createInput: {
      marginTop: 16,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 0,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 16,
      minHeight: 96,
      maxHeight: 200,
      textAlignVertical: 'top',
      color: colors.textPrimary,
      backgroundColor: colors.background,
    },
    // ── 액션 시트(채팅과 동일 문법) ──
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
    sheetIcon: {
      marginRight: 12,
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
