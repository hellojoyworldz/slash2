// react-native-web는 Image를 background-image(div)로 렌더해서 referrerPolicy를 실을 수 없다.
// 네이버·카카오 등 한국 CDN은 외부 도메인 Referer로 오는 og 이미지 요청을 핫링크로 차단하는데,
// Referer가 없으면(no-referrer) 대개 통과한다. 그래서 웹에서는 실제 <img>에 no-referrer를 줘서
// 로드한다 — unstable_createElement가 RN 스타일(width·aspectRatio·backgroundColor)이 그대로
// 먹는 DOM <img>를 만들어 주므로 카드 레이아웃은 네이티브와 동일하게 유지된다.
import { unstable_createElement } from 'react-native-web';
import type { RemoteImageProps } from './RemoteImage';

export function RemoteImage({
  uri,
  style,
  resizeMode = 'cover',
  accessibilityLabel,
}: RemoteImageProps) {
  return unstable_createElement('img', {
    src: uri,
    alt: accessibilityLabel ?? '',
    draggable: false,
    referrerPolicy: 'no-referrer',
    // RN Image의 cover/contain을 object-fit으로 재현. display:block으로 <img> 기본 inline
    // 하단 여백(descender gap)을 없애 div 기반 RN Image와 레이아웃을 맞춘다. 두 속성 모두
    // RNW 스타일 컴파일러를 그대로 통과한다(검증 완료). 박스 스타일은 호출부 style에서 온다.
    style: [
      style,
      { display: 'block', objectFit: resizeMode === 'contain' ? 'contain' : 'cover' },
    ],
  });
}
