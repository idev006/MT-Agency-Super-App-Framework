// Visible synthetic evidence photos for DEV seeding (R7: the old 1×1 px placeholder looked blank in
// the photo tab). Pure Node PNG encoder (zlib + CRC32), no dependencies, no real-world imagery:
// a coloured background, a white "plate" block, and a dark bar on the side the slot represents.
import {deflateSync} from 'node:zlib';

const CRC_TABLE = Array.from({length: 256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xFFFFFFFF; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

const PALETTE = [[52, 101, 164], [196, 160, 0], [78, 154, 6], [204, 0, 0], [117, 80, 123], [206, 92, 0], [85, 87, 83], [32, 74, 135], [143, 89, 2], [46, 52, 54]];

export function syntheticVehiclePng({index = 0, slot = 'FRONT', width = 480, height = 320} = {}) {
  const bg = PALETTE[index % PALETTE.length];
  const px = (x, y) => {
    const plate = x > width * 0.3 && x < width * 0.7 && y > height * 0.4 && y < height * 0.6;
    const border = plate && (x < width * 0.3 + 4 || x > width * 0.7 - 4 || y < height * 0.4 + 4 || y > height * 0.6 - 4);
    const bar = (slot === 'FRONT' && y < 24) || (slot === 'REAR' && y > height - 24) || (slot === 'LEFT' && x < 24)
      || (slot === 'RIGHT' && x > width - 24) || (slot === 'FRONT_ANGLE' && (y < 24 || x < 24));
    if (border || bar) return [20, 20, 20];
    if (plate) return [250, 250, 250];
    return bg;
  };
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) { const [r, g, b] = px(x, y), o = y * (width * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}
