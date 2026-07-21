import { Image, ImageStyle, StyleProp } from 'react-native';
import { useTheme } from '../theme-context';

// 심볼 원본 비율(310×300) — size는 세로 기준, 가로는 비율로 파생해 찌그러짐 방지.
const SYMBOL_RATIO = 310 / 300;

interface Props {
  /** 세로 기준 크기. 가로는 원본 비율(310/300)로 파생. */
  size?: number;
  /** 장식 용도면 생략(accessible=false). 버튼 등으로 쓰일 땐 호출부가 라벨을 준다. */
  accessibilityLabel?: string;
  style?: StyleProp<ImageStyle>;
}

// 앱 심볼 워드마크 대체 이미지. 라이트/다크는 useTheme().resolvedScheme으로 자동 전환된다
// (다크=symbol-white). 정적 require + RN Image로 렌더(원격 로드 없음).
export function Logo({ size = 22, accessibilityLabel, style }: Props) {
  const { resolvedScheme } = useTheme();
  const source =
    resolvedScheme === 'dark'
      ? require('../../assets/symbol-white.png')
      : require('../../assets/symbol.png');

  return (
    <Image
      source={source}
      resizeMode="contain"
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      style={[{ width: size * SYMBOL_RATIO, height: size }, style]}
    />
  );
}
