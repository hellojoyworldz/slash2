import { app, BrowserWindow, Menu, Tray, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import serve from 'electron-serve';
import { registerGoogleAuth } from './google-auth.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ELECTRON_DEV=1 이면 Expo 개발 서버(8081)를 띄운다 (핫리로드 가능).
// 아니면 frontend/dist의 정적 웹 빌드를 내장 서버로 로드한다.
const isDev = !!process.env.ELECTRON_DEV;
// 패키징된 앱에서는 frontend/dist가 존재하지 않는다 (electron-builder가
// extraResources로 Resources/dist에 복사해 둔 사본을 대신 서빙한다).
const distDir = app.isPackaged
  ? path.join(process.resourcesPath, 'dist')
  : path.join(__dirname, '../frontend/dist');
const loadFromDist = isDev ? null : serve({ directory: distDir });

let win = null;
let tray = null;
// 종료 메뉴로만 완전히 종료한다 (창을 닫아도 메뉴 바에 상주)
let quitting = false;

async function createWindow() {
  // 데스크톱다운 기본 크기 — 900px 이상이면 웹앱이 3패널 레이아웃으로 렌더된다.
  // 리사이즈 자유(좁히면 모바일 레이아웃으로 자연 전환).
  win = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 480,
    minHeight: 600,
    title: 'Slash',
    autoHideMenuBar: true,
    backgroundColor: '#FFFFFF',
    webPreferences: {
      // 데스크톱형 구글 로그인용 최소 브리지(window.slashDesktop). contextIsolation·sandbox는
      // 기본값(둘 다 true) 유지, nodeIntegration은 켜지 않는다.
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // 창을 닫으면 숨기기만 한다 (앱은 메뉴 바에 상주)
  win.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => {
    win = null;
  });

  // 링크 카드·법적 문서 등 외부 URL은 앱 창이 아니라 기본 브라우저로 연다.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  // 내부 serve 오리진(loadURL로 로드한 것과 동일 오리진) 밖으로의 이동은 막고
  // 대신 시스템 브라우저로 연다 (예: 앵커 클릭으로 인한 전체 페이지 네비게이션).
  win.webContents.on('will-navigate', (event, url) => {
    try {
      const target = new URL(url);
      const current = new URL(win.webContents.getURL());
      if (target.origin !== current.origin) {
        event.preventDefault();
        void shell.openExternal(url);
      }
    } catch {
      // 초기 로드 등 URL을 비교할 수 없는 경우는 그냥 통과시킨다.
    }
  });

  if (isDev) {
    await win.loadURL('http://localhost:8081');
  } else {
    await loadFromDist(win);
  }

  // 자동 검증용: SMOKE_TEST=1 이면 로드 성공 확인 후 바로 종료
  if (process.env.SMOKE_TEST) {
    console.log('SMOKE_OK');
    quitting = true;
    app.quit();
  }
}

async function showWindow() {
  if (win) {
    win.show();
    win.focus();
  } else {
    await createWindow();
  }
}

function createTray() {
  // iconTemplate 네이밍이라 macOS가 라이트/다크 모드 색을 알아서 맞춘다
  tray = new Tray(path.join(__dirname, 'iconTemplate.png'));
  tray.setToolTip('Slash');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Slash 열기', click: () => void showWindow() },
      { type: 'separator' },
      {
        label: '로그아웃',
        click: async () => {
          await showWindow();
          // 웹 앱의 저장된 토큰을 지우고 새로고침 → 로그인 화면으로
          await win.webContents.executeJavaScript(
            "localStorage.removeItem('slash.token'); location.reload();",
          );
        },
      },
      { type: 'separator' },
      {
        label: '종료',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  // 아이콘 클릭으로도 창 열기 (macOS에서는 컨텍스트 메뉴와 함께 동작)
  tray.on('double-click', () => void showWindow());
}

// 중복 실행 방지 — 두 번째 실행 시도는 기존 인스턴스의 창을 앞으로 가져온다.
// (구버전과 새 버전이 동시에 떠서 "어느 쪽을 클릭했는지" 헷갈리는 사고 방지)
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => void showWindow());

  app.whenReady().then(async () => {
    registerGoogleAuth(app);
    createTray();
    await createWindow();
  });
}

// 창이 다 닫혀도 앱은 메뉴 바에 상주한다
app.on('window-all-closed', () => {
  if (quitting) app.quit();
});

// Dock 아이콘 클릭 시 창 다시 열기 (macOS)
app.on('activate', () => void showWindow());

app.on('before-quit', () => {
  quitting = true;
});
