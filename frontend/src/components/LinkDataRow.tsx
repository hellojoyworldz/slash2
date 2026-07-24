import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { rowFill } from '../row-hover';
import { hexAlpha, ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { Text } from './Text';

interface Props {
  /** 왼쪽 라벨 (예: 영업·가격·주소) — micro 모노, textTertiary. i18n 문구를 넘긴다. */
  label: string;
  /** 오른쪽 값 — micro 모노, textPrimary, 우측 정렬. */
  value: string;
  /** 있으면 행 전체가 눌리는 링크(출처 행 → 원본 URL 열기). */
  onPress?: () => void;
  /** 값 최대 줄 수 (기본 1). 시트의 긴 주소는 2줄 허용. */
  numberOfLines?: number;
  /** onPress가 있을 때의 접근성 라벨 (없으면 값 텍스트가 접근명). */
  accessibilityLabel?: string;
}

// 마이크로그래픽 리더라인: `라벨 ┄┄(점선)┄┄ 값`.
// 라벨·값은 micro(모노), 가운데 리더는 flex로 늘어나는 점선 하단 보더(View).
// RN에선 borderStyle:'dotted'가 borderWidth를 요구하므로 얇은 View의 borderBottomWidth로 그린다
// (프로젝트의 sheetDivider와 동일 기법, 3플랫폼 공통). 카드 데이터 행·장소 시트 리더라인 공용.
export function LinkDataRow({
  label,
  value,
  onPress,
  numberOfLines = 1,
  accessibilityLabel,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const body = (
    <View style={styles.row}>
      <Text variant="micro" color={colors.textTertiary} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.leader} />
      <Text
        variant="micro"
        color={colors.textPrimary}
        style={styles.value}
        numberOfLines={numberOfLines}
      >
        {value}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="link"
        accessibilityLabel={accessibilityLabel}
        style={({ hovered, pressed }) => rowFill(colors, { hovered, pressed })}
      >
        {body}
      </Pressable>
    );
  }
  return body;
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      // 라벨·값 바닥을 맞춰 점선 리더가 텍스트 베이스라인 근처에 앉게 한다.
      alignItems: 'flex-end',
      marginTop: 6,
    },
    // flex:1로 남는 가로를 채우는 점선. 값이 길면 minWidth까지 줄고 값이 우선.
    leader: {
      flex: 1,
      minWidth: 16,
      marginHorizontal: 6,
      marginBottom: 3,
      borderBottomWidth: 1,
      borderStyle: 'dotted',
      borderColor: hexAlpha(colors.textTertiary, 0.45),
    },
    // 값은 우측 정렬 + 남는 폭에서 줄어들 수 있게(긴 주소 대응).
    value: {
      flexShrink: 1,
      textAlign: 'right',
    },
  });
