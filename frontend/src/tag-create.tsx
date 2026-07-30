import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react-native';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { api, Tag } from './api';
import { useAuth } from './auth';
// 태그는 기본 색 프로필로 고정 — 색 선택 UI 비활성(요청으로 보류)이라 미리보기 타일(HashTile)도 잠시 미사용.
// import { HashTile } from './components/HashTile';
import { cleanKeywords, KeywordStepper } from './components/KeywordStepper';
import { ModalCard } from './components/ModalCard';
// 태그는 기본 색 프로필로 고정 — 색 선택 UI 비활성(요청으로 보류). 되살릴 때 주석 해제.
// import { ProfileColorSection } from './components/ProfileColorSection';
import { TagPickerModal } from './components/TagPickerModal';
import { Text } from './components/Text';
import { errorText } from './i18n/errors';
import { confirmDialog } from './notify';
import { useSelectedRoom } from './selected-room';
import { CATEGORY_COLORS, ThemeColors } from './theme';
import { useTheme } from './theme-context';

// 태그 추가·수정 모달을 루트에 상주시킨다(NameEditProvider와 같은 원리).
// - openTagCreate(onChanged?) = 태그 목록 모달. 채팅 ⋮→태그와 같은 TagPickerModal을 관리 모드로 연다
//   (선택 체크 없이 목록 + 타이틀 [+] + 닫기). 목록 전용이라 추가는 [+]가 아래 폼을 띄운다.
// - openTagAdd(onCreated?) = 태그 "추가" 폼(빈 폼). 픽커 [+]가 쓰는 진입점.
// - openTagRename(tag, onDone?) = 그 태그 수정(프리필). 둘 다 같은 폼 한 벌(TagEditHost)이 렌더한다
//   — category-edit의 open()=추가 / open(항목)=수정과 같은 문법.
// 태그 삭제·고정·즐겨찾기는 태그 탭 스와이프가 담당한다.

// 목록(관리) 픽커 세션과 추가·수정 폼 세션 — 분리해 동시에 열 수 있게 한다
// (픽커 [+]·행 탭으로 연 폼이 픽커 위에 뜬다). category-edit의 session/manageSession 미러.
type TagManageSession = { onChanged?: () => void };
// tag=null → 추가(빈 폼), tag=값 → 그 태그 수정(프리필). onDone은 저장 성공 결과를 돌려준다.
type TagEditSession = { tag: Tag | null; onDone?: (tag: Tag) => void };
// "태그 전체" 방 프로필(색·설명) 편집 세션 — self 프로필 편집(category-edit self 모드)의 태그판.
// 이름은 '전체' 고정이라 없고, 저장은 updateProfile({tagAllColor, tagAllDescription}). 빈 세션 객체로 연다.
type TagAllSession = Record<string, never>;

interface TagCreateState {
  openTagCreate: (onChanged?: () => void) => void;
  /** 태그 "추가" 폼(빈 폼) — 픽커 타이틀 [+] 진입점. 생성되면 onCreated로 만들어진 태그를 돌려준다. */
  openTagAdd: (onCreated?: (tag: Tag) => void) => void;
  openTagRename: (tag: Tag, onRenamed?: (tag: Tag) => void) => void;
  /** "태그 전체" 방 프로필(색·설명) 편집 폼을 연다(태그 탭 전체 행·태그 픽커 전체 행·태그 전체 채팅 헤더 ⋮). */
  openTagAllEdit: () => void;
}

const TagCreateContext = createContext<TagCreateState | null>(null);
// 호스트가 세션을 구독하는 내부 컨텍스트 — 호스트를 Shell(NotifyHost 앞)에 마운트하기 위한 분리.
// (프로바이더가 children 뒤에 호스트를 렌더하면 확인 다이얼로그(NotifyHost)가 픽커 밑에 깔린다.)
const TagSessionContext = createContext<{
  manageSession: TagManageSession | null;
  editSession: TagEditSession | null;
  tagAllSession: TagAllSession | null;
  closeManage: () => void;
  closeEdit: () => void;
  closeTagAll: () => void;
} | null>(null);

