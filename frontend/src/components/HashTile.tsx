import { StyleProp, View, ViewStyle } from 'react-native';
import { bestTextOn } from '../theme';
import { useTheme } from '../theme-context';
import { PICKER_TILE_SIZE } from './PickerModal';
import { Text } from './Text';

interface Props {
  /** 태그 프로필 색(hex). 없으면(기존 무색 태그) 중립 surface로 폴백. 말풍선 색은 분류의 것 — 여긴 태그의 자기 자리. */
  color?: string | null;
  /** 타일 한 변 크기. 기본은 픽커 행 타일 크기(44). */
  size?: number;
  style?: StyleProp<ViewStyle>;
}

// 태그 아이덴티티 타일 — 태그색 배경 위 # 글리프. 색 없으면 무채 surface(기존 폴백).
// # 글리프 색은 CategoryAvatar와 같은 대비 규칙(bestTextOn)으로 배경에 맞춰 자동 대비.
// 라운드 0 + 1px border 링은 CategoryAvatar와 동일 — 흰/검 배경이 면에 묻히지 않게 한다.
export function HashTile({ color, size = PICKER_TILE_SIZE, style }: Props) {
  const { colors } = useTheme();
  const bg = color ?? colors.surface;
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: 0,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text variant="subheading" color={bestTextOn(bg)}>
        #
      </Text>
    </View>
  );
}
