// 데스크톱 앱 유형 구글 OAuth (시스템 브라우저 + 127.0.0.1 루프백 + PKCE).
// 웹 클라이언트 방식(리다이렉트 URL 등록·시크릿 노출)이 아니라 "Desktop app" 클라이언트로,
// 임시 포트의 로컬 HTTP 서버를 콜백으로 쓴다. 시크릿은 렌더러에 내려가지 않고
// 코드→토큰 교환도 전부 이 메인 프로세스 안에서 끝난다. 최종 산출물은 id_token 하나.
import { shell, ipcMain } from 'electron';
import http from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const SCOPE = 'openid email profile';
const TIMEOUT_MS = 3 * 60 * 1000; // 3분

// 동봉된 웹 빌드에서 흰 마스코트 PNG를 찾아 data URI로 (콜백 페이지 브랜딩용).
// 없으면 마스코트 없이 렌더 — 플로우엔 영향 없음.
function mascotDataUri(app) {
  try {
    const distDir = app.isPackaged
      ? path.join(process.resourcesPath, 'dist')
      : path.join(__dirname, '../frontend/dist');
    const assetsDir = path.join(distDir, 'assets');
    const file = readdirSync(assetsDir).find(
      (n) => n.startsWith('symbol-white') && n.endsWith('.png'),
    );
    if (!file) return null;
    return (
      'data:image/png;base64,' +
      readFileSync(path.join(assetsDir, file)).toString('base64')
    );
  } catch {
    return null;
  }
}

// 콜백 브라우저 탭 — 랜딩 히어로와 같은 브랜드 룩(블랙 + 흰 마스코트) + 자동 닫기 시도.
function doneHtml(mascot, ok) {
  const title = ok ? '로그인 완료' : '로그인에 실패했어요';
  const sub = ok
    ? '이 창을 닫고 앱으로 돌아가세요.'
    : '이 창을 닫고 앱에서 다시 시도해주세요.';
  return (
    '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>slash</title>' +
    '<meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
    '<body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;' +
    'background:#111111;color:#fff;font-family:-apple-system,system-ui,sans-serif;text-align:center;">' +
    '<main>' +
    (mascot
      ? `<img src="${mascot}" alt="" width="96" style="display:block;margin:0 auto 8px;">`
      : '') +
    '<div style="font-size:26px;font-weight:900;letter-spacing:-0.4px;margin-bottom:28px;">slash</div>' +
    `<h1 style="font-size:21px;font-weight:800;margin:0 0 10px;">${title}</h1>` +
    `<p style="font-size:15px;color:#B9BBC4;margin:0;">${sub}</p>` +
    '</main>' +
    '<script>setTimeout(function(){window.close();},400);</script></body></html>'
  );
}

function base64url(buf) {
  return buf.toString('base64url');
}

// build-web.mjs와 동일한 방식으로 루트 .env를 파싱(값 내부 공백·특수문자 안전).
function parseEnv(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  return out;
}

// dev(비패키징): 루트 ../.env에서 GOOGLE_DESKTOP_* 읽기.
// 패키징: extraResources로 동봉된 google-oauth.json에서 읽기.
// 값이 비어 있으면 null(→ 구글 버튼 숨김 / googleLogin은 not_configured로 reject).
function loadCredentials(app) {
  try {
    if (app.isPackaged) {
      const p = path.join(process.resourcesPath, 'google-oauth.json');
      const j = JSON.parse(readFileSync(p, 'utf8'));
      const clientId = String(j.clientId || '').trim();
      const clientSecret = String(j.clientSecret || '').trim();
      if (clientId && clientSecret) return { clientId, clientSecret };
    } else {
      const env = parseEnv(readFileSync(path.join(__dirname, '../.env'), 'utf8'));
      const clientId = String(env.GOOGLE_DESKTOP_CLIENT_ID || '').trim();
      const clientSecret = String(env.GOOGLE_DESKTOP_CLIENT_SECRET || '').trim();
      if (clientId && clientSecret) return { clientId, clientSecret };
    }
  } catch {
    // 파일 없음·JSON 파싱 실패 등은 "미설정"으로 취급.
  }
  return null;
}

