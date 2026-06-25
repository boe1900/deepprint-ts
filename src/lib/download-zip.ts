const encoder = new TextEncoder();

let crcTable: Uint32Array | null = null;

const getCrcTable = () => {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  return crcTable;
};

const crc32 = (bytes: Uint8Array) => {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const header = (size: number) => {
  const bytes = new Uint8Array(size);
  return { bytes, view: new DataView(bytes.buffer) };
};

const nowDos = () => {
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  return { time, date };
};

export const downloadZip = (filename: string, files: Record<string, string>) => {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const { time, date } = nowDos();

  for (const [path, content] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const name = encoder.encode(path);
    const data = encoder.encode(content);
    const crc = crc32(data);

    const local = header(30 + name.length);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, 0x0800, true);
    local.view.setUint16(10, time, true);
    local.view.setUint16(12, date, true);
    local.view.setUint32(14, crc, true);
    local.view.setUint32(18, data.length, true);
    local.view.setUint32(22, data.length, true);
    local.view.setUint16(26, name.length, true);
    local.bytes.set(name, 30);
    parts.push(local.bytes, data);

    const dir = header(46 + name.length);
    dir.view.setUint32(0, 0x02014b50, true);
    dir.view.setUint16(4, 20, true);
    dir.view.setUint16(6, 20, true);
    dir.view.setUint16(8, 0x0800, true);
    dir.view.setUint16(12, time, true);
    dir.view.setUint16(14, date, true);
    dir.view.setUint32(16, crc, true);
    dir.view.setUint32(20, data.length, true);
    dir.view.setUint32(24, data.length, true);
    dir.view.setUint16(28, name.length, true);
    dir.view.setUint32(42, offset, true);
    dir.bytes.set(name, 46);
    central.push(dir.bytes);

    offset += local.bytes.length + data.length;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = header(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(8, central.length, true);
  end.view.setUint16(10, central.length, true);
  end.view.setUint32(12, centralSize, true);
  end.view.setUint32(16, offset, true);

  const zipParts = [...parts, ...central, end.bytes];
  const zipBytes = new Uint8Array(zipParts.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;
  for (const part of zipParts) {
    zipBytes.set(part, cursor);
    cursor += part.length;
  }

  const url = URL.createObjectURL(new Blob([zipBytes.buffer], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
