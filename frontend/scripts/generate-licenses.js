#!/usr/bin/env node
/*
 * 오픈소스 라이선스 목록 생성기 (plain node, 빌드 도구 아님).
 *
 *   node scripts/generate-licenses.js   (또는 npm run generate:licenses)
 *
 * frontend/package.json의 직접 의존성(dependencies)만 license-checker 결과에서
 * 골라 [{ name, version, license, repository }] 배열로 정리해
 * src/generated/licenses.json 에 쓴다. 이 JSON은 소스 자산으로 커밋한다
 * (라이선스 화면이 정적 import). 전체 라이선스 원문·전이 의존성은 담지 않는다 —
 * 직접 사용하는 라이브러리의 이름·버전·라이선스 종류·저장소 링크만 싣는 슬림 관례.
 *
 * 실행 시점 스냅샷이라, 의존성이 바뀌면 다시 돌려 갱신한다.
 */
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const FRONTEND_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(FRONTEND_DIR, 'src', 'generated');
const OUT_FILE = path.join(OUT_DIR, 'licenses.json');

// license-checker-rseidelsohn(유지보수 포크) 우선, 없으면 원조 license-checker.
// 둘 다 --production --json 인터페이스가 동일하다.
const CANDIDATES = ['license-checker-rseidelsohn', 'license-checker'];

function runChecker() {
  let lastErr;
  for (const bin of CANDIDATES) {
    try {
      const out = execSync(`npx --yes ${bin} --production --json`, {
        cwd: FRONTEND_DIR,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return JSON.parse(out);
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `license-checker 실행 실패 (${CANDIDATES.join(' / ')}). ` +
      `네트워크(npx) 또는 설치 상태를 확인하세요.\n${lastErr}`,
  );
}

// "@scope/pkg@1.2.3" → { name: "@scope/pkg", version: "1.2.3" }
// 마지막 '@'가 버전 구분자(스코프 선두의 '@'와 구분).
function splitNameVersion(key) {
  const at = key.lastIndexOf('@');
  if (at <= 0) return { name: key, version: '' };
  return { name: key.slice(0, at), version: key.slice(at + 1) };
}

function normalizeLicense(licenses) {
  if (!licenses) return 'UNKNOWN';
  if (Array.isArray(licenses)) return licenses.join(', ');
  return String(licenses);
}

function main() {
  const raw = runChecker();
  const pkg = require(path.join(FRONTEND_DIR, 'package.json'));
  const rootName = pkg.name;
  const direct = new Set(Object.keys(pkg.dependencies || {}));

  // 이름 기준 디듀프 — 같은 이름의 여러 버전이 잡히면 가장 높은 버전만 남긴다.
  const byName = new Map();
  for (const [key, meta] of Object.entries(raw)) {
    const { name, version } = splitNameVersion(key);
    if (!name) continue;
    if (name === rootName) continue; // 루트 앱 자신 제외
    if (name.startsWith('@types/')) continue; // 타입 전용 패키지 제외
    if (!direct.has(name)) continue; // 직접 의존성만 (전이 의존성 제외)
    const entry = {
      name,
      version,
      license: normalizeLicense(meta.licenses),
      repository: meta.repository || undefined,
    };
    const prev = byName.get(name);
    if (!prev || compareVersion(version, prev.version) > 0) {
      byName.set(name, entry);
    }
  }

  const list = [...byName.values()].sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
  );

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(list, null, 2) + '\n', 'utf8');
  console.log(`✓ ${list.length} packages → ${path.relative(FRONTEND_DIR, OUT_FILE)}`);
}

// 느슨한 semver 비교(숫자 파트만). 형식이 아니면 문자열 비교로 폴백.
function compareVersion(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10));
  const pb = String(b).split('.').map((n) => parseInt(n, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (Number.isNaN(x) || Number.isNaN(y)) return String(a).localeCompare(String(b));
    if (x !== y) return x - y;
  }
  return 0;
}

main();
