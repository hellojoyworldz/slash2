import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput } from 'react-native';
import { api, Message } from '../api';
import { notify } from '../notify';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { ModalCard } from './ModalCard';

interface Props {
  visible: boolean;
  /** 수정할 메시지(열림 대상). null이면 내용 프리필 없음. */
  message: Message | null;
  token: string | null;
  onClose: () => void;
  /** 저장 성공 시 서버가 돌려준 최신 메시지로 목록·상세를 갱신하도록 알린다. */
  onSaved: (updated: Message) => void;
}

// 메시지 내용(content) 수정 모달 — 앱 공용 ModalCard 문법(스크림·카드·타이틀·우측 액션).
// 채팅형·목록형이 공유한다. 자체적으로 api를 호출하고 성공 시 onSaved로 최신 메시지를 넘긴다.
export function MessageEditModal({
  visible,
  message,
  token,
  onClose,
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  // 열릴 때(또는 대상 변경 시) 현재 내용으로 프리필.
  useEffect(() => {
    if (visible) setText(message?.content ?? '');
  }, [visible, message?.id, message?.content]);

  const submit = async () => {
    const content = text.trim();
    if (!content || busy || !token || !message) return;
    setBusy(true);
    try {
      const updated = await api.updateMessageContent(
        token,
        message.id,
        content,
        message.friendId ?? null,
      );
      onSaved(updated);
      onClose();
    } catch {
      notify(t('common.notice'), t('chat.tryAgainLater'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalCard
      visible={visible}
      title={t('chat.menu.editContent')}
      onClose={onClose}
      confirmLabel={t('common.save')}
      cancelLabel={t('common.cancel')}
      onConfirm={submit}
      busy={busy}
    >
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder={t('chat.inputPlaceholder')}
        placeholderTextColor={colors.textTertiary}
        multiline
        autoFocus
        editable={!busy}
      />
    </ModalCard>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    input: {
      marginTop: 2,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 0,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 16,
      minHeight: 96,
      maxHeight: 200,
      textAlignVertical: 'top',
      color: colors.textPrimary,
      backgroundColor: colors.background,
    },
  });
