import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  'dev-dist',
  'data',
  '.git',
  '.vite',
]);

const EXCLUDED_FILES = new Set([
  'imc_clean.db',
  'imc_clean.db-shm',
  'imc_clean.db-wal',
]);

function collectFiles(rootDir: string, currentDir: string, out: Array<{relPath: string; data: Buffer}>): void {
  const entries = fs.readdirSync(currentDir, {withFileTypes: true});
  for (const entry of entries) {
    if (entry.name.startsWith('.env') && entry.name !== '.env.example') continue;
    const fullPath = path.join(currentDir, entry.name);
    const relPath = path.relative(rootDir, fullPath).split(path.sep).join('/');

    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || EXCLUDED_DIRS.has(entry.name)) continue;
      // Skip uploaded screenshots directory inside public/assets/aistudio
      if (relPath === 'public/assets/aistudio') continue;
      collectFiles(rootDir, fullPath, out);
    } else if (entry.isFile()) {
      if (
        EXCLUDED_FILES.has(entry.name) ||
        entry.name.endsWith('.db') ||
        entry.name.endsWith('.sqlite') ||
        entry.name.endsWith('.log')
      ) {
        continue;
      }
      out.push({relPath, data: fs.readFileSync(fullPath)});
    }
  }
}

export function buildProjectZipBuffer(rootDir: string = process.cwd()): Buffer {
  const files: Array<{relPath: string; data: Buffer}> = [];
  collectFiles(rootDir, rootDir, files);

  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  for (const file of files) {
    const nameBuf = Buffer.from(file.relPath, 'utf8');
    const uncompressed = file.data;
    const compressed = zlib.deflateRawSync(uncompressed);
    const fileCrc = crc32(uncompressed);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 flag
    localHeader.writeUInt16LE(8, 8); // deflate
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(fileCrc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(uncompressed.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8 flag
    centralHeader.writeUInt16LE(8, 10); // deflate
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(fileCrc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(uncompressed.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}
