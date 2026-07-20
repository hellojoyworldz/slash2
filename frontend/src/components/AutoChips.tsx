import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { ListFilter, resolveAutoOrder } from '../auto-filter';
import { useAuth } from '../auth';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { Text } from './Text';

interface Props {
  /** 현재 선택된 칩. 채팅 뷰·목록 모드가 부모(ChatScreen)에서 공유하는 controlled 값. */
  value: ListFilter;
  onChange: (filter: ListFilter) => void;
}

// 자동구분 칩 줄: [전체][장소][영상][상품][글][메모].
// 1px border, 라운드 0, 활성 = ink 채움 + inverse 글자(DESIGN.md 활성 선택 문법).
export function AutoChips({ value, onChange }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { autoOrder } = useAuth();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // 칩 순서 = '전체' + 사용자 자동구분 순서('link'는 칩이 없어 제외 — 미분류 링크는 '전체'에서만).
  const filters = useMemo<ListFilter[]>(
    () => [
      'all',
      ...resolveAutoOrder(autoOrder).filter(
        (k): k is Exclude<ListFilter, 'all'> => k !== 'link',
      ),
    ],
    [autoOrder],
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // ScrollView 기본 flexGrow/Shrink 때문에 flex:1 리스트 옆에서 높이가 0으로
      // 짜부라진다(웹) — 칩 줄은 내용 높이로 고정.
      style={styles.chipScroll}
      contentContainerStyle={styles.chipRow}
    >
      {filters.map((f) => {
        const active = value === f;
        const label = f === 'all' ? t('viewMode.filterAll') : t(`auto.names.${f}`);
        return (
          <TouchableOpacity
            key={f}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(f)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: active }}
          >
            <Text
              variant="label"
              color={active ? colors.onAccent : colors.textSecondary}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    chipScroll: {
      flexGrow: 0,
      flexShrink: 0,
    },
    chipRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 0,
      backgroundColor: colors.background,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    chipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
  });
