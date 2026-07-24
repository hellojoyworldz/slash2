// react-native-web은 Pressable state 콜백에 `hovered`(마우스 오버)·`focused`를 추가하지만,
// RN 코어 타입(@types)엔 `pressed`만 있다. 목록 행 hover 피드백에 `hovered`를 쓰므로
// 인터페이스 선언 병합으로 타입을 보강한다(네이티브에선 항상 false라 값 자체는 무해).
// 상단 import로 이 파일을 "모듈"로 만들어야 declare module이 "교체"가 아닌 "병합"이 된다.
import 'react-native';

declare module 'react-native' {
  interface PressableStateCallbackType {
    hovered?: boolean;
    focused?: boolean;
  }
}
