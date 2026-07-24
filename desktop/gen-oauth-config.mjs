// 패키징 빌드용 google-oauth.json 생성기.
// 루트 .env의 GOOGLE_DESKTOP_CLIENT_ID / GOOGLE_DESKTOP_CLIENT_SECRET를 읽어
// desktop/google-oauth.json으로 굽는다(패키징 앱은 이 파일을 extraResources로 동봉).
// 시크릿이 레포에 커밋되면 안 되므로 이 산출물은 .gitignore 대상이다.
// 값이 없어도 빈 파일을 써서 빌드는 계속되게 한다(런타임에 "미설정"으로 처리 → 구글 버튼 숨김).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, '../.env');
const OUT_PATH = path.join(__dirname, 'google-oauth.json');

function parseEnv(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  return out;
}

let clientId = '';
let clientSecret = '';
try {
  const env = parseEnv(readFileSync(ENV_PATH, 'utf8'));
  // 셸 환경변수가 우선(예: GOOGLE_DESKTOP_CLIENT_ID=... npm run dist).
  clientId = String(process.env.GOOGLE_DESKTOP_CLIENT_ID ?? env.GOOGLE_DESKTOP_CLIENT_ID ?? '').trim();
  clientSecret = String(
    process.env.GOOGLE_DESKTOP_CLIENT_SECRET ?? env.GOOGLE_DESKTOP_CLIENT_SECRET ?? '',
  ).trim();
} catch {
  console.warn('[gen-oauth-config] 루트 .env를 읽지 못했습니다 — 빈 크리덴셜로 진행합니다.');
}

writeFileSync(OUT_PATH, JSON.stringify({ clientId, clientSecret }, null, 2) + '\n');

if (clientId && clientSecret) {
  console.log('[gen-oauth-config] google-oauth.json 생성 완료 (크리덴셜 포함).');
} else {
  console.warn(
    '[gen-oauth-config] GOOGLE_DESKTOP_CLIENT_ID/SECRET가 비어 있습니다 — ' +
      '빈 google-oauth.json을 생성했습니다. 패키징 앱에서 구글 로그인 버튼이 숨겨집니다.',
  );
}
