// react-native-web는 flow로 배포돼 TS 타입이 없다. 웹 전용 코드에서 쓰는
// unstable_createElement만 최소로 선언한다(RN 스타일이 먹는 DOM 엘리먼트 생성기).
declare module 'react-native-web' {
  import type { ReactElement } from 'react';
  export function unstable_createElement(
    component: string,
    props?: Record<string, unknown>,
  ): ReactElement;
}
