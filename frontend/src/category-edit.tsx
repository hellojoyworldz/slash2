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
import { api, Friend } from './api';
import { useAuth } from './auth';
import { CategoryAvatar } from './components/CategoryAvatar';
import { CategoryPickerModal } from './components/CategoryPickerModal';
import { ModalCard } from './components/ModalCard';
import { ProfileColorSection } from './components/ProfileColorSection';
import { Text } from './components/Text';
import { confirmDialog } from './notify';
import { useSelectedRoom } from './selected-room';
import { CATEGORY_COLORS, SELF_DEFAULT_COLOR, ThemeColors } from './theme';
import { useTheme } from './theme-context';

// 분류 추가·수정 + "전체"(자기 자신) 프로필 편집을 루트에 상주시킨다(name-edit.tsx와 같은 원리).
// - FriendsScreen·ChatsScreen(스와이프/롱프레스)·ChatScreen 헤더(펜)가 공용으로 연다.
// - 900px 트리 스왑에도 살아남아 리사이즈 중 편집기가 사라지지 않는다.
// - 표현은 공용 `ModalCard`(확인 다이얼로그·이름 편집과 같은 문법). ModalCard가 절대위치
//   오버레이라 RN Modal의 별도 네이티브 계층이 없어 색 피커 레일(RNGH)이 정상 동작한다.
// - 분류 삭제는 목록 행 스와이프 전용(여긴 삭제 버튼 없음).
// open() = 분류 추가, open(category) = 그 분류 수정, open({ self:true }) = "전체" 프로필 편집.

// 편집기가 필요로 하는 분류의 최소 형태(id·이름·색). Friend·RoomRow 둘 다 여기에 맞는다.
export interface EditableCategory {
  id: string;
  name: string;
  color?: string | null;
  description?: string | null;
}

// 설명(상태메시지) 최대 길이 — 백엔드 MaxLength(80)과 일치.
const DESCRIPTION_MAX = 80;

// 열림 세션. self=true → "전체" 프로필. category=값 → 그 분류 수정. 둘 다 없으면 분류 추가.
interface EditSession {
  category: EditableCategory | null;
  self: boolean;
  // 추가(생성) 모드 기본 선택색. 호출부가 자기 분류 목록으로 pickDefaultCategoryColor를 계산해 넘긴다.
  defaultColor?: string;
}

interface CategoryEditState {
  /**
   * category 전달 = 그 분류 수정(스와이프 [수정] — 이름·설명·프로필 색 폼), { self:true } = "전체" 프로필 편집.
   * 무인자도 폼 추가로 열 수 있으나(레거시), 분류 "추가" 진입점은 openManage(픽커 문법)를 쓴다.
   */
  open: (arg?: EditableCategory | { self: true }, defaultColor?: string) => void;
  /**
   * 분류 "추가" — 태그 추가(openTagCreate)와 한 문법. CategoryPickerModal 관리 모드를 연다
   * (선택 없이 목록 + 인라인 추가(이름 + 설명) + 밑줄 [닫기], 색은 자동 배정).
   */
  openManage: (onChanged?: () => void) => void;
}

const CategoryEditContext = createContext<CategoryEditState | null>(null);
// 호스트(Shell 마운트)가 세션을 구독하는 내부 컨텍스트 — tag-create의 TagSessionContext 미러.
const CategorySessionContext = createContext<{
  session: EditSession | null;
  manageSession: { onChanged?: () => void } | null;
  closeEdit: () => void;
  closeManage: () => void;
} | null>(null);

