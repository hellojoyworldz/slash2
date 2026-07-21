import {
  Image,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { bestTextOn } from '../theme';
import { useTheme } from '../theme-context';

// 투명 배경 캐릭터 — 분류 아바타의 얼굴. 배경은 분류색이 물들인다.
// 어두운 배경(검정·짙은 커스텀색·다크 테마 surface)에선 검정 라인이 묻혀서
// 흰 라인 버전을 쓴다 — 글자색 규칙(bestTextOn)과 같은 대비 기준(사용자 확정).
const CHARACTER = require('../../assets/charactor-transparent.png');
const CHARACTER_WHITE = require('../../assets/charactor-transparent-white-line.png');

interface Props {
  /** 분류색(hex). 없으면(기존 데이터) 중립 표면색으로 폴백. */
  color?: string | null;
  size: number;
  style?: StyleProp<ViewStyle>;
}

// 분류 아바타: 분류색 배경 위에 캐릭터를 얹는다(박스의 ~70%).
// 라운드 0(브루탈 흔적). DESIGN "아바타 보더 없음" 원칙의 예외 — 프로필은 흰/검 배경을
// 허용하므로, 흰 아바타(라이트)·검은 아바타(다크)가 배경에 묻히지 않게 1px border 링을 항상 두른다.
export function CategoryAvatar({ color, size, style }: Props) {
  const { colors } = useTheme();
  const inner = Math.round(size * 0.7);
  const bg = color ?? colors.surface;
  // 어두운 배경이면 흰 라인 캐릭터(글자색 규칙과 동일 기준).
  const character = bestTextOn(bg) === '#FFFFFF' ? CHARACTER_WHITE : CHARACTER;
  return (
    <View
      style={[
        styles.box,
        {
          width: size,
          height: size,
          backgroundColor: bg,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      <Image
        source={character}
        style={{ width: inner, height: inner }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 0,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
