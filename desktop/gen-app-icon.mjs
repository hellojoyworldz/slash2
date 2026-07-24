// desktop/appicon.png(1024×1024, 라운드 타일+투명 여백 — macOS 독 스타일)를 소스로
// macOS(.icns)·Windows(.ico) 앱 아이콘을 생성한다.
// electron-builder가 자동으로 인식하는 desktop/build/icon.icns · desktop/build/icon.ico에 출력한다.
// macOS 전용 (sips·iconutil 사용). macOS에는 png→ico 네이티브 변환 도구가 없어
// ICO는 sips로 뽑은 PNG들을 표준 "PNG-in-ICO"(Vista+ 지원) 컨테이너로 직접 패킹한다.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SOURCE = path.join(__dirname, 'appicon.png');
const BUILD_DIR = path.join(__dirname, 'build');
const ICONSET_DIR = path.join(BUILD_DIR, 'icon.iconset');
const ICO_TMP_DIR = path.join(BUILD_DIR, 'icon.icotmp');
const OUT_ICNS = path.join(BUILD_DIR, 'icon.icns');
const OUT_ICO = path.join(BUILD_DIR, 'icon.ico');

if (process.platform !== 'darwin') {
  console.error('gen-app-icon.mjs는 macOS(sips/iconutil)에서만 동작합니다.');
  process.exit(1);
}

if (!existsSync(SOURCE)) {
  console.error(`소스 아이콘을 찾을 수 없습니다: ${SOURCE}`);
  process.exit(1);
}

mkdirSync(BUILD_DIR, { recursive: true });

function genIcns() {
  // 이전 산출물 정리 후 재생성
  rmSync(ICONSET_DIR, { recursive: true, force: true });
  mkdirSync(ICONSET_DIR, { recursive: true });

  // iconutil이 요구하는 규격 이름과 크기
  const sizes = [
    { name: 'icon_16x16.png', px: 16 },
    { name: 'icon_16x16@2x.png', px: 32 },
    { name: 'icon_32x32.png', px: 32 },
    { name: 'icon_32x32@2x.png', px: 64 },
    { name: 'icon_128x128.png', px: 128 },
    { name: 'icon_128x128@2x.png', px: 256 },
    { name: 'icon_256x256.png', px: 256 },
    { name: 'icon_256x256@2x.png', px: 512 },
    { name: 'icon_512x512.png', px: 512 },
    { name: 'icon_512x512@2x.png', px: 1024 },
  ];

  for (const { name, px } of sizes) {
    execFileSync('sips', [
      '-z', String(px), String(px),
      SOURCE,
      '--out', path.join(ICONSET_DIR, name),
    ], { stdio: 'ignore' });
  }

  execFileSync('iconutil', ['-c', 'icns', ICONSET_DIR, '-o', OUT_ICNS]);

  // 중간 산출물(iconset 디렉터리)은 정리
  rmSync(ICONSET_DIR, { recursive: true, force: true });

  console.log(`icon.icns 생성 완료: ${OUT_ICNS}`);
}

// ICO(Vista 이상) 디렉터리 엔트리는 원본 PNG 바이트를 그대로 담을 수 있다.
// BMP로 재인코딩할 필요가 없어 순수 Node만으로 유효한 .ico를 만들 수 있다.
function packIco(pngEntries) {
  const count = pngEntries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(count, 4);

  let offset = 6 + 16 * count;
  const dirEntries = [];
  const imageDatas = [];
  for (const { size, buffer } of pngEntries) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size; // width (0 = 256)
    entry[1] = size >= 256 ? 0 : size; // height (0 = 256)
    entry[2] = 0; // color count (0 = no palette)
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(buffer.length, 8); // 데이터 크기
    entry.writeUInt32LE(offset, 12); // 데이터 오프셋
    dirEntries.push(entry);
    imageDatas.push(buffer);
    offset += buffer.length;
  }
  return Buffer.concat([header, ...dirEntries, ...imageDatas]);
}

function genIco() {
  rmSync(ICO_TMP_DIR, { recursive: true, force: true });
  mkdirSync(ICO_TMP_DIR, { recursive: true });

  // Windows 아이콘 관례 크기 (작업표시줄·바로가기·탐색기·exe 리소스)
  const sizes = [16, 24, 32, 48, 64, 128, 256];

  const entries = sizes.map((px) => {
    const out = path.join(ICO_TMP_DIR, `icon_${px}.png`);
    execFileSync('sips', ['-z', String(px), String(px), SOURCE, '--out', out], {
      stdio: 'ignore',
    });
    return { size: px, buffer: readFileSync(out) };
  });

  writeFileSync(OUT_ICO, packIco(entries));
  rmSync(ICO_TMP_DIR, { recursive: true, force: true });

  console.log(`icon.ico 생성 완료: ${OUT_ICO}`);
}

genIcns();
genIco();