export function TagCreateProvider({ children }: { children: ReactNode }) {
  const [manageSession, setManageSession] = useState<TagManageSession | null>(null);
  const [editSession, setEditSession] = useState<TagEditSession | null>(null);
  const [tagAllSession, setTagAllSession] = useState<TagAllSession | null>(null);
  const openTagCreate = useCallback(
    (onChanged?: () => void) => setManageSession({ onChanged }),
    [],
  );
  const openTagAdd = useCallback(
    (onCreated?: (tag: Tag) => void) => setEditSession({ tag: null, onDone: onCreated }),
    [],
  );
  const openTagRename = useCallback(
    (tag: Tag, onRenamed?: (tag: Tag) => void) =>
      setEditSession({ tag, onDone: onRenamed }),
    [],
  );
  const openTagAllEdit = useCallback(() => setTagAllSession({}), []);
  const value = useMemo(
    () => ({ openTagCreate, openTagAdd, openTagRename, openTagAllEdit }),
    [openTagCreate, openTagAdd, openTagRename, openTagAllEdit],
  );
  const sessionValue = useMemo(
    () => ({
      manageSession,
      editSession,
      tagAllSession,
      closeManage: () => setManageSession(null),
      closeEdit: () => setEditSession(null),
      closeTagAll: () => setTagAllSession(null),
    }),
    [manageSession, editSession, tagAllSession],
  );
  return (
    <TagCreateContext.Provider value={value}>
      <TagSessionContext.Provider value={sessionValue}>
        {children}
      </TagSessionContext.Provider>
    </TagCreateContext.Provider>
  );
}

// 루트 Shell에 마운트하는 태그 모달 호스트 — 반드시 NotifyHost보다 앞(=아래)에 둘 것
// (message-actions 호스트와 같은 이유: 삭제 확인 다이얼로그가 위에 떠야 한다).
// 렌더 순서 = z-순서(뒤가 위): 관리 픽커를 먼저(아래), 수정 폼을 나중(위)에 둔다.
export function TagCreateHost() {
  const ctx = useContext(TagSessionContext);
  if (!ctx) {
    throw new Error('TagCreateHost는 TagCreateProvider 안에서만 쓸 수 있습니다');
  }
  return (
    <>
      <TagManageHost session={ctx.manageSession} onClose={ctx.closeManage} />
      <TagEditHost session={ctx.editSession} onClose={ctx.closeEdit} />
      {/* "태그 전체" 프로필 편집 폼 — 관리 픽커 위에 떠야 하므로 맨 나중(=위)에 둔다. */}
      <TagAllEditHost session={ctx.tagAllSession} onClose={ctx.closeTagAll} />
    </>
  );
}

// 태그 목록 모달 = 채팅 태그 픽커의 관리 모드 재사용(새 컴포넌트 없음). 추가 시 목록을 구독하는
// 화면들(태그 탭·보드)이 재조회하도록 bumpRooms + 호출부 콜백을 함께 알린다.
// 픽커 타이틀 [+]는 같은 프로바이더의 openTagAdd(태그 추가 폼)을 이 픽커 위에 띄운다.
function TagManageHost({
  session,
  onClose,
}: {
  session: TagManageSession | null;
  onClose: () => void;
}) {
  const { token, tagAllColor, tagAllDescription } = useAuth();
  const { bumpRooms } = useSelectedRoom();
  // 관리 픽커 행 탭 → 그 태그 이름·설명 수정 폼 열기. 같은 프로바이더의 openTagRename 재사용.
  // 타이틀 [+] → 같은 폼의 추가 모드(openTagAdd). 픽커는 열린 채 그 위에 뜬다(호스트 렌더 순서 = z-순서).
  // "전체" 행 탭·스와이프 [수정] → 태그 전체 프로필 편집 폼(openTagAllEdit).
  const { openTagAdd, openTagRename, openTagAllEdit } = useTagCreate();
  return (
    <TagPickerModal
      visible={!!session}
      token={token}
      message={null}
      manage
      onEditTag={openTagRename}
      onAddTag={openTagAdd}
      tagAllColor={tagAllColor}
      tagAllDescription={tagAllDescription}
      onEditTagAll={openTagAllEdit}
      onClose={onClose}
      onTagsChanged={() => {
        bumpRooms();
        session?.onChanged?.();
      }}
    />
  );
}

