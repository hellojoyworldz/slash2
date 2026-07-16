import { ReactNode, useMemo } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { brutal, ThemeColors } from '../theme';
import { useTheme } from '../theme-context';

interface Props {
  children: ReactNode;
  /** 하드 섀도 오프셋(px). 0이면 보더만. */
  offset?: number;
  /** true면 그림자가 사라지고 내용이 그림자 자리로 내려앉는다 (눌림) */
  pressed?: boolean;
  /** 바깥 래퍼 스타일 (margin 등) */
  style?: StyleProp<ViewStyle>;
  /** 내용 박스 스타일 (배경색·패딩 등) */
  contentStyle?: StyleProp<ViewStyle>;
}

// 네오 브루탈리즘 프레임: 2px ink 보더 + 블러 0 오프셋 섀도 + 라운드 0.
// 섀도는 그림자 색 View를 뒤에 깔아 만든다(안드로이드 포함 전 플랫폼 동일).
export function BrutalFrame({
  children,
  offset = brutal.offset,
  pressed = false,
  style,
  contentStyle,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={[{ paddingRight: offset, paddingBottom: offset }, style]}>
      {offset > 0 && !pressed && (
        <View style={[styles.backing, { top: offset, left: offset }]} />
      )}
      <View
        style={[
          styles.content,
          offset > 0 &&
            pressed && {
              transform: [{ translateX: offset }, { translateY: offset }],
            },
          contentStyle,
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backing: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      backgroundColor: colors.ink,
    },
    content: {
      borderWidth: brutal.borderWidth,
      borderColor: colors.border,
      borderRadius: brutal.radius,
      backgroundColor: colors.background,
    },
  });
