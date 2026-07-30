import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { api, Friend, Message } from './api';
import { useAuth } from './auth';
import { useCategoryEdit } from './category-edit';
import { CategoryPickerModal } from './components/CategoryPickerModal';
import { MessageActionMenu } from './components/MessageActionMenu';
import { TagPickerModal } from './components/TagPickerModal';
import { notify } from './notify';
import { useTagCreate } from './tag-create';

// 메시지 액션(⋮ 메뉴 · 태그 선택)을 루트에 상주시킨다.
// 이유: 예전엔 이 모달들을 화면(ChatScreen·ListBoardScreen) 안에서 렌더해, 데스크톱
// 3패널에서 대화 패널/목록 패널만 검정 오버레이로 덮여 "분류 편집 모달은 전체를 덮는데
// 얘들은 패널만 덮는다"는 통일성 문제가 있었다(CategoryEditProvider·NotifyHost는 이미 루트 상주).
// 루트로 올리면 어느 레이아웃이든 항상 전체 화면 스크림이 되고, 900px 트리 스왑에도 살아남는다.
// 시각 문법(ModalCard 스크림·카드)은 그대로 — 위치만 루트로 옮겼다.
//
// 흐름: 화면은 openMessageMenu(payload) 하나만 부른다. 메뉴에서 "태그"를 고르면 이 호스트가
// 같은 메시지로 태그 모달로 전환한다(step). "내용 수정"은 별도 모달을 열지 않고, payload의
// onEditContent 콜백으로 화면에 위임한다 — 화면은 상세 모달(message-detail.tsx)을
// startInEdit로 여는 동일한 경로를 쓴다("내용 수정" 진입을 상세 모달 하나로 통일).
// 복사·공유·공지·삭제 같은 화면 고유 효과도 payload의 콜백으로 위임하고,
// 목록 갱신(onSaved)·태그캐시 갱신(onTagsChanged)도 콜백으로 배선한다.
// 분류 변경은 태그와 같은 패턴(step)으로 이 호스트가 분류 선택 모달로 전환한다. 화면은
// 선택지(friends·selfColor)와 적용 결과 반영 콜백(onCategoryChanged)만 payload로 넘긴다
// — PATCH는 모달이 직접 수행한다(TagPickerModal이 태그 저장을 직접 하는 것과 동일).

export interface MessageMenuPayload {
  /** 액션 대상 메시지. */
  message: Message;
  /** 이 메시지가 현재 방의 공지인지(메뉴 라벨·토글 방향). */
  isNotice: boolean;
  /** 상세보기 — 채팅형은 메시지 상세 모달, 목록형은 카드 상세 패널을 연다. */
  onDetail: () => void;
  /** 복사(클립보드). */
  onCopy: () => void;
  /** 공유(네이티브 Share / 웹 navigator.share). */
  onShare: () => void;
  /** 공지 토글. */
  onNotice: () => void;
  /** 내용 수정 — 화면이 상세 모달(message-detail.tsx)을 startInEdit로 연다. */
  onEditContent: () => void;
  /** 삭제(확인 후). */
  onDelete: () => void;
  /** 태그 저장·내용 수정 성공 시 최신 메시지로 목록/상세를 갱신한다. */
  onSaved: (updated: Message) => void;
  /** 전역 태그 목록이 바뀌면(생성·수정·삭제) 호출 — 호출부의 태그명 캐시 갱신. */
  onTagsChanged: () => void;
  /** 분류 선택 모달에 보여줄 분류 목록(화면이 로드한 것). */
  friends: Friend[];
  /** 분류 선택 모달 "전체(미분류)" 행 아바타 색(전체 프로필 색). */
  selfColor: string | null;
  /** 분류 변경(PATCH friendId) 성공 시 최신 메시지로 화면 목록/상세를 갱신한다.
   *  적용 규칙은 화면마다 다르다(채팅형은 분류 방을 벗어나면 목록에서 빠짐). */
  onCategoryChanged: (updated: Message) => void;
  /** 분류 선택 모달에서 새 분류를 만들면 호출 — 화면이 자기 분류 목록을 다시 로드(bumpRooms). */
  onFriendsChanged: () => void;
}

// 어느 모달을 보여줄지. 'menu' 시작 → 'tags'/'category'로 전환, 닫으면 세션 자체가 null.
// 내용 수정은 step이 아니라 onEditContent 콜백으로 화면에 위임한다(상세 모달 통일).
type Step = 'menu' | 'tags' | 'category';

