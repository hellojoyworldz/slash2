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
import { Palette, Plus, X } from 'lucide-react-native';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from './api';
import { useAuth } from './auth';
import { CategoryAvatar } from './components/CategoryAvatar';
import { ColorPicker } from './components/ColorPicker';
import { ModalCard } from './components/ModalCard';
import { Text } from './components/Text';
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

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// 프로필 스와치(미니 아바타) 크기 — 선택하면 어떤 프로필이 될지 스와치가 그대로 보여준다.
const SWATCH = 40;
// 저장 가능한 커스텀 프로필 색 상한.
const MAX_CUSTOM = 16;

// 편집기가 필요로 하는 분류의 최소 형태(id·이름·색). Friend·RoomRow 둘 다 여기에 맞는다.
export interface EditableCategory {
  id: string;
  name: string;
  color?: string | null;
  description?: string | null;
}

// 설명(상태메시지) 최대 길이 — 백엔드 MaxLength(80)과 일치.
const DESCRIPTION_MAX = 80;

// 프리셋(8색) 중 하나인지 — 아니면 "직접선택(커스텀)" 색이다.
const isPresetColor = (hex: string) =>
  CATEGORY_COLORS.some((c) => c.hex.toUpperCase() === hex.toUpperCase());

// 열림 세션. self=true → "전체" 프로필. category=값 → 그 분류 수정. 둘 다 없으면 분류 추가.
interface EditSession {
  category: EditableCategory | null;
  self: boolean;
  // 추가(생성) 모드 기본 선택색. 호출부가 자기 분류 목록으로 pickDefaultCategoryColor를 계산해 넘긴다.
  defaultColor?: string;
}

interface CategoryEditState {
  /**
   * 무인자 = 분류 추가, category 전달 = 그 분류 수정, { self:true } = "전체" 프로필 편집.
   * defaultColor는 추가(무인자) 호출에서만 의미가 있다 — 미사용 프리셋 순서대로 호출부가 계산해 넘긴다.
   */
  open: (arg?: EditableCategory | { self: true }, defaultColor?: string) => void;
}

const CategoryEditContext = createContext<CategoryEditState | null>(null);

