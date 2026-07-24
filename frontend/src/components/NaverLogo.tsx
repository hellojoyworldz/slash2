import Svg, { Path } from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
}

// 네이버 'N' 심볼. outline 버튼 문법에 맞춰 초록 배경 없이 심볼만 단색으로 그린다
// (KakaoLogo·AppleLogo와 동일 관례 — 브랜드 배경 대신 버튼 텍스트 색을 그대로 받는다).
// 외부 이미지/CDN 없이 인라인 SVG.
export function NaverLogo({ size = 18, color = '#000000' }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Path
        fill={color}
        d="M18.6 4v11.6L13.4 4H4v24h9.4V16.4L18.6 28H28V4h-9.4z"
      />
    </Svg>
  );
}
