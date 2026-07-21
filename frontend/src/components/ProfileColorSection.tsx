import { ReactNode, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Palette, Plus, X } from 'lucide-react-native';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { api } from '../api';
import { useAuth } from '../auth';
import { CATEGORY_COLORS, ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { ColorPicker } from './ColorPicker';
import { Text } from './Text';

// 프로필 "색" 섹션 — 분류(category-edit)와 태그(tag-create)가 공유한다.
// 프리셋 8색 스와치 + 저장된 커스텀 스와치(users.customColors 공유·X 삭제) + '직접선택' ColorPicker
// + '프로필 추가'(현재 색 저장) 한 벌. 스와치·미리보기 모양만 호출부가 renderSwatch로 갈아끼운다
// (분류=CategoryAvatar, 태그=# 타일). 색 상태는 부모가 소유(color/onChange) — 여기선 색 선택 UI만.
// pickerOpen(직접선택 펼침)은 내부 상태 — 모달 세션이 바뀌면 부모가 key로 리마운트해 초기화한다.

// 프로필 스와치(미리보기) 크기.
const SWATCH = 40;
// 저장 가능한 커스텀 프로필 색 상한.
const MAX_CUSTOM = 16;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// 프리셋(8색) 중 하나인지 — 아니면 "직접선택(커스텀)" 색이다.
const isPresetColor = (hex: string) =>
  CATEGORY_COLORS.some((c) => c.hex.toUpperCase() === hex.toUpperCase());

interface Props {
  /** 현재 선택된 색(hex). null이면 무채(색 없음). 부모가 소유. */
  color: string | null;
  /** 스와치 탭·피커 스크럽으로 색이 바뀔 때. 무채 스와치는 null을 낸다. */
  onChange: (hex: string | null) => void;
  /** 스와치·미리보기 렌더러 — 분류=CategoryAvatar, 태그=# 타일. null은 각자의 무채 폴백. (color, size) => node. */
  renderSwatch: (color: string | null, size: number) => ReactNode;
}

export function ProfileColorSection({ color, onChange, renderSwatch }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { token, customColors, setCustomColors } = useAuth();
  // 직접선택(색 피커) 펼침 여부. 세션 전환 시 부모의 key 리마운트로 초기화된다.
  const [pickerOpen, setPickerOpen] = useState(false);

  const savedSet = useMemo(
    () => new Set(customColors.map((c) => c.toUpperCase())),
    [customColors],
  );
  const currentUpper = color?.toUpperCase() ?? null;
  // 현재 색이 (무채도) 프리셋도, 저장된 커스텀도 아니면 "아직 저장 안 한" 임시 스와치로 보여준다.
  const showTransient =
    color != null && !isPresetColor(color) && !savedSet.has(color.toUpperCase());
  const canAddColor = showTransient && customColors.length < MAX_CUSTOM;

  // 직접선택 색 피커 토글.
  const onPressPalette = useCallback(() => setPickerOpen((o) => !o), []);

  // 현재 색을 커스텀 프로필로 저장(서버 + 컨텍스트, 낙관적). 중복·상한 초과는 무시.
  const addCustomColor = async () => {
    if (!token || !canAddColor || color == null) return;
    const prev = customColors;
    const next = [...customColors, color];
    setCustomColors(next);
    try {
      await api.updateProfile(token, { customColors: next });
    } catch {
      setCustomColors(prev);
    }
  };

  // 커스텀 프로필 삭제(확인창 없음). 그 색을 쓰는 항목엔 영향 없음(색은 각 항목에 저장됨).
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
    <>
      {/* 프로필(색) 선택 — 각 스와치가 그 색의 미니 미리보기(선택 시 어떤 프로필이 될지) */}
      <Text
        variant="caption"
        color={colors.textSecondary}
        style={styles.profileLabel}
      >
        {t('friends.profileLabel')}
      </Text>
      <View style={styles.swatchRow}>
        {/* 무채색(색 없음) — 값 null. 미리보기는 각자의 surface 폴백 타일(분류 아바타 / # 타일). 삭제 불가 */}
        <TouchableOpacity
          key="none"
          style={[styles.swatchRing, currentUpper === null && styles.swatchRingActive]}
          onPress={() => {
            onChange(null);
            setPickerOpen(false);
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ selected: currentUpper === null }}
          accessibilityLabel={t('friends.colorNone')}
        >
          {renderSwatch(null, SWATCH)}
        </TouchableOpacity>

        {/* 기본 프리셋 8색 — 삭제 불가(X 없음) */}
        {CATEGORY_COLORS.map((c) => {
          const selected = currentUpper === c.hex.toUpperCase();
          return (
            <TouchableOpacity
              key={c.key}
              style={[styles.swatchRing, selected && styles.swatchRingActive]}
              onPress={() => {
                onChange(c.hex);
                setPickerOpen(false);
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={t(`friends.color${cap(c.key)}`)}
            >
              {renderSwatch(c.hex, SWATCH)}
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
                  onChange(hex);
                  setPickerOpen(false);
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={t('friends.colorCustom')}
              >
                {renderSwatch(hex, SWATCH)}
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
            {renderSwatch(color, SWATCH)}
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
          // 피커는 색을 고르는 계기판 — 무채(null)일 때는 첫 프리셋을 시작점으로(스크럽 즉시 실색을 낸다).
          value={color ?? CATEGORY_COLORS[0].hex}
          onChange={onChange}
          hueLabel={t('friends.pickerHue')}
          lightnessLabel={t('friends.pickerLightness')}
          previewAccessory={addProfileButton}
        />
      ) : null}
    </>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
    // 스와치 = 미니 미리보기. 선택 표시는 ink 링(DESIGN — 진한 보더는 선택에만).
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
    // 직접선택(색 피커 열기) 셀 — 미리보기와 같은 크기의 면 + 팔레트 아이콘.
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
  });
