import { app, BrowserWindow, Menu, Tray } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import serve from 'electron-serve';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ELECTRON_DEV=1 이면 Expo 개발 서버(8081)를 띄운다 (핫리로드 가능).
// 아니면 frontend/dist의 정적 웹 빌드를 내장 서버로 로드한다.
const isDev = !!process.env.ELECTRON_DEV;
const loadFromDist = isDev
  ? null
  : serve({ directory: path.join(__dirname, '../frontend/dist') });

let win = null;
let tray = null;
// 종료 메뉴로만 완전히 종료한다 (창을 닫아도 메뉴 바에 상주)
let quitting = false;

async function createWindow() {
  win = new BrowserWindow({
    width: 480,
    height: 860,
    minWidth: 380,
    minHeight: 600,
    title: 'slash',
    autoHideMenuBar: true,
    backgroundColor: '#FFFFFF',
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
  tray.setToolTip('slash');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'slash 열기', click: () => void showWindow() },
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

app.whenReady().then(async () => {
  createTray();
  await createWindow();
});

// 창이 다 닫혀도 앱은 메뉴 바에 상주한다
app.on('window-all-closed', () => {
  if (quitting) app.quit();
});

// Dock 아이콘 클릭 시 창 다시 열기 (macOS)
app.on('activate', () => void showWindow());

app.on('before-quit', () => {
  quitting = true;
});
