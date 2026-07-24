import { Platform } from 'react-native';

// Electron 데스크톱 셸 안에서 실행 중인가. (데스크톱 앱은 웹 빌드를 감싸지만
// "설치형 앱"이므로 브라우저 웹과 달리 마케팅 랜딩을 보여주지 않는다.)
export const isElectron =
  Platform.OS === 'web' &&
  typeof navigator !== 'undefined' &&
  / electron\//i.test(navigator.userAgent);

// 미인증(비로그인) 사용자의 정규 착지 경로.
// - 브라우저 웹: 마케팅 랜딩(/home)이 간판이다. 로그아웃·401·비로그인 접근 모두 여기로.
// - 네이티브·데스크톱(Electron): 설치형 앱이니 바로 로그인 화면(/login).
// /login 화면 자체는 /home의 "로그인" 버튼·CTA로 명시적으로만 도달한다.
export const unauthHref = (): '/home' | '/login' =>
  Platform.OS === 'web' && !isElectron ? '/home' : '/login';
