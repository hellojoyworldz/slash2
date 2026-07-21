import { ReactNode, useEffect, useMemo } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { Button } from './Button';
import { Text } from './Text';

// 메시지 ⋮ 메뉴에서 뜨는 두 픽커(분류·태그)의 공용 골격.
// ModalCard의 시각 문법(연한 스크림 + 중앙 카드 1px border·라운드 0·bg background·폭 360)을
// 재현한다. "고르기 → 저장" 방식: 행 탭은 로컬 선택만 바꾸고, 푸터의 공용 Button
// [취소(ghost)][저장(primary)]가 확정 지점이다 — 취소·스크림·Esc·뒤로가기는 모두 onClose로
// 선택을 버리고 닫는다(별도 되돌리기 로직 불필요 — 애초에 반영을 안 했으니까).
// 상단은 [텍스트 입력 + 추가] 한 줄(신규 항목 생성 — 생성 자체는 즉시, 선택 반영은 각 픽커가 로컬로).
// Esc·Android 뒤로가기·스크림 탭 닫기와 a11y(dialog)를 여기서 공통 처리한다.
export const PICKER_TILE_SIZE = 44;

interface PickerModalProps {
  visible: boolean;
  title: string;
  /** 취소·스크림·Esc·뒤로가기 — 선택을 버리고 닫는다(PATCH 없음). */
  onClose: () => void;
  /** 상단 입력줄 — 신규 항목 이름. */
  newName: string;
  onChangeNewName: (v: string) => void;
  /** [추가] 또는 입력 제출 시 호출. */
  onAdd: () => void;
  addPlaceholder: string;
  /** 생성 진행 중 — 입력 잠금 + 버튼 스피너. */
  adding: boolean;
  addLabel: string;
  cancelLabel: string;
  saveLabel: string;
  /** [저장] — 로컬 선택을 PATCH. 진행 중엔 버튼 스피너 + 취소도 잠근다(레이스 방지). */
  onSave: () => void;
  saving: boolean;
  /** 행 리스트(각 픽커가 PickerRow로 렌더). */
  children: ReactNode;
}

export function PickerModal({
  visible,
  title,
  onClose,
  newName,
  onChangeNewName,
  onAdd,
  addPlaceholder,
  adding,
  addLabel,
  cancelLabel,
  saveLabel,
  onSave,
  saving,
  children,
}: PickerModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Android 하드웨어 뒤로가기(다른 모달과 동일).
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  // 웹 Esc 닫기(role dialog 관례).
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
          <Text variant="heading" accessibilityRole="header" style={styles.title}>
            {title}
          </Text>

          {/* 상단: 신규 항목 생성 입력줄 + [추가] */}
          <View style={styles.addRow}>
            <TextInput
              style={styles.addInput}
              value={newName}
              onChangeText={onChangeNewName}
              placeholder={addPlaceholder}
              placeholderTextColor={colors.textTertiary}
              onSubmitEditing={onAdd}
              returnKeyType="done"
              editable={!adding}
            />
            <Button
              label={addLabel}
              variant="outline"
              onPress={onAdd}
              loading={adding}
              style={styles.addButton}
            />
          </View>

          {/* 목록이 길면 카드 안에서 스크롤. */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>

          {/* 픽커 공통 푸터: 우측 정렬 공용 Button [취소(ghost)][저장(primary)]. */}
          <View style={styles.closeRow}>
            <Button
              label={cancelLabel}
              variant="ghost"
              onPress={onClose}
              disabled={saving}
              style={styles.saveButton}
            />
            <Button
              label={saveLabel}
              variant="primary"
              onPress={onSave}
              loading={saving}
              style={styles.saveButton}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

interface PickerRowProps {
  /** 왼쪽 타일 — 분류=CategoryAvatar, 태그=HashTile. 둘 다 PICKER_TILE_SIZE. */
  tile: ReactNode;
  label: string;
  /** 선택(활성) — 배경을 surface로 채운다(앱의 "선택 active" 관례, 체크 아이콘 없음). */
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  /** 다중 선택(태그)=checkbox, 단일(분류)=radio — a11y 상태 표현만 다르다. */
  multi: boolean;
}

// 두 픽커 공용 행: [타일][이름]. 선택 표시는 surface 채움뿐(체크 아이콘·ink 칩 없음).
// 눌림 피드백도 surface 채움(플랫 언어) — 선택된 행은 눌려도 그대로 채워져 있다.
export function PickerRow({
  tile,
  label,
  selected,
  disabled = false,
  onPress,
  multi,
}: PickerRowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        (selected || pressed) && styles.rowActive,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={
        multi
          ? { checked: selected, disabled }
          : { selected, disabled }
      }
      accessibilityLabel={label}
    >
      {tile}
      <Text variant="body" style={styles.rowLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

// 태그 타일 — 무채색 surface 위 # 글리프(보더 없음). TagsScreen 타일과 동일 문법.
export function HashTile() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.hashTile}>
      <Text variant="subheading" color={colors.ink}>
        #
      </Text>
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
    title: {
      marginBottom: 14,
    },
    addRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    addInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 0,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.textPrimary,
      backgroundColor: colors.background,
    },
    addButton: {
      height: 42,
      minWidth: 68,
      paddingHorizontal: 14,
    },
    scroll: {
      flexShrink: 1,
      marginTop: 14,
    },
    scrollContent: {
      paddingBottom: 4,
    },
    // 우측 정렬 [취소][저장] — ModalCard의 액션 줄 문법과 통일.
    closeRow: {
      marginTop: 14,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 8,
    },
    saveButton: {
      height: 46,
      minWidth: 92,
    },
    // 각 행: [타일][이름], 타일 높이 기준 최소 높이.
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: PICKER_TILE_SIZE + 12,
      paddingVertical: 6,
      paddingHorizontal: 6,
      marginHorizontal: -6,
    },
    // 선택·눌림 = surface 채움(앱의 "선택 active" 관례). 그림자·보더 없음.
    rowActive: {
      backgroundColor: colors.surface,
    },
    rowLabel: {
      flex: 1,
      marginLeft: 12,
      paddingRight: 8,
    },
    // 무채색 # 타일 — 색은 분류의 것이라 태그는 색을 갖지 않는다.
    hashTile: {
      width: PICKER_TILE_SIZE,
      height: PICKER_TILE_SIZE,
      borderRadius: 0,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