export function CategoryEditProvider({ children }: { children: ReactNode }) {
  // Provider는 "열림 세션"만 들고 있는다 — 폼 상태(이름·색 등)는 형제 컴포넌트가 소유해
  // 타이핑마다 children(앱 전체)이 리렌더되지 않게 한다.
  const [session, setSession] = useState<EditSession | null>(null);
  const open = useCallback(
    (arg?: EditableCategory | { self: true }, defaultColor?: string) => {
      if (arg && 'self' in arg) setSession({ category: null, self: true });
      else setSession({ category: arg ?? null, self: false, defaultColor });
    },
    [],
  );
  const value = useMemo(() => ({ open }), [open]);
  return (
    <CategoryEditContext.Provider value={value}>
      {children}
      <CategoryEditModal session={session} onClose={() => setSession(null)} />
    </CategoryEditContext.Provider>
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
    customColors,
    setCustomColors,
  } = useAuth();
  // 편집 결과를 채팅 목록·개수·상주 대화 헤더로 전파한다.
  const { room, setRoom, bumpRooms } = useSelectedRoom();

  // 편집 대상. self 모드 / 수정(category) / 추가(둘 다 없음)를 구분한다.
  const [self, setSelf] = useState(false);
  const [editing, setEditing] = useState<EditableCategory | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [color, setColor] = useState(CATEGORY_COLORS[0].hex);
  // 직접선택(색 피커) 펼침 여부.
  const [pickerOpen, setPickerOpen] = useState(false);
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
    // self=현재 selfColor(없으면 기본 검정), 수정=그 분류 색, 추가=호출부가 계산한 기본색(없으면 첫 프리셋).
    const initialColor = isSelf
      ? selfColorRef.current ?? SELF_DEFAULT_COLOR
      : cat?.color ?? session.defaultColor ?? CATEGORY_COLORS[0].hex;
    setSelf(isSelf);
    setEditing(cat);
    setNameInput(cat?.name ?? '');
    setDescriptionInput(isSelf ? selfDescriptionRef.current ?? '' : cat?.description ?? '');
    setColor(initialColor);
    setPickerOpen(false);
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

  // 직접선택 색 피커 토글.
  const onPressPalette = useCallback(() => setPickerOpen((o) => !o), []);
  // 색 피커에서 스크럽한 색을 현재 선택으로.
  const onPickColor = useCallback((hex: string) => setColor(hex), []);

  const savedSet = useMemo(
    () => new Set(customColors.map((c) => c.toUpperCase())),
    [customColors],
  );
  const currentUpper = color.toUpperCase();
  // 현재 색이 프리셋도, 저장된 커스텀도 아니면 "아직 저장 안 한" 임시 스와치로 보여준다.
  const showTransient = !isPresetColor(color) && !savedSet.has(currentUpper);
  const canAddColor = showTransient && customColors.length < MAX_CUSTOM;

  // 현재 색을 커스텀 프로필로 저장(서버 + 컨텍스트, 낙관적). 중복·상한 초과는 무시.
  const addCustomColor = async () => {
    if (!token || !canAddColor) return;
    const prev = customColors;
    const next = [...customColors, color];
    setCustomColors(next);
    try {
      await api.updateProfile(token, { customColors: next });
    } catch {
      setCustomColors(prev);
    }
  };

  // 커스텀 프로필 삭제(확인창 없음). 그 색을 쓰는 분류엔 영향 없음(색은 friend.color에 저장됨).
  const removeCustomColor = async (hex: string) => {
    if (!token) return;
    const prev = customColors;
    const next = customColors.filter(
      (c) => c.toUpperCase() !== hex.toUpperCase(),
    );
    setCustomColors(next);
    try {
      await api.updateProfile(token, { customColors: next });
    } catch {
      setCustomColors(prev);
    }
  };

  // self(전체)도 타이틀은 일반 분류와 동일한 "분류 수정" — 이름 칸이 이미 "전체"를 보여준다.
  const title = self
    ? t('friends.editTitle')
    : editing
      ? t('friends.editTitle')
      : t('friends.addTitle');
  const saveLabel = self || editing ? t('common.save') : t('friends.add');

  // 미리보기 옆 "프로필 추가" 버튼 — 지금 고른 색을 스와치 목록에 저장.
  const addProfileButton = (
    <TouchableOpacity
      style={[styles.addProfile, !canAddColor && styles.addProfileDisabled]}
      onPress={addCustomColor}
      disabled={!canAddColor}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ disabled: !canAddColor }}
      accessibilityLabel={t('friends.addProfile')}
    >
      <Plus size={16} strokeWidth={2} color={colors.ink} />
      <Text variant="label" color={colors.textSecondary}>
        {t('friends.addProfile')}
      </Text>
    </TouchableOpacity>
  );

  return (
    <ModalCard
      visible={!!session}
      title={title}
      onClose={onClose}
      confirmLabel={saveLabel}
      cancelLabel={t('common.cancel')}
      onConfirm={handleSubmit}
      busy={submitting}
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
      />

      {/* 프로필(색) 선택 — 각 스와치가 그 색의 미니 아바타(선택 시 어떤 프로필이 될지) */}
      <Text
        variant="caption"
        color={colors.textSecondary}
        style={styles.profileLabel}
      >
        {t('friends.profileLabel')}
      </Text>
      <View style={styles.swatchRow}>
        {/* 기본 프리셋 8색 — 삭제 불가(X 없음) */}
        {CATEGORY_COLORS.map((c) => {
          const selected = currentUpper === c.hex.toUpperCase();
          return (
            <TouchableOpacity
              key={c.key}
              style={[styles.swatchRing, selected && styles.swatchRingActive]}
              onPress={() => {
                setColor(c.hex);
                setPickerOpen(false);
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={t(`friends.color${cap(c.key)}`)}
            >
              <CategoryAvatar color={c.hex} size={SWATCH} />
            </TouchableOpacity>
          );
        })}

        {/* 저장된 커스텀 프로필 — 우상단 X 배지로 즉시 삭제 */}
        {customColors.map((hex) => {
          const selected = currentUpper === hex.toUpperCase();
          return (
            <View key={hex} style={styles.swatchWrap}>
              <TouchableOpacity
                style={[styles.swatchRing, selected && styles.swatchRingActive]}
                onPress={() => {
                  setColor(hex);
                  setPickerOpen(false);
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={t('friends.colorCustom')}
              >
                <CategoryAvatar color={hex} size={SWATCH} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.removeBadge}
                onPress={() => removeCustomColor(hex)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('friends.removeProfile')}
              >
                <X size={10} strokeWidth={2.5} color={colors.inverse} />
              </TouchableOpacity>
            </View>
          );
        })}

        {/* 아직 저장 안 한 현재 커스텀 색(임시) — 선택 상태로 보여준다(X 없음) */}
        {showTransient ? (
          <TouchableOpacity
            style={[styles.swatchRing, styles.swatchRingActive]}
            onPress={() => setPickerOpen(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: true }}
            accessibilityLabel={t('friends.colorCustom')}
          >
            <CategoryAvatar color={color} size={SWATCH} />
          </TouchableOpacity>
        ) : null}

        {/* 직접선택 — 색 피커 토글 */}
        <TouchableOpacity
          style={styles.swatchRing}
          onPress={onPressPalette}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ expanded: pickerOpen }}
          accessibilityLabel={t('friends.colorCustom')}
        >
          <View style={styles.customCell}>
            <Palette size={20} strokeWidth={2} color={colors.textSecondary} />
          </View>
        </TouchableOpacity>
      </View>

      {/* 직접선택 색 피커 — 색조·명도 레일 + 미리보기 옆 "프로필 추가" */}
      {pickerOpen ? (
        <ColorPicker
          value={color}
          onChange={onPickColor}
          hueLabel={t('friends.pickerHue')}
          lightnessLabel={t('friends.pickerLightness')}
          previewAccessory={addProfileButton}
        />
      ) : null}

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
  profileLabel: {
    marginTop: 16,
    marginBottom: 10,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  // 커스텀 스와치 + X 배지를 겹치기 위한 래퍼(배지는 절대위치로 모서리에 얹힌다).
  swatchWrap: {
    position: 'relative',
  },
  // 스와치 = 미니 아바타. 선택 표시는 ink 링(DESIGN — 진한 보더는 선택에만).
  swatchRing: {
    width: SWATCH + 6,
    height: SWATCH + 6,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchRingActive: {
    borderColor: colors.ink,
  },
  // 우상단 삭제 배지 — 작은 ink 사각 칩(라운드 0) + 흰 X. 배경색 1px 보더로 스와치와 분리.
  removeBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 0,
    backgroundColor: colors.ink,
    borderWidth: 1,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 직접선택(색 피커 열기) 셀 — 아바타와 같은 크기의 면 + 팔레트 아이콘.
  customCell: {
    width: SWATCH,
    height: SWATCH,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // "프로필 추가" — 1px 아웃라인 칩(플랫). 추가 불가면 흐리게.
  addProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 0,
  },
  addProfileDisabled: {
    opacity: 0.4,
  },
  error: {
    marginTop: 8,
  },
});
