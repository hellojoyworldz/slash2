// 메뉴 바용 템플릿 아이콘 생성 (검정 "/" 모양, 투명 배경 PNG)
// macOS가 라이트/다크 모드에 맞춰 알아서 색을 바꿔준다 (Template 네이밍 규칙).
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (const byte of buf) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function makePng(size, thickness) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA

  // 대각선 "/" : x + y == size-1 근처를 칠한다
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4); // 필터 바이트 + RGBA
    for (let x = 0; x < size; x++) {
      const on = Math.abs(x + y - (size - 1)) <= thickness;
      row[1 + x * 4 + 3] = on ? 255 : 0; // 알파만 채움 (검정)
    }
    rows.push(row);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync('iconTemplate.png', makePng(16, 1));
writeFileSync('iconTemplate@2x.png', makePng(32, 2));
console.log('iconTemplate.png / iconTemplate@2x.png 생성 완료');
