import { ReactNode, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { brutal, shiftLightness, ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { Text } from './Text';

type Variant = 'primary' | 'outline' | 'ghost';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** 라벨 왼쪽에 놓을 아이콘/로고 (예: Google G) */
  leading?: ReactNode;
}

// 플랫 버튼 (그림자 없음, 라운드 0):
// primary = accent 플랫 블록(보더 없음, BAT CTA 문법), 누르면 색이 살짝 깊어짐.
// outline = 1px ink 정밀선 박스. ghost = 밑줄 텍스트.
export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  leading,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // 누름 피드백: accent를 살짝 어둡게 (플랫 언어의 물리감)
  const pressedAccent = useMemo(
    () => shiftLightness(colors.accent, -7),
    [colors.accent],
  );
  const isDisabled = disabled || loading;
  const labelColor = variant === 'primary' ? colors.onAccent : colors.ink;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && { backgroundColor: colors.accent },
        variant === 'primary' && pressed && { backgroundColor: pressedAccent },
        variant === 'outline' && styles.outline,
        variant === 'outline' && pressed && styles.pressedNeutral,
        variant === 'ghost' && pressed && styles.dim,
        isDisabled && styles.dim,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={labelColor} />
      ) : leading ? (
        <View style={styles.row}>
          {leading}
          <Text
            variant="subheading"
            color={labelColor}
            style={variant === 'ghost' && styles.ghostLabel}
          >
            {label}
          </Text>
        </View>
      ) : (
        <Text
          variant="subheading"
          color={labelColor}
          style={variant === 'ghost' && styles.ghostLabel}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    base: {
      height: 52,
      borderRadius: brutal.radius,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    // 라벨 + 선행 아이콘(로고)을 나란히
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    outline: {
      borderWidth: brutal.borderWidth,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    pressedNeutral: {
      backgroundColor: colors.surface,
    },
    // 웹코어: 텍스트 버튼은 밑줄로 정직하게
    ghostLabel: {
      textDecorationLine: 'underline',
    },
    dim: {
      opacity: 0.45,
    },
  });
