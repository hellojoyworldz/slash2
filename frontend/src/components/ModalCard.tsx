import { ReactNode, useEffect, useMemo } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { Button } from './Button';
import { Text } from './Text';

interface Props {
  visible: boolean;
  title: string;
  /** 스크림 탭·취소 버튼·Android 뒤로가기로 닫기 */
  onClose: () => void;
  /** 내용 슬롯 (메시지·입력·색 피커 등) */
  children?: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  /** 있으면 취소(ghost) 버튼 노출 — 없으면 확인 버튼만(알림형) */
  cancelLabel?: string;
  /** 확인 버튼을 outline(파괴적)으로 — 삭제 확인 등 */
  destructive?: boolean;
  /** 저장/처리 중: 확인은 스피너, 두 버튼 비활성 */
  busy?: boolean;
}

// 앱의 모든 모달·다이얼로그가 공유하는 단일 시각 문법.
// 연한 스크림 + 중앙 카드(1px `border` 토큰·라운드 0·bg background·일관된 패딩/폭)
// + 타이틀 + 내용 슬롯 + 우측 정렬 액션(공용 `Button`: ghost 취소 / primary·outline 확인).
// RN Modal이 아니라 절대위치 풀스크린 오버레이 — 별도 네이티브 계층이 없어 카드 안의
// react-native-gesture-handler(색 피커 레일)가 정상 동작한다. 호출부는 루트 상주 프로바이더
// (NotifyHost·NameEditProvider·CategoryEditProvider)라 900px 교차에도 살아남는다.
// 키보드 회피·작은 화면 스크롤은 여기서 공통 처리.
export function ModalCard({
  visible,
  title,
  onClose,
  children,
  confirmLabel,
  onConfirm,
  cancelLabel,
  destructive = false,
  busy = false,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Android 하드웨어 뒤로가기로 닫기(RN Modal의 onRequestClose 대체). 웹·iOS는 무영향.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <View style={styles.overlayRoot}>
      {/* 스크림 탭 = 닫기. 카드·컨트롤은 자기 터치를 소비해서 안 닫힌다. */}
      <Pressable
        style={styles.scrim}
        onPress={onClose}
        accessible={false}
        focusable={false}
      />
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
        accessibilityViewIsModal
      >
        <View style={styles.card}>
          <Text variant="heading" accessibilityRole="header">
            {title}
          </Text>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>

          <View style={styles.actions}>
            {cancelLabel ? (
              <Button
                label={cancelLabel}
                variant="ghost"
                onPress={onClose}
                disabled={busy}
                style={styles.actionButton}
              />
            ) : null}
            <Button
              label={confirmLabel}
              variant={destructive ? 'outline' : 'primary'}
              onPress={onConfirm}
              loading={busy}
              style={styles.actionButton}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
    card: {
      width: '100%',
      maxWidth: 360,
      maxHeight: '88%',
      backgroundColor: colors.background,
      borderRadius: 0,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 20,
      paddingTop: 22,
      paddingBottom: 16,
    },
    // 내용은 스크롤 영역 — 작은 화면·긴 내용(색 피커)도 카드 안에서 스크롤.
    scroll: {
      flexShrink: 1,
      marginTop: 14,
    },
    scrollContent: {
      paddingBottom: 4,
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
