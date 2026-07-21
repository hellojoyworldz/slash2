import {
  createContext,
  Dispatch,
  ReactNode,
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  BackHandler,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Megaphone, Pencil } from 'lucide-react-native';
import { api, Friend, Message } from './api';
import { useAuth } from './auth';
import { useMessageActions } from './message-actions';
import { Button } from './components/Button';
import { LinkCard } from './components/LinkCard';
import { Text } from './components/Text';
import { notify } from './notify';
import { effectiveLinks, splitSegments } from './message-segments';

// 웹에서 DOM textarea를 직접 찾기 위한 id (nativeID → id 속성).
const EDIT_INPUT_ID = 'message-detail-edit-input';

// 수정 진입 시 textarea 높이 근사치 — 개행 수 기준(줄바꿈이 만드는 줄만 센다, 래핑은 무시).
// 진입 프레임에서 이 값으로 editHeight를 동기 시드하면 첫 페인트부터 거의 제 크기라
// "120 → 실측 성장 → 스크롤 점프"의 3단 레이아웃 스래시가 사라진다. DOM 실측(웹)·
// onContentSizeChange(네이티브)가 뒤이어 실측으로 소폭 보정하지만 눈에 띄지 않는다.
// lineHeight 22(bodyText 관례) × 줄 수 + 세로 패딩·보더 ~28, 최소 120(editInput minHeight 관례).
function estimateEditHeight(content: string): number {
  const lines = content ? content.split('\n').length : 1;
  return Math.max(120, lines * 22 + 28);
}
import { formatDateStamp, formatTime } from './time';
import { ThemeColors } from './theme';
import { useTheme } from './theme-context';

// 메시지 상세 모달(채팅형)을 루트에 상주시킨다 — 목록형 CardDetailPanel의 채팅형 버전.
// 공지 배너 탭 또는 ⋮ 메뉴의 "상세보기"에서 열린다. tag-create·message-actions와 같은
// 루트 호스트 패턴: 어느 레이아웃(모바일 탭·데스크톱 3패널)에서든 항상 전체 화면을 덮고,
// 900px 트리 스왑에도 살아남는다.
// [내용 수정]은 2중 모달(별도 MessageEditModal)을 열지 않고, 이 모달 안에서
// 본문(세그먼트 영역)을 그대로 textarea로 전환하는 인라인 편집이다(view/edit 모드 토글).
// z-order: Shell에서 MessageActionsHost·NotifyHost보다 앞(=아래)에 마운트한다 —
// 혹시 위에 뜰 확인창(NotifyHost)은 항상 최상위가 된다.

export interface MessageDetailPayload {
  /** 상세를 볼 메시지. */
  message: Message;
  /** 분류명(미분류면 호출부가 '미분류' 라벨을 넣는다). */
  categoryName: string;
  /** 분류색(hex). 메타 줄 색점에 쓴다. 없으면 표면색 점. */
  categoryColor: string | null;
  /** 이 메시지에 붙은 태그 이름들. 메타 줄에 #태그로 나열. */
  tagNames: string[];
  /** [수정] 저장 성공 시 최신 메시지로 목록을 갱신하도록 알린다(호출부의 applyUpdated 체인).
   *  메타 블록 연필의 태그 변경 PATCH 성공 시에도 이 콜백으로 목록을 동기화한다. */
  onSaved: (updated: Message) => void;
  /** true면 열릴 때부터 인라인 수정 모드로 시작(프리필 포함). ⋮ 메뉴 [내용 수정]이 쓴다 —
   *  별도 수정 모달 없이 이 상세 모달 하나로 "내용 수정" 진입을 통일한다. */
  startInEdit?: boolean;
  // ── 메타 블록 연필(분류·태그 인라인 편집)용 ──
  /** 분류 픽커에 넘길 분류 목록(화면이 로드한 것). */
  friends: Friend[];
  /** 분류 픽커 "전체(미분류)" 행 아바타 색. */
  selfColor: string | null;
  /** 갱신된 메시지에서 메타(분류명·색·태그명)를 다시 파생 — 픽커 변경을 상세에 즉시 반영한다.
   *  화면의 buildDetailPayload가 friends/tags/selfColor를 클로저로 캡처해 넘긴다. */
  resolveMeta: (m: Message) => {
    categoryName: string;
    categoryColor: string | null;
    tagNames: string[];
  };
  /** 분류 변경 PATCH 성공 시 화면 목록 갱신(채팅형은 방 이탈 시 목록에서 빠진다). */
  onCategoryChanged: (updated: Message) => void;
  /** 새 분류 생성으로 전역 분류가 바뀌면 화면 분류 목록 재로드(bumpRooms). */
  onFriendsChanged: () => void;
  /** 전역 태그가 바뀌면(생성) 화면 태그 캐시 갱신(reloadTags). */
  onTagsChanged: () => void;
}