// 메뉴 경유 없이 픽커를 직접 여는 최소 페이로드 — 상세 모달 메타 블록의 연필이 쓴다.
// (기존 step('category'/'tags')과 모달을 그대로 재사용하고, 필요한 필드만 넘긴다.)
export interface CategoryPickerPayload {
  message: Message;
  /** 분류 선택 모달에 보여줄 분류 목록. */
  friends: Friend[];
  /** "전체(미분류)" 행 아바타 색. */
  selfColor: string | null;
  /** 분류 변경 PATCH 성공 시 최신 메시지로 반영(보기 모드 — 픽커가 직접 PATCH). */
  onChanged?: (updated: Message) => void;
  /** 새 분류 생성으로 전역 분류가 바뀌면 호출. */
  onFriendsChanged: () => void;
  /** 수정 모드 스테이징: true면 [저장]이 PATCH 대신 고른 friendId를 onPicked로 돌려주고 닫는다. */
  staged?: boolean;
  /** 스테이징 모드 [저장] 시 고른 분류(friendId|null)를 호출자에게 돌려준다. */
  onPicked?: (friendId: string | null) => void;
}

export interface TagPickerPayload {
  message: Message;
  /** 태그 변경 PATCH 성공 시 최신 메시지로 반영(보기 모드 — 픽커가 직접 PATCH). */
  onSaved?: (updated: Message) => void;
  /** 전역 태그가 바뀌면(생성) 호출 — 호출부 태그 캐시 갱신. */
  onTagsChanged: () => void;
  /** 수정 모드 스테이징: true면 [저장]이 PATCH 대신 고른 tagIds를 onPicked로 돌려주고 닫는다. */
  staged?: boolean;
  /** 스테이징 모드 [저장] 시 고른 태그 목록을 호출자에게 돌려준다. */
  onPicked?: (tagIds: string[]) => void;
}

// 세션은 메뉴 열기(전 필드)와 직접 픽커 열기(부분 필드)를 모두 담아야 하므로,
// 메뉴 전용 콜백들은 옵셔널이다. 호스트는 각 step에서 필요한 필드만 읽는다.
interface Session {
  step: Step;
  message: Message;
  isNotice?: boolean;
  onDetail?: () => void;
  onCopy?: () => void;
  onShare?: () => void;
  onNotice?: () => void;
  onEditContent?: () => void;
  onDelete?: () => void;
  onSaved?: (updated: Message) => void;
  onTagsChanged?: () => void;
  friends?: Friend[];
  selfColor?: string | null;
  onCategoryChanged?: (updated: Message) => void;
  onFriendsChanged?: () => void;
  // 수정 모드 스테이징 픽커 — [저장]이 PATCH 대신 고른 값을 호출자에게 돌려준다.
  staged?: boolean;
  onPickedFriend?: (friendId: string | null) => void;
  onPickedTags?: (tagIds: string[]) => void;
}

interface OpenApi {
  openMessageMenu: (payload: MessageMenuPayload) => void;
  /** 상세 모달 연필 등 메뉴 경유 없이 분류 픽커를 바로 연다. */
  openCategoryPicker: (payload: CategoryPickerPayload) => void;
  /** 상세 모달 연필 등 메뉴 경유 없이 태그 픽커를 바로 연다. */
  openTagPicker: (payload: TagPickerPayload) => void;
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
  const openCategoryPicker = useCallback((payload: CategoryPickerPayload) => {
    setSession({
      step: 'category',
      message: payload.message,
      friends: payload.friends,
      selfColor: payload.selfColor,
      onCategoryChanged: payload.onChanged,
      onFriendsChanged: payload.onFriendsChanged,
      staged: payload.staged,
      onPickedFriend: payload.onPicked,
    });
  }, []);
  const openTagPicker = useCallback((payload: TagPickerPayload) => {
    setSession({
      step: 'tags',
      message: payload.message,
      onSaved: payload.onSaved,
      onTagsChanged: payload.onTagsChanged,
      staged: payload.staged,
      onPickedTags: payload.onPicked,
    });
  }, []);
  // open은 안정 참조 → 이걸 구독하는 화면들은 세션 변화에 리렌더되지 않는다.
  const openValue = useMemo(
    () => ({ openMessageMenu, openCategoryPicker, openTagPicker }),
    [openMessageMenu, openCategoryPicker, openTagPicker],
  );
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
  const { t } = useTranslation();
  const ctx = useContext(SessionContext);
  // 선택 픽커 "전체" 행 — 분류 부제(selfDescription)·태그 전체 색/부제(tagAll*)를 auth에서 직접 읽는다.
  const { token, selfDescription, tagAllColor, tagAllDescription } = useAuth();
  // 선택 픽커 행 스와이프 [수정] → 루트 상주 편집 폼(분류=색·프로필, 태그=이름·설명·색)을 픽커 위에 연다.
  // 관리 모드 픽커(category-edit·tag-create 호스트)가 쓰는 것과 같은 경로를 선택 모드에도 이관.
  // "전체" 행은 self 프로필 편집(open({self:true})) / 태그 전체 프로필 편집(openTagAllEdit)으로 연다.
  const { open: openCategoryEditor } = useCategoryEdit();
  const { openTagAdd, openTagRename, openTagAllEdit } = useTagCreate();
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

