import { isElectron } from './auth-routes';

// Electron 데스크톱 셸(preload.cjs)이 노출하는 브리지.
// - googleLogin(): 데스크톱형 구글 OAuth를 시스템 브라우저로 진행하고 id_token으로 resolve.
//   실패 시 코드(cancelled·timeout·not_configured 등)를 message로 담은 Error로 reject.
// - isGoogleConfigured(): 데스크톱 OAuth 크리덴셜이 로드 가능한지(=구글 버튼 노출 가능 여부).
export interface SlashDesktopBridge {
  googleLogin(): Promise<string>;
  isGoogleConfigured(): Promise<boolean>;
}

declare global {
  interface Window {
    slashDesktop?: SlashDesktopBridge;
  }
}

// 데스크톱 셸 안 + 브리지가 실제로 주입돼 있을 때만 반환. 그 외(웹/네이티브,
// 브리지 없는 구버전 셸)에서는 undefined → 렌더러가 웹 구글 플로우로 폴백/숨김 처리.
export function getDesktopBridge(): SlashDesktopBridge | undefined {
  if (!isElectron || typeof window === 'undefined') return undefined;
  return window.slashDesktop;
}