async function exchangeCode({ code, verifier, creds, redirectUri }) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }).toString(),
  });
  if (!res.ok) {
    // 원인 진단용 — 구글이 주는 error/error_description을 메인 프로세스 로그로 남긴다.
    const body = await res.text().catch(() => '');
    console.error('[google-auth] token exchange failed:', res.status, body.slice(0, 500));
    throw new Error('token_http_' + res.status);
  }
  const data = await res.json();
  if (!data || !data.id_token) {
    console.error('[google-auth] token response missing id_token:', Object.keys(data || {}));
    throw new Error('no_id_token');
  }
  return data.id_token;
}

// 진행 중 플로우를 취소하는 함수(중복 요청 시 이전 것 정리).
let cancelActive = null;

function runGoogleLogin(app) {
  const creds = loadCredentials(app);
  if (!creds) return Promise.reject(new Error('not_configured'));

  // 이전 플로우가 살아 있으면 취소(서버 닫고 reject).
  if (cancelActive) {
    try {
      cancelActive();
    } catch {
      /* noop */
    }
    cancelActive = null;
  }

  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  const state = base64url(randomBytes(16));

  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    const server = http.createServer();

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      try {
        server.close();
      } catch {
        /* noop */
      }
      if (cancelActive === cancelThis) cancelActive = null;
    };
    const settle = (fn, arg) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn(arg);
    };
    const cancelThis = () => settle(reject, new Error('cancelled'));
    cancelActive = cancelThis;

    server.on('request', (req, res) => {
      let reqUrl;
      try {
        reqUrl = new URL(req.url, 'http://127.0.0.1');
      } catch {
        res.writeHead(400);
        res.end();
        return;
      }
      // favicon 등 콜백이 아닌 요청은 조용히 무시(플로우를 종료시키지 않는다).
      if (reqUrl.pathname !== '/') {
        res.writeHead(404);
        res.end();
        return;
      }

      const params = reqUrl.searchParams;
      const err = params.get('error');
      const returnedState = params.get('state');
      const code = params.get('code');

      // 콜백 파라미터 기준 성공/실패 브랜드 페이지 (토큰 교환 결과는 이후 앱 안에서 안내).
      const ok = !err && returnedState === state && !!code;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(doneHtml(mascotDataUri(app), ok));

      if (err) {
        console.error('[google-auth] callback error param:', err);
        settle(reject, new Error(err === 'access_denied' ? 'cancelled' : err));
        return;
      }
      if (returnedState !== state) {
        console.error('[google-auth] state mismatch (중복 클릭/이전 탭 콜백 가능성)');
        settle(reject, new Error('state_mismatch'));
        return;
      }
      if (!code) {
        console.error('[google-auth] callback missing code');
        settle(reject, new Error('no_code'));
        return;
      }

      const port = server.address().port;
      exchangeCode({
        code,
        verifier,
        creds,
        redirectUri: `http://127.0.0.1:${port}`,
      })
        .then((idToken) => settle(resolve, idToken))
        .catch(() => settle(reject, new Error('token_exchange_failed')));
    });

    server.on('error', () => settle(reject, new Error('server_error')));

    // 임시 포트(0)를 127.0.0.1에 바인드 → 그 포트를 redirect_uri로 사용.
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const authUrl = new URL(AUTH_ENDPOINT);
      authUrl.search = new URLSearchParams({
        client_id: creds.clientId,
        redirect_uri: `http://127.0.0.1:${port}`,
        response_type: 'code',
        scope: SCOPE,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        access_type: 'offline',
        prompt: 'select_account',
      }).toString();
      void shell.openExternal(authUrl.toString());
      timer = setTimeout(() => settle(reject, new Error('timeout')), TIMEOUT_MS);
    });
  });
}

// main.js에서 app ready 이후 한 번 호출.
export function registerGoogleAuth(app) {
  ipcMain.handle('google-login', () => runGoogleLogin(app));
  ipcMain.handle('google-configured', () => loadCredentials(app) !== null);
}
