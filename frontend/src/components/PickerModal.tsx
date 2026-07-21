import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { Button } from './Button';
import { Text } from './Text';

// 픽커 안에서 "특정 항목으로 스크롤"을 위한 배선. 각 행이 스크롤 콘텐츠 기준 자기 y offset을
// register(key, y)로 등록하고(onLayout), PickerModal이 scrollToKey가 가리키는 offset으로 스크롤한다.
// - 추가 직후: 새 항목 key로 스크롤(어디에 들어가든 보이게).
// - 열릴 때 선택 항목이 있으면: 그 항목 key로 스크롤(목록이 길어 화면 밖일 때).
interface PickerScrollCtx {
  register: (key: string, y: number) => void;
}
const PickerScrollContext = createContext<PickerScrollCtx | null>(null);

// 행이 자기 onLayout을 스크롤 레지스트리에 연결한다. key가 없으면 no-op.
export function usePickerRowScroll(key?: string) {
  const ctx = useContext(PickerScrollContext);
  return useCallback(
    (e: LayoutChangeEvent) => {
      if (ctx && key) ctx.register(key, e.nativeEvent.layout.y);
    },
    [ctx, key],
  );
}

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
  /** 관리 모드처럼 확정 액션이 없을 때: 밑줄(ghost) [닫기] 하나만 둔다.
   *  (버튼 색 규칙 — 검정 채움은 상태를 확정·변경하는 버튼에만. 닫기/취소는 항상 ghost.) */
  closeOnly?: boolean;
  /** 관리 모드 인라인 추가의 '설명 (선택)' 입력. 셋 다 넘길 때만 렌더(선택 픽커엔 없음). */
  newDescription?: string;
  onChangeNewDescription?: (v: string) => void;
  descriptionPlaceholder?: string;
  /** 이 key를 가진 행으로 스크롤(추가 직후 새 항목 / 열릴 때 선택 항목). 값이 바뀔 때마다 재시도. */
  scrollToKey?: string | null;
  /** 타이틀 행 오른쪽 슬롯(선택) — 전체 삭제 휴지통 등. 항목이 없을 땐 호출부가 null로 숨긴다. */
  titleAccessory?: ReactNode;
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
  closeOnly = false,
  newDescription,
  onChangeNewDescription,
  descriptionPlaceholder,
  scrollToKey = null,
  titleAccessory,
  children,
}: PickerModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // 스크롤 레지스트리 — 행의 y offset을 key로 모으고, scrollToKey로 그 offset까지 스크롤한다.
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Map<string, number>>(new Map());
  const pendingKey = useRef<string | null>(null);

  const scrollToY = useCallback((y: number) => {
    // 항목 상단이 살짝 여백을 두고 보이도록 6px 위로.
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 6), animated: true });
  }, []);

  // 행이 레이아웃되면 offset 등록. 마침 그 key를 기다리고 있었으면 즉시 스크롤(추가 직후 케이스).
  const register = useCallback(
    (key: string, y: number) => {
      offsets.current.set(key, y);
      if (pendingKey.current === key) {
        pendingKey.current = null;
        requestAnimationFrame(() => scrollToY(y));
      }
    },
    [scrollToY],
  );
  const scrollCtx = useMemo<PickerScrollCtx>(() => ({ register }), [register]);

  // scrollToKey가 지정되면: 이미 offset을 알면 바로, 아니면 등록될 때까지 pending으로 대기.
  // null이면 대기 중인 스크롤을 취소한다(관리 모드처럼 선택이 없어 스크롤할 항목이 없을 때).
  useEffect(() => {
    if (!visible) return;
    if (!scrollToKey) {
      pendingKey.current = null;
      return;
    }
    const known = offsets.current.get(scrollToKey);
    if (known != null) {
      requestAnimationFrame(() => scrollToY(known));
    } else {
      pendingKey.current = scrollToKey;
    }
  }, [visible, scrollToKey, scrollToY]);

  // 닫히면 레지스트리 초기화(다음 열림 때 stale offset으로 잘못 스크롤하지 않게).
  useEffect(() => {
    if (visible) return;
    offsets.current.clear();
    pendingKey.current = null;
  }, [visible]);

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
          <View style={styles.titleRow}>
            <Text
              variant="heading"
              accessibilityRole="header"
              style={styles.titleText}
            >
              {title}
            </Text>
            {/* 타이틀 오른쪽 보조 슬롯(전체 삭제 휴지통 등) — 없으면 자리 차지 안 함. */}
            {titleAccessory ? (
              <View style={styles.titleAccessory}>{titleAccessory}</View>
            ) : null}
          </View>

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

          {/* 관리 모드 인라인 추가의 '설명 (선택)' — 셋 다 넘어올 때만(선택 픽커엔 없음). */}
          {onChangeNewDescription ? (
            <TextInput
              style={styles.descriptionInput}
              value={newDescription}
              onChangeText={onChangeNewDescription}
              placeholder={descriptionPlaceholder}
              placeholderTextColor={colors.textTertiary}
              onSubmitEditing={onAdd}
              returnKeyType="done"
              editable={!adding}
            />
          ) : null}

          {/* 목록이 길면 카드 안에서 스크롤. 행들은 scrollCtx로 자기 offset을 등록한다. */}
          <PickerScrollContext.Provider value={scrollCtx}>
            <ScrollView
              ref={scrollRef}
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          </PickerScrollContext.Provider>

          {/* 픽커 공통 푸터: 우측 정렬 공용 Button.
              선택 픽커 = [취소(ghost)][저장(primary)]. 관리 모드(closeOnly) = [닫기(ghost)] 하나만
              — 검정 채움(primary)은 상태를 확정·변경하는 버튼에만, 닫기/취소는 항상 밑줄(ghost). */}
          <View style={styles.closeRow}>
            {closeOnly ? (
              <Button
                label={saveLabel}
                variant="ghost"
                onPress={onSave}
                style={styles.saveButton}
              />
            ) : (
              <>
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
              </>
            )}
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
  /** 이름 밑 회색 한 줄(선택) — 분류·태그의 설명. 목록 화면 행과 같은 문법. */
  description?: string | null;
  /** 행 오른쪽 휴지통(항목 삭제, 선택). 누르면 호출부가 확인창 → 삭제를 수행한다. */
  onDelete?: () => void;
  /** 휴지통 접근성 라벨(onDelete와 함께). */
  deleteLabel?: string;
  /** 선택(활성) — 배경을 surface로 채운다(앱의 "선택 active" 관례, 체크 아이콘 없음). */
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  /** 다중 선택(태그)=checkbox, 단일(분류)=radio — a11y 상태 표현만 다르다. */
  multi: boolean;
  /** 스크롤 타깃 등록용 key(추가 직후·선택 항목으로 스크롤). 보통 항목 id. */
  scrollKey?: string;
}

