// 렌더러(웹 빌드)에 최소 브리지만 노출한다.
// contextIsolation=true, sandbox=true(기본값) 유지 — nodeIntegration은 켜지 않는다.
// 렌더러는 window.slashDesktop.googleLogin()으로 데스크톱형 구글 OAuth를 요청하고
// id_token만 돌려받는다(토큰 교환·시크릿은 전부 메인 프로세스 안).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('slashDesktop', {
  // 성공: id_token 문자열로 resolve. 실패: 코드(cancelled·timeout·not_configured 등)를
  // message로 담은 Error로 reject. Electron이 붙이는 "Error invoking remote method..."
  // 접두사를 벗겨 렌더러가 깔끔한 코드만 보게 한다.
  googleLogin: async () => {
    try {
      return await ipcRenderer.invoke('google-login');
    } catch (e) {
      const raw = String((e && e.message) || e || '');
      const code = raw
        .replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, '')
        .trim();
      throw new Error(code || 'google_login_failed');
    }
  },
  // 데스크톱 OAuth 크리덴셜이 로드 가능한지(=구글 버튼을 띄워도 되는지).
  isGoogleConfigured: () => ipcRenderer.invoke('google-configured'),
});
