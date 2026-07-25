import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api, AutoKind, Message, MessageLink, Tag } from './api';
import { useAuth } from './auth';

// ── 비동기 링크 미리보기(언퍼얼) 폴링 ────────────────────────────────────────
// 백엔드가 링크 메시지를 언퍼얼 없이 즉시 저장·응답하고(카톡식), 저장 직후 백그라운드로 og를 채운다.
// 전송 직후엔 links 원소의 og류가 비어 있으므로, 그 메시지를 백오프로 재조회해 채워지면 목록에 교체한다.
// 백오프 스케줄(ms) — 그래도 비면 중단(수동 "미리보기 다시 불러오기"가 있으니).
const POLL_DELAYS = [1500, 3000, 5000, 8000];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// 링크 원소가 og(제목·설명·이미지·사이트명)나 자동구분(linkType) 중 하나라도 갖췄으면 "채워짐".
function linkHasPreview(l: MessageLink): boolean {
  return !!(l.ogTitle || l.ogDescription || l.ogImage || l.siteName || l.linkType);
}
function countFilledLinks(m: Message): number {
  return (m.links ?? []).filter(linkHasPreview).length;
}
// 링크 메시지인데 아직 채워지지 않은 링크 원소가 하나라도 있으면 "미리보기 대기".
// (전송 직후엔 모든 원소가 빈 상태 → 대기. 차단 링크는 끝내 대기로 남지만 폴링이 스케줄 소진 후 멈춘다.)
export function isPreviewPending(m: Message): boolean {
  if (m.kind !== 'link' || !m.links || m.links.length === 0) return false;
  return m.links.some((l) => !linkHasPreview(l));
}

// 데스크톱 스플릿뷰에서 오른쪽 패널이 보여줄 방.
// null = "전체" (기본 방). 모바일에서는 사용하지 않는다(라우팅으로 이동).
export interface SelectedRoom {
  friendId: string;
  name: string;
}

// 채팅 화면의 "휘발성 UI 상태"(검색 열림 여부·검색어·입력 draft)를 루트에 보관한다.
// 900px 트리 스왑 시 ChatScreen 인스턴스가 통째로 unmount돼도 살아남게 하기 위함.
// 단일 슬롯 + roomKey 태깅: 다른 방으로 바뀌면 새 방이 자기 draft로 덮어써서
// 방 전환 때는 복원되지 않는다(=기존 "방 바꾸면 초기화" 동작을 그대로 유지).
export interface ChatDraft {
  roomKey: string;
  searchOpen: boolean;
  searchText: string;
  input: string;
  inputHeight: number;
}

// 분류 탭(FriendsScreen) 상단 캡슐이 고른 리스트. 900px 트리 스왑에도 살아남아야 하므로
// 화면 로컬 useState가 아니라 루트에 둔다(검색·입력 draft와 같은 원리).
export type ClassifyTab = 'friends' | 'tags' | 'auto';

// 데스크톱 3패널에서 오른쪽 상세 패널이 방(ChatScreen) 대신 보여주는 "정보 문서".
// 현재는 오픈소스 라이선스뿐. 방 선택(room/tag/auto)과 달리 이걸 켜도 방 선택은 지우지 않아,
// 닫으면(setInfoScreen(null)) 직전 방으로 돌아온다. 개인정보처리방침·이용약관은 여기 없다 —
// 그 둘은 (tabs) 밖 최상위 단독 페이지라 3패널 셸과 무관하다.
export type InfoScreen = 'licenses';

