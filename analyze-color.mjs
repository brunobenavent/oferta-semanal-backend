import sharp from 'sharp';
import { join } from 'path';

const src = join(process.env.HOME, 'Desktop/comerciales/benny_hansen.png');

const { data, info } = await sharp(src)
  .resize(50, 50)
  .raw()
  .toBuffer({ resolveWithObject: true });

for (let y = 0; y < 5; y++) {
  let r = 0, g = 0, b = 0;
  for (let x = 0; x < 50; x++) {
    const idx = (y * 50 + x) * 3;
    r += data[idx];
    g += data[idx + 1];
    b += data[idx + 2];
  }
  console.log(`Row ${y}: rgb(${(r/50).toFixed(0)}, ${(g/50).toFixed(0)}, ${(b/50).toFixed(0)})`);
}

// Top 10 rows average
const topArea = data.slice(0, 10 * 50 * 3);
let tr = 0, tg = 0, tb = 0;
const pixels = 10 * 50;
for (let i = 0; i < pixels; i++) {
  tr += topArea[i * 3];
  tg += topArea[i * 3 + 1];
  tb += topArea[i * 3 + 2];
}
console.log(`\nTop 10 rows avg: rgb(${(tr/pixels).toFixed(0)}, ${(tg/pixels).toFixed(0)}, ${(tb/pixels).toFixed(0)})`);
