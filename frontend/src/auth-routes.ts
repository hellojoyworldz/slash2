import { Platform } from 'react-native';

// 미인증(비로그인) 사용자의 정규 착지 경로.
// - 웹: 마케팅 랜딩(/home)이 간판이다. 로그아웃·401·비로그인 접근 모두 여기로 떨어진다.
// - 네이티브: 기존대로 로그인 화면(/login).
// /login 화면 자체는 /home의 "로그인" 버튼·CTA로 명시적으로만 도달한다.
export const unauthHref = (): '/home' | '/login' =>
  Platform.OS === 'web' ? '/home' : '/login';