  // 미리보기 다시 불러오기 — 링크 메시지 전용. 메뉴를 닫고 서버에 재언퍼얼을 요청한 뒤,
  // 성공하면 onSaved로 목록/상세를 조용히 갱신한다(기존 수정 저장 후 갱신 문법 미러링).
  // 실패는 조용히 알림만.
  const refreshPreview = () => {
    const msg = session?.message;
    const onSaved = session?.onSaved;
    setSession(null);
    if (!token || !msg) return;
    api
      .refreshMessagePreview(token, msg.id)
      .then((updated) => onSaved?.(updated))
      .catch(() => notify(t('common.notice'), t('chat.tryAgainLater')));
  };

  return (
    <>
      <MessageActionMenu
        visible={session?.step === 'menu'}
        onClose={close}
        onDetail={() => runAndClose(() => session?.onDetail?.())}
        onCopy={() => runAndClose(() => session?.onCopy?.())}
        onShare={() => runAndClose(() => session?.onShare?.())}
        onNotice={() => runAndClose(() => session?.onNotice?.())}
        isNotice={!!session?.isNotice}
        onTags={() => goStep('tags')}
        onEditContent={() => runAndClose(() => session?.onEditContent?.())}
        onEditCategory={() => goStep('category')}
        onRefreshPreview={refreshPreview}
        canRefreshPreview={session?.message?.kind === 'link'}
        onDelete={() => runAndClose(() => session?.onDelete?.())}
      />

      <TagPickerModal
        visible={session?.step === 'tags'}
        token={token}
        message={session?.message ?? null}
        onClose={close}
        onTagsChanged={() => session?.onTagsChanged?.()}
        onSaved={(updated) => session?.onSaved?.(updated)}
        staged={session?.staged}
        onPicked={(tagIds) => session?.onPickedTags?.(tagIds)}
        // 행 스와이프 [수정] — 태그 이름·설명·색 폼(관리 모드와 같은 경로). 저장 시 bumpRooms로 목록 갱신.
        onEditTag={openTagRename}
        // 타이틀 [+] — 같은 폼의 추가 모드(관리 픽커와 같은 경로). 선택 픽커 위에 뜬다
        // (루트 마운트 순서: MessageActionsHost < TagCreateHost).
        onAddTag={openTagAdd}
        // "전체" 행 — 태그 전체 프로필 색/부제 + 스와이프 [수정](태그 전체 프로필 편집 폼).
        tagAllColor={tagAllColor}
        tagAllDescription={tagAllDescription}
        onEditTagAll={openTagAllEdit}
      />

      <CategoryPickerModal
        visible={session?.step === 'category'}
        token={token}
        message={session?.message ?? null}
        friends={session?.friends ?? []}
        selfColor={session?.selfColor ?? null}
        selfDescription={selfDescription}
        onClose={close}
        onChanged={(updated) => session?.onCategoryChanged?.(updated)}
        onFriendsChanged={() => session?.onFriendsChanged?.()}
        staged={session?.staged}
        onPicked={(friendId) => session?.onPickedFriend?.(friendId)}
        // 행 스와이프 [수정] — 분류 색·프로필 편집 폼(관리 모드와 같은 경로).
        onEditFriend={(friend) => openCategoryEditor(friend)}
        // 타이틀 [+] — 같은 폼의 추가 모드(관리 픽커와 같은 경로). 선택 픽커 위에 뜬다
        // (루트 마운트 순서: MessageActionsHost < CategoryEditHost).
        onAddFriend={(onCreated, defaultColor) =>
          openCategoryEditor(undefined, defaultColor, onCreated)
        }
        // "전체" 행 스와이프 [수정] — self 프로필 편집 폼.
        onEditSelf={() => openCategoryEditor({ self: true })}
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
