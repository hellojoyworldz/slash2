import Svg, { Path } from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
}

// 카카오 말풍선 심볼. outline 버튼 문법에 맞춰 노란 배경 없이 심볼만 단색으로 그린다
// (AppleLogo와 동일 관례 — 브랜드 배경 대신 버튼 텍스트 색을 그대로 받는다).
// 외부 이미지/CDN 없이 인라인 SVG.
export function KakaoLogo({ size = 18, color = '#000000' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Path
        fill={color}
        d="M16 5C9.37 5 4 9.26 4 14.51c0 3.4 2.25 6.38 5.63 8.06-.25.9-.9 3.26-1.03 3.77-.16.62.23.61.48.44.2-.13 3.12-2.12 4.38-2.98.83.12 1.68.19 2.54.19 6.63 0 12-4.26 12-9.48C28 9.26 22.63 5 16 5z"
      />
    </Svg>
  );
}
