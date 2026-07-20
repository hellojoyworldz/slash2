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
import { StyleSheet, TextInput } from 'react-native';
import { api, Tag } from './api';
import { useAuth } from './auth';
import { ModalCard } from './components/ModalCard';
import { Text } from './components/Text';
import { errorText } from './i18n/errors';
import { useSelectedRoom } from './selected-room';
import { ThemeColors } from './theme';
import { useTheme } from './theme-context';

// 태그 추가·이름수정 모달을 루트에 상주시킨다(NameEditProvider와 같은 원리).
// 예전엔 각 화면이 ModalCard로 렌더해 목록 패널만 덮이는 통일성 문제가 있었다.
// 루트로 올려 항상 전체 화면 스크림 + 900px 교차 생존. 시각 문법(ModalCard 텍스트 입력 하나)은 그대로.
// - openTagCreate(onCreated?)  = 새 태그 추가.
// - openTagRename(tag, onDone?) = 그 태그 이름 수정(프리필).
// 태그 삭제·고정은 태그 탭 스와이프가 담당한다(여긴 이름만 다룬다).

type TagEditSession =
  | { mode: 'create'; onDone?: (tag: Tag) => void }
  | { mode: 'rename'; tag: Tag; onDone?: (tag: Tag) => void };

interface TagCreateState {
  openTagCreate: (onCreated?: (tag: Tag) => void) => void;
  openTagRename: (tag: Tag, onRenamed?: (tag: Tag) => void) => void;
}

const TagCreateContext = createContext<TagCreateState | null>(null);

export function TagCreateProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<TagEditSession | null>(null);
  const openTagCreate = useCallback(
    (onCreated?: (tag: Tag) => void) => setSession({ mode: 'create', onDone: onCreated }),
    [],
  );
  const openTagRename = useCallback(
    (tag: Tag, onRenamed?: (tag: Tag) => void) =>
      setSession({ mode: 'rename', tag, onDone: onRenamed }),
    [],
  );
  const value = useMemo(
    () => ({ openTagCreate, openTagRename }),
    [openTagCreate, openTagRename],
  );
  return (
    <TagCreateContext.Provider value={value}>
      {children}
      <TagCreateHost session={session} onClose={() => setSession(null)} />
    </TagCreateContext.Provider>
  );
}

function TagCreateHost({
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
  // 태그 개수·목록을 구독하는 화면들(태그 탭·보드)이 재조회하도록 신호를 보낸다.
  const { bumpRooms } = useSelectedRoom();

  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  // 중복(409 tag_name_taken) 등은 카드 안 인라인 문구로 노출한다(name-edit·category-edit과 통일).
  const [error, setError] = useState('');

  const isRename = session?.mode === 'rename';

  // 세션이 새로 열릴 때마다 프리필/초기화(닫힘 땐 유지 — 재오픈 전 깜빡임 방지).
  useEffect(() => {
    if (!session) return;
    setName(session.mode === 'rename' ? session.tag.name : '');
    setBusy(false);
    setError('');
  }, [session]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy || !token || !session) return;
    setBusy(true);
    setError('');
    try {
      if (session.mode === 'rename') {
        const updated = await api.updateTag(token, session.tag.id, trimmed);
        bumpRooms();
        session.onDone?.(updated);
      } else {
        const created = await api.createTag(token, trimmed);
        bumpRooms();
        session.onDone?.(created);
      }
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
      title={isRename ? t('tags.editTitle') : t('tags.addTitle')}
      onClose={onClose}
      confirmLabel={isRename ? t('common.save') : t('common.add')}
      cancelLabel={t('common.cancel')}
      onConfirm={submit}
      busy={busy}
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
    error: {
      marginTop: 8,
    },
  });
