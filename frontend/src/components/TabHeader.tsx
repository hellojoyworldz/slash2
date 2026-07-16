import { ReactNode, useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { layout, ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
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
}

export function TabHeader({ title, actions }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.header}>
      <Text variant="title">{title}</Text>
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
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
  });
