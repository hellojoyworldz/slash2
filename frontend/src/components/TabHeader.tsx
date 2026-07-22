import { ReactNode, useMemo } from 'react';
import { StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { layout, ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { Logo } from './Logo';
import { Text } from './Text';

// 탭 화면 공용 헤더 — 타이틀 + 우측 아이콘 버튼들.
// 분류·채팅 탭이 같은 여백/타이포/터치 타깃을 공유하도록 추출(복붙 방지).
export interface TabHeaderAction {
  key: string;
  /** lucide 아이콘 노드 (색·크기는 호출부가 결정) */
  icon: ReactNode;
  /** 아이콘 전용 버튼이라 스크린리더 라벨 필수 */
  label: string;
  onPress: () => void;
}

interface Props {
  title: string;
  actions?: TabHeaderAction[];
  /** 상단 상태바 여백을 넣을지. 기본 true. 위에 캡슐 바 등 다른 요소가 상태바 여백을
   *  이미 차지한 채로(예: 분류 탭 캡슐 아래) 임베드될 때 false로 중복 여백을 없앤다. */
  topInset?: boolean;
  /** 타이틀 바로 아래 상시 노출되는 짧은 설명(선택) — 분류·태그·자동구분 탭이 쓴다. */
  subtitle?: string;
}

export function TabHeader({ title, actions, topInset = true, subtitle }: Props) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  // 데스크톱은 레일에 심볼이 이미 있어 중복 금지 — 모바일(< desktopBreakpoint)에서만 로고 노출.
  const isMobile = width < layout.desktopBreakpoint;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.header, !topInset && styles.headerNoInset]}>
      <View style={styles.titleCol}>
        <View style={styles.titleRow}>
          {isMobile ? <Logo size={38} /> : null}
          <Text variant="title">{title}</Text>
        </View>
        {subtitle ? (
          <Text variant="caption" color={colors.textSecondary} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actions && actions.length > 0 ? (
        <View style={styles.actions}>
          {actions.map((a) => (
            <TouchableOpacity
              key={a.key}
              onPress={a.onPress}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={a.label}
            >
              {a.icon}
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (_colors: ThemeColors) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: layout.statusBarPad + 4,
      paddingBottom: 14,
      paddingHorizontal: 20,
    },
    // 타이틀 줄 + 그 아래 설명(있으면)을 세로로 묶는다 — actions와는 가로로 space-between.
    titleCol: {
      flexShrink: 1,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    subtitle: {
      marginTop: 4,
    },
    // 캡슐 바 아래 임베드 시: 상태바 여백은 캡슐이 지고, 헤더는 짧은 상단 여백만.
    headerNoInset: {
      paddingTop: 4,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
  });
