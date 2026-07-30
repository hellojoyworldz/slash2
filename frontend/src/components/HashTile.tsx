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
// 라운드 0, 보더 없음(사용자 확정 — 면 채움만). 분류(CategoryAvatar)는 보더 유지.
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
