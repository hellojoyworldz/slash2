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
  /** 값 텍스트를 드래그 선택·복사 가능하게(웹). 기본 false(기존 동작 유지) — 호출부가 명시 opt-in. */
  selectable?: boolean;
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
  selectable = false,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // 여러 줄 값(줄바꿈 영업시간·2줄 주소)은 라벨·리더를 첫 줄 높이에 붙인다 —
  // 기본(flex-end)대로 두면 라벨이 마지막 줄(예: 일요일) 옆에 내려가 붙는다.
  const multiline = numberOfLines !== 1;
  const body = (
    <View style={[styles.row, multiline && styles.rowTop]}>
      <Text
        variant="micro"
        color={colors.textTertiary}
        numberOfLines={1}
        selectable={selectable}
        // 값이 길어도(여러 줄 영업시간 등) 라벨이 "영…"으로 찌부러지지 않게 고정.
        style={styles.label}
      >
        {label}
      </Text>
      <View style={[styles.leader, multiline && styles.leaderTop]} />
      <Text
        variant="micro"
        color={colors.textPrimary}
        style={styles.value}
        numberOfLines={numberOfLines}
        selectable={selectable}
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
    // 여러 줄 값: 라벨·리더를 위(첫 줄)로 — 리더는 첫 줄 베이스라인 근처에 앉게 높이 고정.
    rowTop: {
      alignItems: 'flex-start',
    },
    label: {
      flexShrink: 0,
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
    leaderTop: {
      height: 11,
      marginBottom: 0,
    },
    // 값은 우측 정렬 + 남는 폭에서 줄어들 수 있게(긴 주소 대응).
    value: {
      flexShrink: 1,
      textAlign: 'right',
    },
  });
