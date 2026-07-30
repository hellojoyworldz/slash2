import { Image, ImageStyle, StyleProp } from 'react-native';

export interface RemoteImageProps {
  /** 원격 이미지 URL(og:image·정적지도 등). */
  uri: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain';
  accessibilityLabel?: string;
  /** 장식 이미지(인접에 제목 등 대체 텍스트가 이미 있는 경우) false로 스크린리더에서 숨긴다. 기본 true. */
  accessible?: boolean;
  /** 로드된 원본(자연) 크기 콜백 — 프레임 비율 계산 등에 쓴다. 옵션이라 기존 호출부엔 영향 없음. */
  onNaturalSize?: (width: number, height: number) => void;
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
  accessible = true,
  onNaturalSize,
}: RemoteImageProps) {
  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode={resizeMode}
      accessibilityLabel={accessibilityLabel}
      accessible={accessible}
      onLoad={(e) => {
        if (!onNaturalSize) return;
        const { width, height } = e.nativeEvent.source;
        onNaturalSize(width, height);
      }}
    />
  );
}