export function CategoryEditProvider({ children }: { children: ReactNode }) {
  // Provider는 "열림 세션"만 들고 있는다 — 폼 상태(이름·색 등)는 형제 컴포넌트가 소유해
  // 타이핑마다 children(앱 전체)이 리렌더되지 않게 한다.
  const [session, setSession] = useState<EditSession | null>(null);
  // 분류 추가(관리 모드 픽커) 세션 — 폼 수정과 별개 트리로 상주.
  const [manageSession, setManageSession] = useState<{ onChanged?: () => void } | null>(
    null,
  );
  const open = useCallback(
    (arg?: EditableCategory | { self: true }, defaultColor?: string) => {
      if (arg && 'self' in arg) setSession({ category: null, self: true });
      else setSession({ category: arg ?? null, self: false, defaultColor });
    },
    [],
  );
  const openManage = useCallback(
    (onChanged?: () => void) => setManageSession({ onChanged }),
    [],
  );
  const value = useMemo(() => ({ open, openManage }), [open, openManage]);
  const sessionValue = useMemo(
    () => ({
      session,
      manageSession,
      closeEdit: () => setSession(null),
      closeManage: () => setManageSession(null),
    }),
    [session, manageSession],
  );
  return (
    <CategoryEditContext.Provider value={value}>
      <CategorySessionContext.Provider value={sessionValue}>
        {children}
      </CategorySessionContext.Provider>
    </CategoryEditContext.Provider>
  );
}

// 루트 Shell에 마운트하는 분류 모달 호스트 — 반드시 NotifyHost보다 앞(=아래)에 둘 것
// (프로바이더가 children 뒤에 호스트를 렌더하면 삭제 확인 다이얼로그가 픽커 밑에 깔린다).
export function CategoryEditHost() {
  const ctx = useContext(CategorySessionContext);
  if (!ctx) {
    throw new Error('CategoryEditHost는 CategoryEditProvider 안에서만 쓸 수 있습니다');
  }
  // 렌더 순서 = z-순서(뒤에 렌더한 오버레이가 위). 관리 픽커를 먼저(아래), 수정 폼을 나중(위)에 둔다
  // — 관리 픽커 행 탭으로 연 수정 폼이 픽커 위에 떠야 하기 때문.
  return (
    <>
      <CategoryManageHost session={ctx.manageSession} onClose={ctx.closeManage} />
      <CategoryEditModal session={ctx.session} onClose={ctx.closeEdit} />
    </>
  );
}

// 분류 "추가" = CategoryPickerModal 관리 모드(새 컴포넌트 없음, TagManageHost 미러).
// 자기 분류 목록을 로드해 픽커에 넘기고(추가 시 픽커가 로컬로 얹는다), 추가되면 목록을 구독하는
// 화면들이 재조회하도록 bumpRooms + 호출부 콜백을 함께 알린다.
function CategoryManageHost({
  session,
  onClose,
}: {
  session: { onChanged?: () => void } | null;
  onClose: () => void;
}) {
  const { token, selfColor, selfDescription } = useAuth();
  const { bumpRooms, roomsVersion } = useSelectedRoom();
  // 관리 픽커 행 탭 → 그 분류 수정 폼(색·프로필) 열기. 같은 프로바이더의 open을 재사용.
  // "전체" 행 탭·스와이프 [수정]은 self 프로필 편집 폼(open({self:true}))으로 연다.
  const { open } = useCategoryEdit();
  const [friends, setFriends] = useState<Friend[]>([]);
  // 열릴 때마다 + 분류가 바뀔 때마다(roomsVersion) 최신 목록을 로드. 닫힘 땐 유지(재오픈 전 깜빡임 방지).
  // roomsVersion 의존으로, 픽커 행 탭 → 수정 폼 저장/삭제(bumpRooms) 후 관리 리스트가 갱신된다.
  useEffect(() => {
    if (!session || !token) return;
    api
      .listFriends(token)
      .then(setFriends)
      .catch(() => {});
  }, [session, token, roomsVersion]);
  return (
    <CategoryPickerModal
      visible={!!session}
      token={token}
      message={null}
      friends={friends}
      selfColor={selfColor}
      selfDescription={selfDescription}
      manage
      onEditFriend={open}
      onEditSelf={() => open({ self: true })}
      onClose={onClose}
      onFriendsChanged={() => {
        bumpRooms();
        session?.onChanged?.();
      }}
    />
  );
}

