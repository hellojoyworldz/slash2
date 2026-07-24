// 루트 .env를 로드한 뒤 expo export를 실행한다.
// 이유: expo CLI는 frontend/ 안의 .env만 자동 로드하고 모노레포 루트 .env(단일 공유 규칙)는
// 보지 않는다. 그래서 호스트에서 그냥 export하면 EXPO_PUBLIC_*(구글 클라이언트 ID 등)이
// 번들에 빠져 로그인 화면이 크래시한다(흰 화면). 셸 source 대신 직접 파싱하는 이유는
// MAIL_FROM 같은 값에 공백·특수문자가 있어도 안전해야 하기 때문.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, '../.env');
const FRONTEND_DIR = path.join(__dirname, '../frontend');

try {
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const key = m[1];
    // 감싼 따옴표만 벗긴다 (값 내부 문자는 그대로)
    const value = m[2].replace(/^(["'])(.*)\1$/, '$2');
    // 이미 셸에서 명시한 값이 우선 (예: EXPO_PUBLIC_API_URL=... npm run dist)
    if (!(key in process.env)) process.env[key] = value;
  }
} catch {
  console.warn('루트 .env를 읽지 못했습니다 — 개발 폴백 값으로 진행합니다.');
}

const result = spawnSync('npx', ['expo', 'export', '--platform', 'web'], {
  cwd: FRONTEND_DIR,
  stdio: 'inherit',
  env: process.env,
});
process.exit(result.status ?? 1);
