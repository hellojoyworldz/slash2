import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { Message } from './api';
import { useAuth } from './auth';
import { MessageActionMenu } from './components/MessageActionMenu';
import { MessageEditModal } from './components/MessageEditModal';
import { TagPickerModal } from './components/TagPickerModal';

// 메시지 액션 3종(⋮ 메뉴 · 태그 선택 · 내용 수정)을 루트에 상주시킨다.
// 이유: 예전엔 이 모달들을 화면(ChatScreen·ListBoardScreen) 안에서 렌더해, 데스크톱
// 3패널에서 대화 패널/목록 패널만 검정 오버레이로 덮여 "분류 편집 모달은 전체를 덮는데
// 얘들은 패널만 덮는다"는 통일성 문제가 있었다(CategoryEditProvider·NotifyHost는 이미 루트 상주).
// 루트로 올리면 어느 레이아웃이든 항상 전체 화면 스크림이 되고, 900px 트리 스왑에도 살아남는다.
// 시각 문법(ModalCard 스크림·카드)은 그대로 — 위치만 루트로 옮겼다.
//
// 흐름: 화면은 openMessageMenu(payload) 하나만 부른다. 메뉴에서 "태그"·"내용 수정"을 고르면
// 이 호스트가 같은 메시지로 태그/수정 모달로 전환한다(step). 복사·공유·공지·분류변경·삭제 같은
// 화면 고유 효과는 payload의 콜백으로 위임하고, 목록 갱신(onSaved)·태그캐시 갱신(onTagsChanged)도
// 콜백으로 배선한다. 분류 변경(onEditCategory)은 화면의 바텀시트를 여는 콜백이다.

export interface MessageMenuPayload {
  /** 액션 대상 메시지. */
  message: Message;
  /** 이 메시지가 현재 방의 공지인지(메뉴 라벨·토글 방향). */
  isNotice: boolean;
  /** 복사(클립보드). */
  onCopy: () => void;
  /** 공유(네이티브 Share / 웹 navigator.share). */
  onShare: () => void;
  /** 공지 토글. */
  onNotice: () => void;
  /** 분류 변경 — 화면의 분류 선택 바텀시트를 연다. */
  onEditCategory: () => void;
  /** 삭제(확인 후). */
  onDelete: () => void;
  /** 태그 저장·내용 수정 성공 시 최신 메시지로 목록/상세를 갱신한다. */
  onSaved: (updated: Message) => void;
  /** 전역 태그 목록이 바뀌면(생성·수정·삭제) 호출 — 호출부의 태그명 캐시 갱신. */
  onTagsChanged: () => void;
}

// 어느 모달을 보여줄지. 'menu' 시작 → 'tags'/'edit'로 전환, 닫으면 세션 자체가 null.
type Step = 'menu' | 'tags' | 'edit';

interface Session extends MessageMenuPayload {
  step: Step;
}

interface OpenApi {
  openMessageMenu: (payload: MessageMenuPayload) => void;
}

// 화면이 쓰는 open API는 안정 참조(리렌더 안 유발). 세션 상태는 호스트만 구독한다.
const OpenContext = createContext<OpenApi | null>(null);
const SessionContext = createContext<{
  session: Session | null;
  setSession: (s: Session | null) => void;
} | null>(null);

export function MessageActionsProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const openMessageMenu = useCallback((payload: MessageMenuPayload) => {
    setSession({ ...payload, step: 'menu' });
  }, []);
  // open은 안정 참조 → 이걸 구독하는 화면들은 세션 변화에 리렌더되지 않는다.
  const openValue = useMemo(() => ({ openMessageMenu }), [openMessageMenu]);
  // 세션 상태는 호스트(SessionContext 구독자)만 리렌더. children은 같은 참조라 bail out.
  const sessionValue = useMemo(() => ({ session, setSession }), [session]);
  return (
    <OpenContext.Provider value={openValue}>
      <SessionContext.Provider value={sessionValue}>
        {children}
      </SessionContext.Provider>
    </OpenContext.Provider>
  );
}

// 루트(Shell)에서 NotifyHost 바로 앞에 마운트한다. NotifyHost가 뒤(위)라
// 태그 삭제 확인 다이얼로그가 태그 모달 위에 정상적으로 뜬다.
export function MessageActionsHost() {
  const ctx = useContext(SessionContext);
  const { token } = useAuth();
  if (!ctx) {
    throw new Error('MessageActionsHost는 MessageActionsProvider 안에서만 쓸 수 있습니다');
  }
  const { session, setSession } = ctx;

  const close = () => setSession(null);
  // 메뉴에서 화면 고유 액션(복사·공유·공지·분류변경·삭제)은 메뉴를 닫고 콜백을 실행한다.
  const runAndClose = (fn: () => void) => {
    setSession(null);
    fn();
  };
  const goStep = (step: Step) =>
    setSession(session ? { ...session, step } : null);

  return (
    <>
      <MessageActionMenu
        visible={session?.step === 'menu'}
        onClose={close}
        onCopy={() => runAndClose(() => session?.onCopy())}
        onShare={() => runAndClose(() => session?.onShare())}
        onNotice={() => runAndClose(() => session?.onNotice())}
        isNotice={!!session?.isNotice}
        onTags={() => goStep('tags')}
        onEditContent={() => goStep('edit')}
        onEditCategory={() => runAndClose(() => session?.onEditCategory())}
        onDelete={() => runAndClose(() => session?.onDelete())}
      />

      <TagPickerModal
        visible={session?.step === 'tags'}
        token={token}
        message={session?.message ?? null}
        onClose={close}
        onTagsChanged={() => session?.onTagsChanged()}
        onSaved={(updated) => session?.onSaved(updated)}
      />

      <MessageEditModal
        visible={session?.step === 'edit'}
        token={token}
        message={session?.message ?? null}
        onClose={close}
        onSaved={(updated) => session?.onSaved(updated)}
      />
    </>
  );
}

export function useMessageActions(): OpenApi {
  const value = useContext(OpenContext);
  if (!value) {
    throw new Error('useMessageActions는 MessageActionsProvider 안에서만 쓸 수 있습니다');
  }
  return value;
}