function CategoryEditModal({
  session,
  onClose,
}: {
  session: EditSession | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {
    token,
    selfColor,
    setSelfColor,
    selfDescription,
    setSelfDescription,
  } = useAuth();
  // 편집 결과를 채팅 목록·개수·상주 대화 헤더로 전파한다.
  const { room, setRoom, bumpRooms } = useSelectedRoom();

  // 편집 대상. self 모드 / 수정(category) / 추가(둘 다 없음)를 구분한다.
  const [self, setSelf] = useState(false);
  const [editing, setEditing] = useState<EditableCategory | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [color, setColor] = useState<string | null>(CATEGORY_COLORS[0].hex);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  // 프리필은 "세션이 새로 열릴 때"만 — selfColor는 그 순간 값을 ref로 읽어(의존성에서 빼),
  // 편집 도중 selfColor가 바뀌어도 진행 중인 입력이 리셋되지 않게 한다.
  const selfColorRef = useRef(selfColor);
  selfColorRef.current = selfColor;
  const selfDescriptionRef = useRef(selfDescription);
  selfDescriptionRef.current = selfDescription;

  // 세션이 새로 열릴 때마다 프리필한다. 닫힘(null)일 땐 유지 — 재오픈 전 깜빡임 방지.
  useEffect(() => {
    if (!session) return;
    const isSelf = session.self;
    const cat = session.category;
    // self=현재 selfColor(없으면 기본 검정), 수정=그 분류 색(무채면 null 유지), 추가=호출부 기본색(없으면 첫 프리셋).
    const initialColor: string | null = isSelf
      ? selfColorRef.current ?? SELF_DEFAULT_COLOR
      : cat
        ? cat.color ?? null
        : session.defaultColor ?? CATEGORY_COLORS[0].hex;
    setSelf(isSelf);
    setEditing(cat);
    setNameInput(cat?.name ?? '');
    setDescriptionInput(isSelf ? selfDescriptionRef.current ?? '' : cat?.description ?? '');
    setColor(initialColor);
    setSubmitting(false);
    setFormError('');
  }, [session]);

  const handleSubmit = async () => {
    if (!token) {
      setFormError(t('friends.loginToAdd'));
      return;
    }
    // "전체" 프로필: 이름은 고정("전체"), 색·설명만 저장.
    if (self) {
      const description = descriptionInput.trim();
      setSubmitting(true);
      setFormError('');
      try {
        await api.updateProfile(token, {
          selfColor: color,
          selfDescription: description,
        });
        setSelfColor(color);
        setSelfDescription(description || null);
        bumpRooms();
        onClose();
      } catch {
        setFormError(t('friends.editFailed'));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const name = nameInput.trim();
    if (!name) {
      setFormError(t('friends.nameRequired'));
      return;
    }
    const description = descriptionInput.trim();
    setSubmitting(true);
    setFormError('');
    try {
      if (editing) {
        const updated = await api.updateFriend(token, editing.id, {
          name,
          color,
          description,
        });
        // 채팅 목록·개수·말풍선 색·친구 목록 재조회 신호(구독 화면들이 roomsVersion으로 재조회).
        bumpRooms();
        // 데스크톱 상주 대화가 이 분류면 헤더 이름 동기화.
        if (room?.friendId === updated.id) {
          setRoom({ friendId: updated.id, name: updated.name });
        }
        onClose();
      } else {
        await api.createFriend(token, name, color, description);
        bumpRooms();
        onClose();
      }
    } catch {
      setFormError(editing ? t('friends.editFailed') : t('friends.addFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  // 푸터 왼쪽 [삭제] — 분류 수정 모드 전용(전체 프로필·추가 폼엔 없음). 확인창 → 삭제 → 닫기.
  // 그 분류 메시지는 미분류로(스와이프 삭제와 같은 계약). 삭제한 분류 방을 보고 있으면 전체로.
  const handleDelete = async () => {
    if (!token || !editing || submitting) return;
    const ok = await confirmDialog({
      title: t('common.delete'),
      message: t('friends.confirmDelete', { name: editing.name }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      await api.deleteFriend(token, editing.id);
      if (room?.friendId === editing.id) setRoom(null);
      bumpRooms();
      onClose();
    } catch {
      setFormError(t('friends.editFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  // self(전체)도 타이틀은 일반 분류와 동일한 "분류 수정" — 이름 칸이 이미 "전체"를 보여준다.
  const title = self
    ? t('friends.editTitle')
    : editing
      ? t('friends.editTitle')
      : t('friends.addTitle');
  const saveLabel = self || editing ? t('common.save') : t('friends.add');

  return (
    <ModalCard
      visible={!!session}
      title={title}
      onClose={onClose}
      confirmLabel={saveLabel}
      cancelLabel={t('common.cancel')}
      onConfirm={handleSubmit}
      busy={submitting}
      // 분류 수정 모드에만 타이틀 오른쪽 휴지통(확인창 → 삭제 → 닫기). 추가·전체 프로필엔 없음.
      titleAccessory={
        editing && !self ? (
          <TouchableOpacity
            onPress={() => void handleDelete()}
            disabled={submitting}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={t('common.delete')}
            accessibilityState={{ disabled: submitting }}
          >
            <Trash2 size={18} strokeWidth={2} color={colors.textTertiary} />
          </TouchableOpacity>
        ) : null
      }
    >
      {/* "전체" 프로필은 이름을 고칠 수 없다 — 편집 불가 고정 텍스트로 같은 자리에 박는다. */}
      {self ? (
        <View style={[styles.input, styles.fixedNameBox]}>
          <Text variant="body" color={colors.textPrimary}>
            {t('chats.myRoom')}
          </Text>
        </View>
      ) : (
        <TextInput
          style={styles.input}
          placeholder={t('friends.namePlaceholder')}
          placeholderTextColor={colors.textTertiary}
          value={nameInput}
          onChangeText={(text) => {
            setNameInput(text);
            if (formError) setFormError('');
          }}
          maxLength={30}
          autoFocus
          onSubmitEditing={handleSubmit}
          accessibilityLabel={t('a11y.nameInput')}
        />
      )}
      <TextInput
        style={[styles.input, styles.descriptionInput]}
        placeholder={t('friends.descriptionPlaceholder')}
        placeholderTextColor={colors.textTertiary}
        value={descriptionInput}
        onChangeText={setDescriptionInput}
        maxLength={DESCRIPTION_MAX}
        onSubmitEditing={handleSubmit}
        accessibilityLabel={t('a11y.descriptionInput')}
      />

      {/* 프로필(색) 선택 — 스와치는 그 색의 미니 아바타. 분류·태그 공용(태그는 # 타일 미리보기). */}
      <ProfileColorSection
        key={self ? 'self' : editing?.id ?? 'add'}
        color={color}
        onChange={setColor}
        renderSwatch={(c, size) => <CategoryAvatar color={c} size={size} />}
      />

      {formError ? (
        <Text variant="caption" color={colors.textSecondary} style={styles.error}>
          {formError}
        </Text>
      ) : null}
    </ModalCard>
  );
}

export function useCategoryEdit(): CategoryEditState {
  const value = useContext(CategoryEditContext);
  if (!value) {
    throw new Error('useCategoryEdit은 CategoryEditProvider 안에서만 쓸 수 있습니다');
  }
  return value;
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
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
  // "전체" 프로필의 이름 자리 — TextInput과 같은 박스, 편집 불가 고정 텍스트만 가운데 정렬.
  fixedNameBox: {
    justifyContent: 'center',
  },
  error: {
    marginTop: 8,
  },
});
