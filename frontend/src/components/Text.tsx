import { Text as RNText, TextProps } from 'react-native';
import { colors, typography, TypographyVariant } from '../theme';

interface Props extends TextProps {
  variant?: TypographyVariant;
  color?: string;
}

// 앱 전역 공용 텍스트. 화면마다 fontSize/fontWeight를 정하지 않고
// variant(타이포그래피 계층)로 고른다. RN의 Text를 대체해서 쓴다.
export function Text({ variant = 'body', color, style, ...rest }: Props) {
  return (
    <RNText
      style={[typography[variant], { color: color ?? colors.textPrimary }, style]}
      {...rest}
    />
  );
}