// 두 픽커 공용 행: [타일][이름]. 선택 표시는 surface 채움뿐(체크 아이콘·ink 칩 없음).
// 눌림 피드백도 surface 채움(플랫 언어) — 선택된 행은 눌려도 그대로 채워져 있다.
export function PickerRow({
  tile,
  label,
  description,
  selected,
  disabled = false,
  onPress,
  multi,
  scrollKey,
  onDelete,
  deleteLabel,
}: PickerRowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const onLayout = usePickerRowScroll(scrollKey);
  return (
    <Pressable
      onLayout={onLayout}
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
      {/* 이름(+설명 한 줄) — 목록 화면(분류/태그 행)과 같은 문법으로 설명을 보여준다. */}
      <View style={styles.rowLabelCol}>
        <Text variant="body" style={styles.rowLabel} numberOfLines={1}>
          {label}
        </Text>
        {description ? (
          <Text variant="caption" color={colors.textTertiary} numberOfLines={1}>
            {description}
          </Text>
        ) : null}
      </View>
      {/* 행 오른쪽 휴지통 — 항목 삭제(호출부가 확인창·삭제 담당). 행 탭(선택)과 분리된 버튼. */}
      {onDelete ? (
        <TouchableOpacity
          style={styles.rowDelete}
          onPress={onDelete}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={deleteLabel ?? label}
        >
          <Trash2 size={16} strokeWidth={2} color={colors.textTertiary} />
        </TouchableOpacity>
      ) : null}
    </Pressable>
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
    // 타이틀 + 오른쪽 보조 슬롯(전체 삭제 휴지통 등)을 한 줄에 양끝 정렬.
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    titleText: {
      flexShrink: 1,
    },
    titleAccessory: {
      marginLeft: 8,
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
    // 관리 모드 '설명 (선택)' — 이름 입력과 같은 박스, 아래로 한 칸.
    descriptionInput: {
      marginTop: 8,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 0,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.textPrimary,
      backgroundColor: colors.background,
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
    // 이름(+설명) 세로 컬럼 — 타일 오른쪽을 채운다.
    rowLabelCol: {
      flex: 1,
      marginLeft: 12,
      paddingRight: 8,
    },
    rowLabel: {},
    // 행 오른쪽 휴지통 — 조용한 tertiary, 터치는 hitSlop 보강.
    rowDelete: {
      paddingHorizontal: 4,
      paddingVertical: 4,
    },
  });
