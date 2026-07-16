import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput } from 'react-native';
import { api } from './api';
import { useAuth } from './auth';
import { ModalCard } from './components/ModalCard';
import { Text } from './components/Text';
import { ThemeColors } from './theme';
import { useTheme } from './theme-context';

// 이름 편집 모달의 상태를 루트에 둔다.
// 이유: 900px 교차 시 탭 레이아웃 트리가 리마운트되며 화면 state가 초기화되는데,
// 루트 상주 모달은 그 경계 밖이라 리사이즈 중에도 살아남는다. (NotifyHost와 같은 원리)
// 표현은 공용 ModalCard(분류 편집·확인 다이얼로그와 같은 문법) — 검정 풀스크린 오버레이는 폐기.

interface NameEditState {
  openNameEditor: () => void;
}

const NameEditContext = createContext<NameEditState | null>(null);

export function NameEditProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ openNameEditor: () => setOpen(true) }), []);
  return (
    <NameEditContext.Provider value={value}>
      {children}
      <NameEditHost open={open} onClose={() => setOpen(false)} />
    </NameEditContext.Provider>
  );
}

// 실제 모달. 저장 성공 시 auth 컨텍스트의 displayName을 갱신한다.
function NameEditHost({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { token, displayName, setDisplayName } = useAuth();

  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // 열릴 때마다 현재 이름으로 초기화.
  useEffect(() => {
    if (open) {
      setValue(displayName ?? '');
      setSaving(false);
      setError('');
    }
  }, [open, displayName]);

  const save = async () => {
    const next = value.trim();
    if (!next) {
      setError(t('more.nameRequired'));
      return;
    }
    if (!token) return;
    setSaving(true);
    setError('');
    try {
      const user = await api.updateProfile(token, { displayName: next });
      setDisplayName(user.displayName ?? null);
      onClose();
    } catch {
      setError(t('errors.requestFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalCard
      visible={open}
      title={t('more.editName')}
      onClose={onClose}
      confirmLabel={t('common.save')}
      cancelLabel={t('common.cancel')}
      onConfirm={save}
      busy={saving}
    >
      {/* 분류 이름 입력과 같은 일반 입력 박스 */}
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={(txt) => {
          setValue(txt);
          if (error) setError('');
        }}
        placeholder={t('more.namePlaceholder')}
        placeholderTextColor={colors.textTertiary}
        maxLength={30}
        autoFocus
        onSubmitEditing={save}
      />
      {error ? (
        <Text variant="caption" color={colors.textSecondary} style={styles.error}>
          {error}
        </Text>
      ) : null}
    </ModalCard>
  );
}

export function useNameEdit(): NameEditState {
  const value = useContext(NameEditContext);
  if (!value) {
    throw new Error('useNameEdit은 NameEditProvider 안에서만 쓸 수 있습니다');
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
