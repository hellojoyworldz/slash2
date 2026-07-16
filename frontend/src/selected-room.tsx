import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

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

interface SelectedRoomState {
  room: SelectedRoom | null;
  setRoom: (room: SelectedRoom | null) => void;
  /** 방 목록에 영향 주는 변경(전송·삭제·분류)의 카운터 — 목록 새로고침 신호 */
  roomsVersion: number;
  bumpRooms: () => void;
  /** 현재 방의 채팅 draft를 저장(덮어쓰기). ref라 리렌더를 일으키지 않는다. */
  saveChatDraft: (draft: ChatDraft) => void;
  /** roomKey가 일치할 때만 draft를 돌려준다. 아니면 null(빈 상태로 시작). */
  readChatDraft: (roomKey: string) => ChatDraft | null;
}

const SelectedRoomContext = createContext<SelectedRoomState | null>(null);

export function SelectedRoomProvider({ children }: { children: ReactNode }) {
  const [room, setRoom] = useState<SelectedRoom | null>(null);
  const [roomsVersion, setRoomsVersion] = useState(0);
  const bumpRooms = useCallback(() => setRoomsVersion((v) => v + 1), []);

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
      roomsVersion,
      bumpRooms,
      saveChatDraft,
      readChatDraft,
    }),
    [room, roomsVersion, bumpRooms, saveChatDraft, readChatDraft],
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
