import { existsSync, mkdirSync } from 'fs';
import { join, resolve, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '.env') });

const COMMERCIALS_SRC = resolve(process.env.HOME, 'Desktop/comerciales');
const COMMERCIALS_DEST = resolve(__dirname, 'uploads/commercials');

/**
 * Sample edge color for padding background from image borders.
 */
async function sampleEdgeColor(sourcePath) {
  try {
    const { data } = await sharp(sourcePath)
      .extract({ left: 0, top: 0, width: 100, height: 10 })
      .resize(1, 1)
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (data && data.length >= 3) {
      return { r: data[0], g: data[1], b: data[2] };
    }
  } catch { /* fallback */ }
  return { r: 221, g: 214, b: 198 };
}

/**
 * Custom crop con zoom, padding superior, y offset del crop.
 *
 * @param {string} sourcePath - Ruta al archivo original
 * @param {number} zoom - Factor de zoom (1.15 = 15% más zoom)
 * @param {number} extendTop - Pixeles de padding a añadir arriba (para bajar al sujeto)
 * @param {number} shiftX - Desplazamiento horizontal (-1..1, fracción del cropSize, negativo = izq)
 * @param {number} shiftY - Desplazamiento vertical (-1..1, fracción del cropSize, negativo = arriba)
 * @param {number} size - Tamaño del cuadrado de salida (default 400)
 */
async function customCropAndSave(sourcePath, destPath, zoom = 1, extendTop = 0, shiftX = 0, shiftY = 0, size = 400) {
  let pipeline = sharp(sourcePath);
  const meta = await pipeline.metadata();
  const { width, height } = meta;

  const shortSide = Math.min(width, height);

  // Tamaño del crop con zoom (más zoom = crop más chico)
  const cropSize = Math.round(shortSide / zoom);

  // ── Extender canvas si hace falta (para bajar la composición) ──
  // NOTA: Sharp tiene un bug con extend + extract encadenados (output distorsionado).
  // Por eso primero renderizamos a buffer si hay extend, y luego extract desde el buffer.
  let sourceBuffer = null;
  if (extendTop > 0) {
    const bgColor = await sampleEdgeColor(sourcePath);
    console.log(`  🖼️  extendiendo canvas arriba +${extendTop}px, bg: rgb(${bgColor.r},${bgColor.g},${bgColor.b})`);
    const { data } = await sharp(sourcePath)
      .extend({
        top: extendTop,
        bottom: 0,
        left: 0,
        right: 0,
        background: bgColor,
      })
      .toBuffer({ resolveWithObject: true });
    sourceBuffer = data;
  }

  const extWidth = width;
  const extHeight = height + (extendTop > 0 ? extendTop : 0);

  // Centro base de la imagen extendida
  const baseCenterX = Math.round(width / 2);
  const baseCenterY = Math.round(extHeight / 2);

  // Desplazamiento del centro del crop en píxeles
  const offsetX = Math.round(cropSize * shiftX);
  const offsetY = Math.round(cropSize * shiftY);

  let left, top;
  if (extendTop > 0) {
    // Con padding: crop desde arriba, shiftY mueve el crop dentro de la imagen
    top = Math.max(0, Math.min(0 + offsetY, extHeight - cropSize));
    left = Math.max(0, Math.min(Math.round((width - cropSize) / 2) + offsetX, width - cropSize));
  } else {
    // Sin padding: crop centrado con offset
    top = Math.max(0, Math.min(baseCenterY - Math.round(cropSize / 2) + offsetY, extHeight - cropSize));
    left = Math.max(0, Math.min(baseCenterX - Math.round(cropSize / 2) + offsetX, width - cropSize));
  }

  // Verificar que el crop cabe
  if (top + cropSize > extHeight) {
    throw new Error(`El crop (${cropSize}px) excede la altura de la imagen (${extHeight}px). Reducí el zoom o el padding.`);
  }

  console.log(`  📐 crop: ${cropSize}×${cropSize} @ (${left}, ${top}) de ${extWidth}×${extHeight} (original ${width}×${height})`);
  console.log(`     zoom: ${zoom}x, extendTop: ${extendTop}px, shiftX: ${shiftX}, shiftY: ${shiftY}`);
  console.log(`     offsetX: ${offsetX}px, offsetY: ${offsetY}px`);

  // Usar sourceBuffer si existe (extend), o sourcePath si no
  const sourceForExtract = sourceBuffer || sourcePath;
  await sharp(sourceForExtract)
    .extract({ left, top, width: cropSize, height: cropSize })
    .resize(size, size)
    .jpeg({ quality: 80 })
    .toFile(destPath);
}

// ─── Config ──────────────────────────────────────────────
const PHOTO_MAP = {
  'Benny Hansen':           'benny_hansen.png',
  'Antonio Santos':         'antonio santos.JPG',
  'Myriam Plan':            'miriam.jpg',
  'Ana Coll':               'ana coll',
  'Yadira Gutiérrez':       'yadira.JPG',
  'Daniela Ruiz':           'daniela.jpg',
  'José Francisco Fernández': 'francis_fernandez.png',
  'Tomas von Leipzig':      'tomas.png',
  'Cenk Sela':              'cenk.JPG',
  'Isabel Solano':          'isabel_solano.png',
  'Antonio Guzmán':         'antonio guzman.jpeg',
  'Elisabeth Vergara':      'elisabeth.jpg',
  'Juan Antonio Pérez':     'juan antonio perez.jpg',
  'Isabel Méndez':          'isabel Mendez',
};

async function findSourceFile(filename) {
  const filepath = join(COMMERCIALS_SRC, filename);
  if (existsSync(filepath)) return filepath;
  if (!extname(filename)) {
    for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
      const candidate = filepath + ext;
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

// Args: name zoom extendTop shiftX shiftY
// Ej: node custom-crop.mjs "Myriam Plan" 1.8225 0 -0.08 -0.15
async function main() {
  const name = process.argv[2] || 'Benny Hansen';
  const zoom = parseFloat(process.argv[3]) || 1.15;
  const extendTop = parseInt(process.argv[4]) || 0;
  const shiftX = parseFloat(process.argv[5]) || 0;
  const shiftY = parseFloat(process.argv[6]) || 0;

  await mongoose.connect(process.env.MONGODB_URI);
  const { User } = await import('./src/models/User.js');

  const user = await User.findOne({ nombre: name, role: 'commercial' });
  if (!user) { console.log(`❌ No se encontró comercial: ${name}`); process.exit(1); }

  const sourceFilename = PHOTO_MAP[name];
  const sourcePath = sourceFilename ? await findSourceFile(sourceFilename) : null;
  if (!sourcePath) { console.log(`❌ No se encontró source file para: ${name}`); process.exit(1); }

  if (!existsSync(COMMERCIALS_DEST)) mkdirSync(COMMERCIALS_DEST, { recursive: true });

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const destPath = join(COMMERCIALS_DEST, filename);

  console.log(`\n🔧 Custom crop para: ${name}`);
  console.log(`   zoom: ${zoom}x, extendTop: ${extendTop}px, shiftX: ${shiftX}, shiftY: ${shiftY}`);

  await customCropAndSave(sourcePath, destPath, zoom, extendTop, shiftX, shiftY, 400);

  const photoUrl = `/uploads/commercials/${filename}`;
  await User.findByIdAndUpdate(user._id, { $set: { photo: photoUrl } });

  console.log(`   ✅ ${photoUrl}`);
  await mongoose.disconnect();
}

main().catch(err => { console.error('❌', err); process.exit(1); });
