import { Image, ImageStyle, StyleProp } from 'react-native';

export interface RemoteImageProps {
  /** 원격 이미지 URL(og:image·정적지도 등). */
  uri: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain';
  accessibilityLabel?: string;
}

// og 썸네일 등 원격 이미지 렌더. 네이티브는 RN Image 그대로.
// 웹은 .web 파일(RemoteImage.web.tsx)이 핫링크(Referer) 차단을 피하도록
// referrerPolicy="no-referrer" <img>로 렌더한다 — react-native-web의 Image는
// background-image(div)로 그려 referrerPolicy를 실을 수 없기 때문.
export function RemoteImage({
  uri,
  style,
  resizeMode = 'cover',
  accessibilityLabel,
}: RemoteImageProps) {
  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode={resizeMode}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
