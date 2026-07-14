import { Modal, StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { Button } from './Button';
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

// 앱 내부 모달. window.alert / Alert.alert 대신 쓰는 공용 다이얼로그.
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
  const hasCancel = !!cancelLabel;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay} accessibilityViewIsModal>
        <View style={styles.card}>
          <Text variant="heading" accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {message ? (
            <Text variant="body" color={colors.textSecondary} style={styles.message}>
              {message}
            </Text>
          ) : null}

          <View style={[styles.actions, !hasCancel && styles.actionsSingle]}>
            {hasCancel ? (
              <Button
                label={cancelLabel}
                onPress={onCancel}
                variant="ghost"
                style={styles.action}
              />
            ) : null}
            <Button
              label={confirmLabel}
              onPress={onConfirm}
              variant={destructive ? 'outline' : 'primary'}
              style={styles.action}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.background,
    borderRadius: 16,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 16,
  },
  title: {
    textAlign: 'center',
  },
  message: {
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 22,
  },
  actionsSingle: {
    justifyContent: 'center',
  },
  action: {
    flex: 1,
  },
});
