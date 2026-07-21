import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react-native';
import { StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { api, Tag } from './api';
import { useAuth } from './auth';
import { HashTile } from './components/HashTile';
import { ModalCard } from './components/ModalCard';
import { ProfileColorSection } from './components/ProfileColorSection';
import { TagPickerModal } from './components/TagPickerModal';
import { Text } from './components/Text';
import { errorText } from './i18n/errors';
import { confirmDialog } from './notify';
import { useSelectedRoom } from './selected-room';
import { CATEGORY_COLORS, ThemeColors } from './theme';
import { useTheme } from './theme-context';

// 태그 추가·이름수정 모달을 루트에 상주시킨다(NameEditProvider와 같은 원리).
// - openTagCreate(onChanged?) = 태그 "추가". 채팅 ⋮→태그와 같은 TagPickerModal을 관리 모드로 연다
//   (선택 체크 없이 목록 + 상단 '새 태그 이름' 인라인 추가 + 닫기). 예전 전용 추가 모달은 제거하고 일원화.
// - openTagRename(tag, onDone?) = 그 태그 이름·설명 수정(프리필). 분류 수정 모달의 설명 필드 문법을 미러.
// 태그 삭제·고정·즐겨찾기는 태그 탭 스와이프가 담당한다.

// 관리(추가) 픽커 세션과 이름·설명 수정 폼 세션 — 분리해 동시에 열 수 있게 한다
// (관리 픽커 행 탭 → 수정 폼이 픽커 위에 뜬다). category-edit의 session/manageSession 미러.
type TagManageSession = { onChanged?: () => void };
type TagRenameSession = { tag: Tag; onDone?: (tag: Tag) => void };

interface TagCreateState {
  openTagCreate: (onChanged?: () => void) => void;
  openTagRename: (tag: Tag, onRenamed?: (tag: Tag) => void) => void;
}

const TagCreateContext = createContext<TagCreateState | null>(null);
// 호스트가 세션을 구독하는 내부 컨텍스트 — 호스트를 Shell(NotifyHost 앞)에 마운트하기 위한 분리.
// (프로바이더가 children 뒤에 호스트를 렌더하면 확인 다이얼로그(NotifyHost)가 픽커 밑에 깔린다.)
const TagSessionContext = createContext<{
  manageSession: TagManageSession | null;
  renameSession: TagRenameSession | null;
  closeManage: () => void;
  closeRename: () => void;
} | null>(null);

export function TagCreateProvider({ children }: { children: ReactNode }) {
  const [manageSession, setManageSession] = useState<TagManageSession | null>(null);
  const [renameSession, setRenameSession] = useState<TagRenameSession | null>(null);
  const openTagCreate = useCallback(
    (onChanged?: () => void) => setManageSession({ onChanged }),
    [],
  );
  const openTagRename = useCallback(
    (tag: Tag, onRenamed?: (tag: Tag) => void) =>
      setRenameSession({ tag, onDone: onRenamed }),
    [],
  );
  const value = useMemo(
    () => ({ openTagCreate, openTagRename }),
    [openTagCreate, openTagRename],
  );
  const sessionValue = useMemo(
    () => ({
      manageSession,
      renameSession,
      closeManage: () => setManageSession(null),
      closeRename: () => setRenameSession(null),
    }),
    [manageSession, renameSession],
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
      <TagRenameHost session={ctx.renameSession} onClose={ctx.closeRename} />
    </>
  );
}

// 태그 "추가" = 채팅 태그 픽커의 관리 모드 재사용(새 컴포넌트 없음). 추가 시 목록을 구독하는
// 화면들(태그 탭·보드)이 재조회하도록 bumpRooms + 호출부 콜백을 함께 알린다.
function TagManageHost({
  session,
  onClose,
}: {
  session: TagManageSession | null;
  onClose: () => void;
}) {
  const { token } = useAuth();
  const { bumpRooms } = useSelectedRoom();
  // 관리 픽커 행 탭 → 그 태그 이름·설명 수정 폼 열기. 같은 프로바이더의 openTagRename 재사용.
  const { openTagRename } = useTagCreate();
  return (
    <TagPickerModal
      visible={!!session}
      token={token}
      message={null}
      manage
      onEditTag={openTagRename}
      onClose={onClose}
      onTagsChanged={() => {
        bumpRooms();
        session?.onChanged?.();
      }}
    />
  );
}

// 태그 이름·설명 수정 — ModalCard(이름 편집과 같은 문법) + 분류 수정 모달의 '설명 (선택)' 필드 미러.
function TagRenameHost({
  session,
  onClose,
}: {
  session: TagRenameSession | null;
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
  const [busy, setBusy] = useState(false);
  // 중복(409 tag_name_taken) 등은 카드 안 인라인 문구로 노출한다(name-edit·category-edit과 통일).
  const [error, setError] = useState('');

  // 세션이 새로 열릴 때마다 프리필/초기화(닫힘 땐 유지 — 재오픈 전 깜빡임 방지).
  useEffect(() => {
    if (!session) return;
    setName(session.tag.name);
    setDescription(session.tag.description ?? '');
    // 무채(색 없음) 태그는 null 그대로 — 무채 스와치가 선택된다.
    setColor(session.tag.color ?? null);
    setBusy(false);
    setError('');
  }, [session]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy || !token || !session) return;
    setBusy(true);
    setError('');
    try {
      const updated = await api.updateTag(token, session.tag.id, {
        name: trimmed,
        color,
        description: description.trim(),
      });
      bumpRooms();
      session.onDone?.(updated);
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  // 푸터 왼쪽 [삭제] — 확인창 → 모든 메시지에서 태그 제거(태그 탭 스와이프 삭제와 같은 계약) → 닫기.
  const handleDelete = async () => {
    if (busy || !token || !session) return;
    const ok = await confirmDialog({
      title: t('tags.deleteTitle'),
      message: t('tags.deleteMessage', { name: session.tag.name }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.deleteTag(token, session.tag.id);
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
      // 분류 수정 모달과 같은 자리(타이틀 오른쪽)의 휴지통 — 확인창 → 삭제 → 닫기.
      titleAccessory={
        <TouchableOpacity
          onPress={() => void handleDelete()}
          disabled={busy}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.delete')}
        >
          <Trash2 size={18} strokeWidth={2} color={colors.textTertiary} />
        </TouchableOpacity>
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
      {/* 프로필(색) 섹션 — 분류 수정 모달과 같은 문법(공용 컴포넌트). 미리보기는 # 타일로 미러. */}
      <ProfileColorSection
        key={session?.tag.id ?? 'none'}
        color={color}
        onChange={setColor}
        renderSwatch={(c, size) => <HashTile color={c} size={size} />}
      />
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
    error: {
      marginTop: 8,
    },
  });