interface SelectedRoomState {
  room: SelectedRoom | null;
  setRoom: (room: SelectedRoom | null) => void;
  /** 데스크톱 오른쪽 패널이 자동구분 방을 보여줄 때의 종류. null이면 일반 방(room)을 보여준다. */
  autoKind: AutoKind | null;
  setAutoKind: (kind: AutoKind | null) => void;
  /** 데스크톱 오른쪽 패널이 태그 방을 보여줄 때의 태그. null이면 태그 방 아님.
   *  렌더 우선순위: tagAll > autoAll > tag > autoKind > room(일반). */
  tag: Tag | null;
  setTag: (tag: Tag | null) => void;
  /** 데스크톱 오른쪽 패널이 "태그 전체" 방(태그 하나 이상 달린 메시지 모음, 보기 전용)을 보여주는지. */
  tagAll: boolean;
  /** true면 태그 전체 방 선택(다른 방 선택 해제). false면 그 선택만 해제. */
  setTagAll: (v: boolean) => void;
  /** 데스크톱 오른쪽 패널이 "자동구분 전체" 방(링크가 하나라도 잡힌 메시지 모음, 보기 전용)을 보여주는지. */
  autoAll: boolean;
  /** true면 자동구분 전체 방 선택(다른 방 선택 해제). false면 그 선택만 해제. */
  setAutoAll: (v: boolean) => void;
  /** 방 목록에 영향 주는 변경(전송·삭제·분류)의 카운터 — 목록 새로고침 신호 */
  roomsVersion: number;
  bumpRooms: () => void;
  /** 기기 간 실시간 동기화(SSE) 전용 신호 카운터. 서버 이벤트를 받았을 때만 올라간다.
   *  roomsVersion과 분리한 이유: roomsVersion은 로컬 편집(색·고정 등)에도 자주 흔들려서
   *  열린 상세 화면(ChatScreen/ListBoardScreen)이 매번 메시지를 재조회하면 낭비다.
   *  syncVersion은 "원격에서 데이터가 실제로 바뀌었다"는 신호만 담아, 상세 화면이 그때만
   *  조용히(로딩 스피너 없이) 메시지를 재조회하게 한다. */
  syncVersion: number;
  bumpSync: () => void;
  /** 분류 탭 상단 캡슐이 고른 리스트(분류/태그/자동구분). 900px 스왑에도 살아남는다. */
  classifyTab: ClassifyTab;
  setClassifyTab: (tab: ClassifyTab) => void;
  /** 데스크톱 오른쪽 패널이 방 대신 정보 문서(라이선스)를 보여줄 때의 종류. null이면 방을 보여준다.
   *  최우선 렌더: infoScreen > tagAll > autoAll > tag > autoKind > room. 방 선택은 보존한다(닫으면 복귀). */
  infoScreen: InfoScreen | null;
  setInfoScreen: (v: InfoScreen | null) => void;
  /** 현재 방의 채팅 draft를 저장(덮어쓰기). ref라 리렌더를 일으키지 않는다. */
  saveChatDraft: (draft: ChatDraft) => void;
  /** roomKey가 일치할 때만 draft를 돌려준다. 아니면 null(빈 상태로 시작). */
  readChatDraft: (roomKey: string) => ChatDraft | null;
  /** 링크 메시지를 방금 보냈을 때 호출 — 미리보기 대기 상태면 백오프로 재조회해서
   *  채워지면 subscribePreview 구독자에게 갱신 메시지를 흘린다. 대기 아니면 no-op.
   *  화면 로컬이 아닌 루트에 있어 900px 트리 스왑 중에도 폴링이 죽지 않는다. */
  pollPreview: (message: Message) => void;
  /** 폴링으로 채워진 미리보기 갱신 메시지를 받는다. 반환값으로 구독 해제. 화면은 이걸로 목록의 그 메시지를 교체. */
  subscribePreview: (cb: (updated: Message) => void) => () => void;
}

const SelectedRoomContext = createContext<SelectedRoomState | null>(null);