// 태그 추가·수정 폼 한 벌 — ModalCard(이름 편집과 같은 문법) + 분류 추가/수정 모달(CategoryEditModal)의
// 미러. session.tag가 없으면 추가(빈 폼·[추가]·휴지통 없음), 있으면 수정(프리필·[저장]·휴지통).
function TagEditHost({
  session,
  onClose,
}: {
  session: TagEditSession | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { token } = useAuth();
  const { bumpRooms } = useSelectedRoom();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // 태그 프로필 색. 태그는 기본 무채(색 없음) — null이면 무채 스와치가 선택된 상태로 보인다.
  const [color, setColor] = useState<string | null>(CATEGORY_COLORS[0].hex);
  // 자동 부착 키워드(0~10개). 이 문구가 든 메시지에 서버가 이 태그를 실제 부착한다(과거·신규).
  const [keywords, setKeywords] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // 중복(409 tag_name_taken) 등은 카드 안 인라인 문구로 노출한다(name-edit·category-edit과 통일).
  const [error, setError] = useState('');

  // 편집 대상 — 세션이 열릴 때 고정한다(null이면 추가 모드). 렌더·핸들러가 이 값으로 갈린다.
  const [editing, setEditing] = useState<Tag | null>(null);

  // 세션이 새로 열릴 때마다 프리필/초기화(닫힘 땐 유지 — 재오픈 전 깜빡임 방지).
  useEffect(() => {
    if (!session) return;
    const tag = session.tag;
    setEditing(tag);
    setName(tag?.name ?? '');
    setDescription(tag?.description ?? '');
    // 무채(색 없음) 태그는 null 그대로 — 무채 스와치가 선택된다. 새 태그도 기본 무채.
    setColor(tag?.color ?? null);
    setKeywords(tag?.keywords ? [...tag.keywords] : []);
    setBusy(false);
    setError('');
  }, [session]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy || !token || !session) return;
    setBusy(true);
    setError('');
    try {
      const saved = editing
        ? await api.updateTag(token, editing.id, {
            name: trimmed,
            color,
            description: description.trim(),
            keywords: cleanKeywords(keywords),
          })
        : // 새 태그는 색을 배정하지 않는다(기본 무채) — color는 null이라 서버로 안 나간다.
          await api.createTag(
            token,
            trimmed,
            color,
            description.trim(),
            cleanKeywords(keywords),
          );
      bumpRooms();
      // 픽커 [+]로 열렸으면 만들어진/갱신된 태그를 돌려준다(목록에 얹고 그 항목으로 스크롤).
      session.onDone?.(saved);
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  // 푸터 왼쪽 [삭제] — 확인창 → 모든 메시지에서 태그 제거(태그 탭 스와이프 삭제와 같은 계약) → 닫기.
  // 수정 모드 전용(추가 폼엔 지울 대상이 없다 — 분류 추가/수정 모달과 같은 규칙).
  const handleDelete = async () => {
    if (busy || !token || !editing) return;
    const ok = await confirmDialog({
      title: t('tags.deleteTitle'),
      message: t('tags.deleteMessage', { name: editing.name }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.deleteTag(token, editing.id);
      bumpRooms();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalCard
      visible={!!session}
      title={editing ? t('tags.editTitle') : t('tags.addTitle')}
      onClose={onClose}
      // 확정 버튼 문구도 분류 폼과 같은 규칙 — 수정은 [저장], 추가는 [추가].
      confirmLabel={editing ? t('common.save') : t('common.add')}
      cancelLabel={t('common.cancel')}
      onConfirm={submit}
      busy={busy}
      // 분류 수정 모달과 같은 자리(타이틀 오른쪽)의 휴지통 — 확인창 → 삭제 → 닫기. 수정 모드에만.
      titleAccessory={
        editing ? (
          <TouchableOpacity
            onPress={() => void handleDelete()}
            disabled={busy}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={t('common.delete')}
          >
            <Trash2 size={18} strokeWidth={2} color={colors.textTertiary} />
          </TouchableOpacity>
        ) : null
      }
    >
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={(txt) => {
          setName(txt);
          if (error) setError('');
        }}
        placeholder={t('tags.newPlaceholder')}
        placeholderTextColor={colors.textTertiary}
        maxLength={30}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      {/* 설명 (선택) — 분류 수정 모달의 descriptionPlaceholder 문법 미러(빈 값은 서버가 null로 저장). */}
      <TextInput
        style={[styles.input, styles.descriptionInput]}
        value={description}
        onChangeText={setDescription}
        placeholder={t('friends.descriptionPlaceholder')}
        placeholderTextColor={colors.textTertiary}
        maxLength={80}
        returnKeyType="done"
        onSubmitEditing={submit}
      />

      {/* 자동 부착 키워드 스테퍼(공용) — 이 문구가 든 메시지에 서버가 이 태그를 실제 부착한다(과거·신규). */}
      <KeywordStepper keywords={keywords} onChange={setKeywords} />

      {/* 프로필(색) 섹션 — 분류 수정 모달과 같은 문법(공용 컴포넌트). 미리보기는 # 타일로 미러. */}
      {/* 태그는 기본 색 프로필로 고정 — 색 선택 UI 비활성(요청으로 보류). color는 저장 시 기존 값을 그대로 유지해 보낸다. */}
      {/* <ProfileColorSection
        key={editing?.id ?? 'add'}
        color={color}
        onChange={setColor}
        renderSwatch={(c, size) => <HashTile color={c} size={size} />}
      /> */}
      {error ? (
        <Text variant="caption" color={colors.textSecondary} style={styles.error}>
          {error}
        </Text>
      ) : null}
    </ModalCard>
  );
}

// "태그 전체" 방 프로필(색·설명) 편집 — category-edit의 self 모드를 태그판(# 타일)으로 미러.
// 이름은 '전체' 고정(편집 불가 박스), 설명 입력 + ProfileColorSection(무채 포함), 삭제 없음.
// 저장 = updateProfile({tagAllColor, tagAllDescription}) 낙관(auth 세터) + 서버 + bumpRooms.
function TagAllEditHost({
  session,
  onClose,
}: {
  session: TagAllSession | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {
    token,
    tagAllColor,
    setTagAllColor,
    tagAllDescription,
    setTagAllDescription,
  } = useAuth();
  const { bumpRooms } = useSelectedRoom();

  const [description, setDescription] = useState('');
  // 태그 전체 프로필 색. 태그는 기본 무채(색 없음) — null이면 무채 스와치가 선택된 상태로 보인다.
  const [color, setColor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // 프리필은 "세션이 새로 열릴 때"만 — 진행 중 값 변화가 입력을 리셋하지 않게 ref로 읽는다(category-edit 패턴).
  const colorRef = useRef(tagAllColor);
  colorRef.current = tagAllColor;
  const descriptionRef = useRef(tagAllDescription);
  descriptionRef.current = tagAllDescription;

  useEffect(() => {
    if (!session) return;
    setColor(colorRef.current ?? null);
    setDescription(descriptionRef.current ?? '');
    setBusy(false);
    setError('');
  }, [session]);

  const submit = async () => {
    if (busy || !token) return;
    const trimmed = description.trim();
    setBusy(true);
    setError('');
    try {
      await api.updateProfile(token, {
        tagAllColor: color,
        tagAllDescription: trimmed,
      });
      setTagAllColor(color);
      setTagAllDescription(trimmed || null);
      bumpRooms();
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalCard
      visible={!!session}
      title={t('tags.editTitle')}
      onClose={onClose}
      confirmLabel={t('common.save')}
      cancelLabel={t('common.cancel')}
      onConfirm={submit}
      busy={busy}
    >
      {/* 이름은 '전체' 고정 — self 프로필 편집과 같은 편집 불가 박스. */}
      <View style={[styles.input, styles.fixedNameBox]}>
        <Text variant="body" color={colors.textPrimary}>
          {t('chats.myRoom')}
        </Text>
      </View>
      <TextInput
        style={[styles.input, styles.descriptionInput]}
        value={description}
        onChangeText={setDescription}
        placeholder={t('friends.descriptionPlaceholder')}
        placeholderTextColor={colors.textTertiary}
        maxLength={80}
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      {/* 프로필(색) 섹션 — 미리보기는 # 타일로 미러(태그 문법). */}
      {/* 태그는 기본 색 프로필로 고정 — 색 선택 UI 비활성(요청으로 보류). color는 저장 시 기존 값을 그대로 유지해 보낸다.
          (설명 입력은 태그 전체 프로필의 실질 기능이라 남기고, 진입점은 그대로 둔다.) */}
      {/* <ProfileColorSection
        key={session ? 'tagall' : 'none'}
        color={color}
        onChange={setColor}
        renderSwatch={(c, size) => <HashTile color={c} size={size} />}
      /> */}
      {error ? (
        <Text variant="caption" color={colors.textSecondary} style={styles.error}>
          {error}
        </Text>
      ) : null}
    </ModalCard>
  );
}

export function useTagCreate(): TagCreateState {
  const value = useContext(TagCreateContext);
  if (!value) {
    throw new Error('useTagCreate는 TagCreateProvider 안에서만 쓸 수 있습니다');
  }
  return value;
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 0,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.textPrimary,
      backgroundColor: colors.background,
    },
    descriptionInput: {
      marginTop: 8,
    },
    // "전체" 이름 자리 — TextInput과 같은 박스, 편집 불가 고정 텍스트만 세로 가운데(self 편집과 동일).
    fixedNameBox: {
      justifyContent: 'center',
    },
    error: {
      marginTop: 8,
    },
  });