// 화면이 쓰는 open API는 안정 참조(리렌더 안 유발). 세션 상태는 호스트만 구독한다.
const OpenContext = createContext<{
  openMessageDetail: (payload: MessageDetailPayload) => void;
} | null>(null);
const SessionContext = createContext<{
  session: MessageDetailPayload | null;
  setSession: Dispatch<SetStateAction<MessageDetailPayload | null>>;
} | null>(null);

export function MessageDetailProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<MessageDetailPayload | null>(null);
  const openMessageDetail = useCallback(
    (payload: MessageDetailPayload) => setSession(payload),
    [],
  );
  const openValue = useMemo(() => ({ openMessageDetail }), [openMessageDetail]);
  const sessionValue = useMemo(() => ({ session, setSession }), [session]);
  return (
    <OpenContext.Provider value={openValue}>
      <SessionContext.Provider value={sessionValue}>
        {children}
      </SessionContext.Provider>
    </OpenContext.Provider>
  );
}

// 루트(Shell)에 마운트한다.
export function MessageDetailHost() {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('MessageDetailHost는 MessageDetailProvider 안에서만 쓸 수 있습니다');
  }
  const { session, setSession } = ctx;
  const { token } = useAuth();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // 메타 블록 연필 → 메뉴 경유 없이 분류/태그 픽커를 직접 연다(루트에서 이 호스트보다
  // 뒤에 마운트된 MessageActionsHost가 렌더해 상세 모달 위에 자연히 뜬다).
  const { openCategoryPicker, openTagPicker } = useMessageActions();

  // 인라인 수정 모드: 본문 세그먼트 영역이 textarea로 바뀐다(2중 모달 없음).
  // 모드는 렌더 시점에 동기 파생 — ⋮ [수정] 직행(startInEdit)은 첫 프레임부터 수정 화면이라
  // 상세가 잠깐 비쳤다 바뀌는 깜빡임이 없다. draft는 상세→[수정] 전환·타이핑 시에만 생긴다.
  const [editDraft, setEditDraft] = useState<{ id: string; text: string } | null>(
    null,
  );
  const draftValid = !!(editDraft && editDraft.id === session?.message.id);
  const editing = session ? draftValid || !!session.startInEdit : false;
  const editText = draftValid ? editDraft.text : (session?.message.content ?? '');
  const setEditText = (text: string) => {
    if (!session) return;
    setEditDraft({ id: session.message.id, text });
  };
  // 수정 textarea 높이 — 내용 크기에 맞춰 자라는 "희망 높이". 실제 렌더 높이는 flexbox가
  // 결정한다: textarea는 카드(maxHeight 88%)의 직접 자식으로 flexShrink:1 이라, 카드가 꽉 차면
  // 레이아웃 엔진이 남는 공간에 정확히 맞게 줄인다(JS 추정 없음 → 한 줄 잘림 같은 오차 0).
  // 줄어든 만큼은 textarea 자체 스크롤이 담당 — 브라우저·네이티브가 커서를 자동으로
  // 화면에 유지해서, 긴 내용 중간을 편집해도 수정 중인 줄이 항상 보인다.
  // (예전처럼 내용 전체 높이로 펼치고 바깥 ScrollView에 스크롤을 맡기면, 바깥은 커서 위치를
  // 모르는 데다 키 입력마다 DOM 높이를 0으로 접었다 재는 측정이 바깥 스크롤을 매번 맨 위로
  // 클램프시켜 "수정하는 곳이 안 보이고 최상단만 보이는" 점프가 났다. 창높이−메타−푸터를
  // JS로 계산하는 캡은 marginTop·보더 등 픽셀 오차만큼 마지막 줄이 잘렸다.)
  const [editHeight, setEditHeight] = useState(120);
  // 수정 모드 스테이징: 분류·태그는 픽커에서 골라도 DB에 즉시 쓰지 않고 여기 담았다가
  // [저장] 때 content와 함께 한 번의 PATCH로 적용한다([취소]·닫기 = 버림 → DB 무변).
  const [stagedFriendId, setStagedFriendId] = useState<string | null>(null);
  const [stagedTagIds, setStagedTagIds] = useState<string[]>([]);
  // 수정 진입을 감지하는 seed(메시지 id). 진입 프레임에서 동기적으로 editHeight를 근사값으로,
  // staged를 현재 메시지 값으로 시드한다 — 첫 페인트부터 제 크기·현재 메타라 "위로 튀었다
  // 내려오는" 점프가 없다(120→실측 성장 대신 근사→실측 소폭 보정만 남는다). 렌더 중 조건부
  // setState(React 공인 "props로 상태 조정" 패턴): editSeed 가드로 무한루프 없이 페인트 전 1회.
  const [editSeed, setEditSeed] = useState<string | null>(null);
  if (editing && session) {
    if (editSeed !== session.message.id) {
      setEditSeed(session.message.id);
      setEditHeight(estimateEditHeight(editText));
      setStagedFriendId(session.message.friendId ?? null);
      setStagedTagIds(session.message.tagIds ?? []);
    }
  } else if (editSeed !== null) {
    // 보기 모드로 돌아오거나 닫히면 seed 해제 → 다음 수정 진입 때 다시 시드한다.
    setEditSeed(null);
  }
  // 웹: RNW의 multiline TextInput은 onContentSizeChange를 신뢰할 수 없고 ref 형태도
  // 버전에 따라 달라서, nativeID(id 속성)로 DOM textarea를 직접 찾아 scrollHeight를 잰다.
  // 높이를 0으로 접었다 재야 내용이 줄어드는 편집도 따라간다. 네이티브는 onContentSizeChange 담당.
  useEffect(() => {
    if (!editing || Platform.OS !== 'web') return;
    const raf = requestAnimationFrame(() => {
      const node = document.getElementById(
        EDIT_INPUT_ID,
      ) as HTMLTextAreaElement | null;
      if (!node) return;
      // 0px로 접는 동안 내부 스크롤이 흐트러지지 않게 위치를 보존·복원한다
      // (캡에 걸려 내부 스크롤 중일 때 커서가 있던 자리를 지키는 핵심).
      const prevScroll = node.scrollTop;
      const prev = node.style.height;
      node.style.height = '0px';
      const h = node.scrollHeight;
      node.style.height = prev;
      node.scrollTop = prevScroll;
      setEditHeight(Math.max(120, h + 4));
    });
    return () => cancelAnimationFrame(raf);
  }, [editing, editText]);

  // 수정 진입 시: 커서를 내용 끝으로(웹은 프로그래매틱 포커스 시 커서가 맨 앞에 떨어짐).
  useEffect(() => {
    if (!editing || Platform.OS !== 'web') return;
    const raf = requestAnimationFrame(() => {
      const node = document.getElementById(
        EDIT_INPUT_ID,
      ) as HTMLTextAreaElement | null;
      if (node) {
        const len = node.value.length;
        node.setSelectionRange(len, len);
        // 캡에 걸려 내부 스크롤일 때도 끝(커서)이 보이게 textarea 자체를 바닥으로.
        node.scrollTop = node.scrollHeight;
      }
    });
    return () => cancelAnimationFrame(raf);
    // 세션·수정 진입 시 1회 — editText 타이핑마다 커서를 끝으로 강제하면 중간 편집이 망가진다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, session?.message.id]);

  const [busy, setBusy] = useState(false);

  // 스크림 탭·X 등 닫기 — 수정 중이어도 그냥 닫는다(취소=닫기와 동일 규칙, 사용자 확정).
  const close = useCallback(() => {
    setEditDraft(null);
    setSession(null);
  }, [setSession]);

  // 수정 취소 = 어디서 들어왔든 모달을 통째로 닫는다(상세 복귀 없음 — 사용자 확정).
  const cancelEdit = useCallback(() => {
    setEditDraft(null);
    setSession(null);
  }, [setSession]);

  // 분류 줄 연필(수정 모드 전용) → 스테이징 분류 픽커.
  // [저장]이 PATCH 대신 고른 friendId를 돌려주고(DB 미적용), 수정 [저장]에서 함께 반영된다.
  // 현재 staged 값을 실은 합성 메시지를 넘겨 픽커가 그 선택으로 초기화되게 한다.
  const editCategory = useCallback(() => {
    if (!session || !editing) return;
    const s = session;
    openCategoryPicker({
      message: { ...s.message, friendId: stagedFriendId },
      friends: s.friends,
      selfColor: s.selfColor,
      staged: true,
      onPicked: (friendId) => setStagedFriendId(friendId),
      onFriendsChanged: s.onFriendsChanged,
    });
  }, [session, editing, stagedFriendId, openCategoryPicker]);

  // 태그 줄 연필(수정 모드 전용) → 스테이징 태그 픽커.
  // [저장]이 PATCH 대신 고른 태그 목록을 돌려주고(DB 미적용), 수정 [저장]에서 함께 반영된다.
  const editTags = useCallback(() => {
    if (!session || !editing) return;
    const s = session;
    openTagPicker({
      message: { ...s.message, tagIds: stagedTagIds },
      staged: true,
      onPicked: (tagIds) => setStagedTagIds(tagIds),
      onTagsChanged: s.onTagsChanged,
    });
  }, [session, editing, stagedTagIds, openTagPicker]);

  // 세션이 바뀌면(다른 메시지로 열림) 이전 draft가 남지 않게 리셋.
  // (editHeight·staged는 수정 진입 시 seed가 현재 메시지 기준으로 다시 시드하므로 여기선 안 만진다.)
  useEffect(() => {
    setEditDraft(null);
  }, [session?.message.id]);

  // Android 하드웨어 뒤로가기: 수정 중엔 닫기가 아니라 수정 취소.
  useEffect(() => {
    if (!session) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (editing) {
        cancelEdit();
      } else {
        close();
      }
      return true;
    });
    return () => sub.remove();
  }, [session, editing, close, cancelEdit]);

  // 웹에서 Esc: 수정 중엔 닫기가 아니라 수정 취소(role dialog 관례).
  useEffect(() => {
    if (!session || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editing) {
        cancelEdit();
      } else {
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session, editing, close, cancelEdit]);

  // 본문: content를 입력 순서 그대로 [텍스트][카드]… 세그먼트로 교차 렌더.
  // (레거시 단일 링크·구 메시지는 effectiveLinks가 합성해 동일 경로.)
  const segments = useMemo(
    () =>
      session
        ? splitSegments(session.message.content, effectiveLinks(session.message))
        : [],
    [session],
  );

  const startEdit = () => {
    if (!session) return;
    // draft 생성 = 수정 모드 진입(파생). 원문 프리필.
    setEditDraft({ id: session.message.id, text: session.message.content });
  };

  const submitEdit = async () => {
    if (!session || busy || !token) return;
    const content = editText.trim();
    if (!content) return;
    setBusy(true);
    try {
      // content + 스테이징된 분류·태그를 한 번의 PATCH로 적용(백엔드 부분 의미론).
      const updated = await api.updateMessage(token, session.message.id, {
        content,
        friendId: stagedFriendId,
        tagIds: stagedTagIds,
      });
      // 분류가 바뀌었으면 onCategoryChanged 경로로(채팅형은 분류 방을 벗어나면 목록에서 빠짐),
      // 아니면 onSaved 경로로 목록·상세를 동기화한다. 둘 다 최신 메시지 하나로 갱신.
      if (stagedFriendId !== (session.message.friendId ?? null)) {
        session.onCategoryChanged(updated);
      } else {
        session.onSaved(updated);
      }
      // 저장 = 완료 → 어디서 들어왔든 모달 닫기(상세 복귀 없음 — 사용자 확정).
      setEditDraft(null);
      setSession(null);
    } catch {
      notify(t('common.notice'), t('chat.tryAgainLater'));
    } finally {
      setBusy(false);
    }
  };

  if (!session) return null;
  const { message, categoryName, categoryColor, tagNames } = session;
  // 수정 모드에서는 아직 DB 미적용인 staged 값으로 메타를 보여준다(저장해야 반영됨이 자연스럽게 보임).
  // resolveMeta로 staged friendId/tagIds → 분류명·색·#태그명을 파생한다(합성 메시지).
  const editMeta = editing
    ? session.resolveMeta({
        ...message,
        friendId: stagedFriendId,
        tagIds: stagedTagIds,
      })
    : null;
  const shownCategoryName = editMeta ? editMeta.categoryName : categoryName;
  const shownCategoryColor = editMeta ? editMeta.categoryColor : categoryColor;
  const shownTagNames = editMeta ? editMeta.tagNames : tagNames;

  return (
    <View style={styles.overlayRoot}>
      {/* 스크림 탭 = 닫기. 카드는 자기 터치를 소비해서 안 닫힌다. */}
      <Pressable
        style={styles.scrim}
        onPress={close}
        accessible={false}
        focusable={false}
      />
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
        accessibilityViewIsModal
      >
        <View
          style={styles.card}
          accessibilityLabel={t('a11y.cardDetail')}
        >
          {/* 상단 메타 블록(공지·분류·태그·일시·점선)은 스크롤 밖 — 본문이 길어도 위에 고정. */}
          <View>
            {/* 1. 공지 줄(공지일 때만): 📢 + "공지" 텍스트, 맨 위 한 줄. */}
            {message.isNotice ? (
              <View style={styles.noticeRow}>
                <Megaphone
                  size={13}
                  strokeWidth={2}
                  color={colors.textSecondary}
                />
                <Text
                  variant="micro"
                  color={colors.textSecondary}
                  numberOfLines={1}
                >
                  {t('chat.noticeTag')}
                </Text>
              </View>
            ) : null}

            {/* 2. 분류 줄: "분류:" 라벨 → 색네모 → 이름 순. 공지 바로 밑.
                연필은 수정 모드에서만 — 보기 모드는 읽기 전용, 선택은 수정 [저장]과 함께 반영. */}
            <View style={styles.metaRow}>
              <View style={styles.metaCategory}>
                <Text variant="micro" color={colors.textSecondary}>
                  {`${t('list.category')}:`}
                </Text>
                <View
                  style={[
                    styles.colorDot,
                    { backgroundColor: shownCategoryColor ?? colors.surface },
                  ]}
                />
                <Text
                  variant="micro"
                  color={colors.textSecondary}
                  numberOfLines={1}
                  style={styles.metaCategoryName}
                >
                  {shownCategoryName}
                </Text>
              </View>
              {editing ? (
                <TouchableOpacity
                  style={styles.metaEdit}
                  onPress={editCategory}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('a11y.editCategory')}
                >
                  <Pencil size={13} strokeWidth={2} color={colors.textTertiary} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* 3. 태그 줄: 항상 렌더 — 있으면 #태그, 없으면 회색 placeholder. 연필은 수정 모드에서만. */}
            <View style={[styles.metaRow, styles.metaTagsRow]}>
              <Text
                variant="micro"
                color={colors.textTertiary}
                numberOfLines={1}
                style={styles.metaTagsText}
              >
                {t('chat.tagsTag', {
                  names: shownTagNames.length
                    ? shownTagNames.map((n) => `#${n}`).join(' ')
                    : t('chat.tagsNone'),
                })}
              </Text>
              {editing ? (
                <TouchableOpacity
                  style={styles.metaEdit}
                  onPress={editTags}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('a11y.editTags')}
                >
                  <Pencil size={13} strokeWidth={2} color={colors.textTertiary} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* 4. 날짜/시각 */}
            <Text
              variant="micro"
              color={colors.textTertiary}
              style={styles.dateText}
            >
              {`${formatDateStamp(message.createdAt)} · ${formatTime(message.createdAt)}`}
            </Text>

            {/* 5. 메타 블록과 본문 사이 점선 hairline(CardDetailPanel의 memoDivider 관례). */}
            <View style={styles.metaDivider} />
          </View>

          {/* 6. 본문 — 보기 모드: ScrollView 안에 입력 순서 그대로 텍스트·링크 카드 교차.
              수정 모드: 같은 자리를 multiline textarea로 대체(2중 모달 없음). textarea는
              바깥 스크롤 없이 카드의 직접 자식(flexShrink:1) — 카드가 꽉 차면 레이아웃이
              정확히 줄이고, 넘치는 내용은 textarea 자체 스크롤(커서 자동 추적)이 담당. */}
          {editing ? (
            <TextInput
              nativeID={EDIT_INPUT_ID}
              style={[styles.editInput, { height: editHeight }]}
              value={editText}
              onChangeText={setEditText}
              onContentSizeChange={
                // 웹은 이 이벤트가 박스 높이 변경에도 재발화해 setState 무한루프가 되므로
                // 웹에선 끄고 위의 DOM(scrollHeight) 측정만 쓴다. 네이티브 전용.
                Platform.OS === 'web'
                  ? undefined
                  : (e) =>
                      setEditHeight(
                        Math.max(120, e.nativeEvent.contentSize.height + 26),
                      )
              }
              placeholder={t('chat.inputPlaceholder')}
              placeholderTextColor={colors.textTertiary}
              multiline
              autoFocus
              editable={!busy}
            />
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.body}>
                {segments.map((seg, i) => {
                  if (seg.type === 'text') {
                    const value = seg.value.trim();
                    if (!value) return null;
                    return (
                      <Text
                        key={`seg-t-${i}`}
                        variant="body"
                        color={colors.textPrimary}
                        style={styles.bodyText}
                        selectable={Platform.OS === 'web'}
                      >
                        {value}
                      </Text>
                    );
                  }
                  return (
                    // 카드 탭 = 그 링크 열기.
                    <TouchableOpacity
                      key={`seg-c-${i}`}
                      activeOpacity={0.85}
                      onPress={() => Linking.openURL(seg.link.url)}
                      accessibilityRole="link"
                    >
                      <LinkCard link={seg.link} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          )}

          {/* 7. 액션(우측 정렬).
              보기 모드: ghost 수정 · ghost 닫기 — 수정을 누르면 같은 모달 안에서
              본문이 textarea로 바뀐다(인라인 편집, 2중 모달 아님).
              수정 모드: ghost 취소 · primary(ink) 저장. */}
          <View style={styles.actions}>
            {editing ? (
              <>
                <Button
                  label={t('common.cancel')}
                  variant="ghost"
                  onPress={cancelEdit}
                  disabled={busy}
                  style={styles.actionButton}
                />
                <Button
                  label={t('common.save')}
                  variant="primary"
                  onPress={submitEdit}
                  loading={busy}
                  disabled={!editText.trim()}
                  style={styles.actionButton}
                />
              </>
            ) : (
              <>
                <Button
                  label={t('chat.menu.editContent')}
                  variant="ghost"
                  onPress={startEdit}
                  style={styles.actionButton}
                />
                <Button
                  label={t('common.close')}
                  variant="ghost"
                  onPress={close}
                  style={styles.actionButton}
                />
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

export function useMessageDetail() {
  const value = useContext(OpenContext);
  if (!value) {
    throw new Error('useMessageDetail은 MessageDetailProvider 안에서만 쓸 수 있습니다');
  }
  return value;
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    // ModalCard 문법: 절대위치 풀스크린 오버레이(RN Modal 아님).
    overlayRoot: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    scrim: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    kav: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    // 중앙 카드 — 라운드 0·1px 보더·bg background(ModalCard와 동일 재질), 폭 400.
    card: {
      width: '100%',
      maxWidth: 400,
      maxHeight: '88%',
      backgroundColor: colors.background,
      borderRadius: 0,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 16,
    },
    scroll: {
      flexShrink: 1,
    },
    scrollContent: {
      paddingBottom: 4,
    },
    // 공지 줄 — 아이콘+텍스트 한 줄, 맨 위. micro 모노.
    noticeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 12,
    },
    // 메타 줄(분류·태그) 공통: [내용 왼쪽 flex] ↔ [연필 오른쪽]. 연필 자리를 늘 남긴다.
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    // 분류 줄 내용 — 라벨·색네모·이름. 연필이 텍스트 바로 옆에 붙도록 flex로 늘리지 않고
    // 필요한 만큼만 차지(긴 이름은 shrink+numberOfLines로 줄임).
    metaCategory: {
      flexShrink: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    // 분류색 네모 — "분류:" 라벨과 이름 사이(8x8, 1px 보더 링).
    colorDot: {
      width: 8,
      height: 8,
      marginHorizontal: 6,
      borderWidth: 1,
      borderColor: colors.border,
    },
    metaCategoryName: {
      flexShrink: 1,
    },
    // 태그 줄 — 분류 줄 바로 밑.
    metaTagsRow: {
      marginTop: 6,
    },
    metaTagsText: {
      flexShrink: 1,
    },
    // 연필(분류·태그 인라인 편집) — 텍스트 바로 옆에 붙는다. 조용한 tertiary, 터치는 hitSlop 보강.
    metaEdit: {
      paddingLeft: 6,
      paddingVertical: 2,
    },
    dateText: {
      marginTop: 16,
    },
    // 메타 블록(분류·태그·날짜)과 본문 사이 점선 hairline(CardDetailPanel의 memoDivider 관례).
    metaDivider: {
      borderTopWidth: 1,
      borderStyle: 'dotted',
      borderTopColor: colors.border,
      marginTop: 16,
      marginBottom: 16,
    },
    // 본문 — 텍스트/카드 세그먼트 간격.
    body: {
      gap: 8,
    },
    bodyText: {
      lineHeight: 22,
    },
    // 수정 모드 textarea — MessageEditModal의 입력 관례(보더 1px·라운드 0·스크롤 상한).
    // height(희망값)는 인라인으로 받고, flexShrink:1로 카드 가용 공간에 정확히 맞춰 줄어든다.
    editInput: {
      flexShrink: 1,
      minHeight: 120,
      marginBottom: 4,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 0,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 16,
      textAlignVertical: 'top',
      color: colors.textPrimary,
      backgroundColor: colors.background,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 8,
      marginTop: 16,
    },
    actionButton: {
      height: 46,
      minWidth: 92,
    },
  });
