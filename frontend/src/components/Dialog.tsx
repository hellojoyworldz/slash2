import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { ModalCard } from './ModalCard';
import { Text } from './Text';

interface Props {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string; // 있으면 취소 버튼 노출(확인형), 없으면 단일 버튼(알림형)
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}

// notify()/confirmDialog()의 표시 — 공용 ModalCard 위에 메시지 텍스트만 얹는 얇은 어댑터.
// (window.alert / Alert.alert 대체. 카드·버튼·스크림 문법은 전부 ModalCard가 소유한다.)
export function Dialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  destructive = false,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <ModalCard
      visible={visible}
      title={title}
      onClose={onCancel}
      confirmLabel={confirmLabel}
      onConfirm={onConfirm}
      cancelLabel={cancelLabel}
      destructive={destructive}
    >
      {message ? (
        <Text variant="body" color={colors.textSecondary} style={styles.message}>
          {message}
        </Text>
      ) : null}
    </ModalCard>
  );
}

const makeStyles = (_colors: ThemeColors) =>
  StyleSheet.create({
    message: {
      lineHeight: 21,
    },
  });