export function SelectedRoomProvider({ children }: { children: ReactNode }) {
  const [room, setRoomState] = useState<SelectedRoom | null>(null);
  // 오른쪽 패널은 한 번에 하나만 보여준다: 일반 방을 고르면 자동구분·태그 선택을 해제하고,
  // 자동구분/태그를 고르면 렌더 우선순위(tag > autoKind > room)로 그 방을 띄운다.
  const [autoKind, setAutoKindState] = useState<AutoKind | null>(null);
  const [tag, setTagState] = useState<Tag | null>(null);
  // "전체" 방(태그/자동구분 통합, 보기 전용)은 개별 선택과 상호배타 — 각 setter가 서로를 해제한다.
  const [tagAll, setTagAllState] = useState(false);
  const [autoAll, setAutoAllState] = useState(false);
  // 정보 문서(라이선스)는 방 선택보다 우선 렌더된다. 방을 고르면 정보 문서를 닫아
  // 오른쪽 패널이 그 방으로 넘어가게 한다(반대 방향은 setInfoScreen이 방을 보존).
  const [infoScreen, setInfoScreenState] = useState<InfoScreen | null>(null);
  const setRoom = useCallback((next: SelectedRoom | null) => {
    setRoomState(next);
    setAutoKindState(null);
    setTagState(null);
    setTagAllState(false);
    setAutoAllState(false);
    setInfoScreenState(null);
  }, []);
  // 자동구분을 고르면 태그·전체 선택을 해제한다(우선순위 충돌 방지).
  const setAutoKind = useCallback((kind: AutoKind | null) => {
    setAutoKindState(kind);
    setTagState(null);
    setTagAllState(false);
    setAutoAllState(false);
    setInfoScreenState(null);
  }, []);
  // 태그를 고르면 자동구분·전체 선택을 해제한다.
  const setTag = useCallback((next: Tag | null) => {
    setTagState(next);
    setAutoKindState(null);
    setTagAllState(false);
    setAutoAllState(false);
    setInfoScreenState(null);
  }, []);
  // 태그 전체 방 선택(true) — 다른 모든 방 선택을 해제한다. false면 그 선택만 끈다(전체 방에서 나감).
  const setTagAll = useCallback((v: boolean) => {
    setTagAllState(v);
    if (v) {
      setTagState(null);
      setAutoKindState(null);
      setAutoAllState(false);
      setRoomState(null);
      setInfoScreenState(null);
    }
  }, []);
  // 자동구분 전체 방 선택(true) — 다른 모든 방 선택을 해제한다. false면 그 선택만 끈다.
  const setAutoAll = useCallback((v: boolean) => {
    setAutoAllState(v);
    if (v) {
      setTagState(null);
      setAutoKindState(null);
      setTagAllState(false);
      setRoomState(null);
      setInfoScreenState(null);
    }
  }, []);
  // 정보 문서 열기/닫기 — 방 선택은 건드리지 않는다. 닫으면(null) 오른쪽 패널이 직전 방으로 복귀.
  const setInfoScreen = useCallback((v: InfoScreen | null) => {
    setInfoScreenState(v);
  }, []);
  const [roomsVersion, setRoomsVersion] = useState(0);
  const bumpRooms = useCallback(() => setRoomsVersion((v) => v + 1), []);
  const [syncVersion, setSyncVersion] = useState(0);
  const bumpSync = useCallback(() => setSyncVersion((v) => v + 1), []);
  const [classifyTab, setClassifyTab] = useState<ClassifyTab>('friends');

  // 비동기 미리보기 폴링. token은 ref로 최신값을 읽어(로그인/로그아웃 시 갱신) value 메모를 흔들지 않는다.
  const { token } = useAuth();
  const tokenRef = useRef(token);
  tokenRef.current = token;
  // 폴링 완료 메시지를 화면에 흘리는 구독자 집합(화면이 마운트/언마운트되며 등록·해제).
  const previewSubsRef = useRef<Set<(m: Message) => void>>(new Set());
  // 진행 중인 폴링(messageId → 취소 플래그) — 같은 메시지 중복 폴링 방지.
  const activePollsRef = useRef<Map<string, { cancelled: boolean }>>(new Map());

  const subscribePreview = useCallback((cb: (m: Message) => void) => {
    previewSubsRef.current.add(cb);
    return () => {
      previewSubsRef.current.delete(cb);
    };
  }, []);

  const publishPreview = useCallback((m: Message) => {
    for (const cb of previewSubsRef.current) cb(m);
  }, []);

  const pollPreview = useCallback(
    (message: Message) => {
      if (!isPreviewPending(message)) return;
      const id = message.id;
      // 이미 이 메시지를 폴링 중이면(예: 재전송/중복 호출) 새로 시작하지 않는다.
      if (activePollsRef.current.has(id)) return;
      const control = { cancelled: false };
      activePollsRef.current.set(id, control);
      let filledSeen = countFilledLinks(message);
      void (async () => {
        try {
          for (let i = 0; i < POLL_DELAYS.length; i++) {
            await sleep(POLL_DELAYS[i]);
            if (control.cancelled) return;
            const tk = tokenRef.current;
            if (!tk) return;
            let fetched: Message;
            try {
              fetched = await api.getMessage(tk, id);
            } catch {
              // 단건 조회 실패(일시 오류·삭제로 인한 404 등)는 다음 시도로 넘어가고, 스케줄이 끝나면 멈춘다.
              continue;
            }
            if (control.cancelled) return;
            // 새로 채워진 링크가 생겼으면 그 갱신본을 화면에 흘린다(부분 채움도 반영).
            const filled = countFilledLinks(fetched);
            if (filled > filledSeen) {
              filledSeen = filled;
              publishPreview(fetched);
            }
            // 더 이상 대기 링크가 없으면(전부 채워짐) 종료. 남았으면 다음 백오프로 재시도.
            if (!isPreviewPending(fetched)) return;
          }
        } finally {
          activePollsRef.current.delete(id);
        }
      })();
    },
    [publishPreview],
  );

  // draft는 화면 마운트 시 1회만 읽으므로 state가 아니라 ref에 둔다.
  // (검색어·입력 키 입력마다 루트가 리렌더되면 앱 전체가 다시 그려지니 방지)
  const chatDraftRef = useRef<ChatDraft | null>(null);
  const saveChatDraft = useCallback((draft: ChatDraft) => {
    chatDraftRef.current = draft;
  }, []);
  const readChatDraft = useCallback((roomKey: string): ChatDraft | null => {
    const draft = chatDraftRef.current;
    return draft && draft.roomKey === roomKey ? draft : null;
  }, []);

  const value = useMemo(
    () => ({
      room,
      setRoom,
      autoKind,
      setAutoKind,
      tag,
      setTag,
      tagAll,
      setTagAll,
      autoAll,
      setAutoAll,
      roomsVersion,
      bumpRooms,
      syncVersion,
      bumpSync,
      classifyTab,
      setClassifyTab,
      infoScreen,
      setInfoScreen,
      saveChatDraft,
      readChatDraft,
      pollPreview,
      subscribePreview,
    }),
    [
      room,
      setRoom,
      autoKind,
      setAutoKind,
      tag,
      setTag,
      tagAll,
      setTagAll,
      autoAll,
      setAutoAll,
      roomsVersion,
      bumpRooms,
      syncVersion,
      bumpSync,
      classifyTab,
      setClassifyTab,
      infoScreen,
      setInfoScreen,
      saveChatDraft,
      readChatDraft,
      pollPreview,
      subscribePreview,
    ],
  );
  return (
    <SelectedRoomContext.Provider value={value}>
      {children}
    </SelectedRoomContext.Provider>
  );
}

export function useSelectedRoom(): SelectedRoomState {
  const value = useContext(SelectedRoomContext);
  if (!value) {
    throw new Error('useSelectedRoom은 SelectedRoomProvider 안에서만 쓸 수 있습니다');
  }
  return value;
}
