import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

const QUERY = '(hover: hover) and (pointer: fine)';

// "데스크톱급 입력 기기"(물리 키보드 + 마우스) 판정.
// - 네이티브 앱(iOS/Android): 항상 false (터치 키보드 전제)
// - 웹: hover+fine pointer 미디어쿼리 — 폰 브라우저는 coarse pointer라 자동으로 false.
//   창 폭(900px)은 레이아웃 신호일 뿐 입력 동작 신호가 아니므로 쓰지 않는다.
//   UA 문자열 파싱은 신뢰 불가라 금지.
export function useDesktopClassInput(): boolean {
  const [desktop, setDesktop] = useState(() => {
    if (
      Platform.OS !== 'web' ||
      typeof window === 'undefined' ||
      !window.matchMedia
    ) {
      return false;
    }
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (
      Platform.OS !== 'web' ||
      typeof window === 'undefined' ||
      !window.matchMedia
    ) {
      return;
    }
    const mq = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setDesktop(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  return desktop;
}
