import { connectFtp, downloadFromFtp, getSubdir, changeDir, lastMod } from './ftp.js'; // Nuevo servicio
import config from '../config/index.js';
import { uploadImage } from './cloudinary.js';
import { Offer } from '../models/Offer.js';
import { SyncLog } from '../models/SyncLog.js';

const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // 24 horas
const CLOUDINARY_MAX_BYTES = 10 * 1024 * 1024; // 10MB (límite plan gratis)

function isTransientError(err) {
  const msg = err.message || '';
  // "File size too large" de Cloudinary no es transitorio
  if (msg.includes('File size too large')) return false;
  // Cualquier otro error (timeout, conexión, etc.) se reintenta
  return true;
}

export async function processImageBatch(batchSize = 50) {
  // Batch 1: Ofertas SIN imagen (prioridad máxima) — usamos $sample para mezclar
  // y no atascarnos siempre con los mismos códigos bajos que no tienen foto en FTP
  const newOffers = await Offer.aggregate([
    { $match: {
      imagenSubidaManual: { $ne: true },
      $or: [
        { imagenUrl: { $exists: false } },
        { imagenUrl: null },
        { imagenUrl: '' }
      ]
    }},
    { $sample: { size: batchSize } }
  ]);

  // Batch 2: Ofertas CON imagen pero que hace rato no se verifican
  const staleDate = new Date(Date.now() - STALE_AFTER_MS);
  const remainingSlots = batchSize - newOffers.length;

  const staleOffers = remainingSlots > 0 ? await Offer.aggregate([
    { $match: {
      imagenSubidaManual: { $ne: true },
      imagenUrl: { $exists: true, $ne: null, $ne: '' },
      $or: [
        { imagenActualizado: { $exists: false } },
        { imagenActualizado: null },
        { imagenActualizado: { $lt: staleDate } }
      ]
    }},
    { $sample: { size: remainingSlots } }
  ]) : [];

  const offers = [...newOffers, ...staleOffers];

  if (!offers.length) return { processed: 0, pending: 0, checked: 0, updated: 0 };

  const pending = await Offer.countDocuments({
    imagenSubidaManual: { $ne: true },
    $or: [
      { imagenUrl: { $exists: false } },
      { imagenUrl: null },
      { imagenUrl: '' }
    ]
  });

  const MAX_RETRIES = 3;
  const RETRY_DELAY = 3000;

  let processed = 0;
  let checked = 0;
  let updated = 0;
  let skipped = 0;

  try {
    await connectFtp();

    const basePath = config.ftp.path;

    for (const offer of offers) {
      const codigo = offer.codigoArticulo;
      const filename = `${codigo}-0.jpg`;
      const subdir = getSubdir(codigo);
      const remotePath = `${basePath}/${subdir}/${filename}`;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          await changeDir(`${basePath}/${subdir}`);

          // Obtener fecha del archivo en FTP
          let ftpDate;
          try {
            ftpDate = await lastMod(filename);
          } catch {
            // El archivo no existe en FTP — lo saltamos
            break; // break retry loop, continue to next offer
          }

          const necesitaSubida = !offer.imagenUrl;
          const esMasReciente = ftpDate > (offer.imagenActualizado || new Date(0));

          if (!necesitaSubida && !esMasReciente) {
            // Ya tiene imagen y FTP no es más reciente — solo marcamos como verificado
            checked++;
            await Offer.updateOne(
              { codigoArticulo: codigo },
              { $set: { imagenActualizado: new Date() } }
            );
            break; // break retry loop, done with this offer
          }

          // Descargar el archivo
          const buffer = await downloadFromFtp(remotePath);

          // Cloudinary gratis: límite 10MB — saltar si es muy grande
          if (buffer.length > CLOUDINARY_MAX_BYTES) {
            console.log(`[ImageWatcher] Saltado ${codigo} — ${(buffer.length / 1024 / 1024).toFixed(1)}MB excede límite de 10MB`);
            skipped++;
            break; // no reintentar, no es error transitorio
          }

          // Subir a Cloudinary
          const result = await uploadImage(buffer, codigo);

          await Offer.updateOne(
            { codigoArticulo: codigo },
            {
              $set: {
                imagenUrl: result.secure_url,
                imagenActualizado: new Date()
              }
            }
          );

          processed++;
          if (necesitaSubida) {
            console.log(`[ImageWatcher] Subida ${codigo} — OK`);
          } else {
            console.log(`[ImageWatcher] Actualizada ${codigo} — FTP más reciente`);
            updated++;
          }
          break; // break retry loop, success
        } catch (err) {
          // Si el error NO es transitorio (ej. archivo muy grande), no reintentar
          if (!isTransientError(err)) {
            console.log(`[ImageWatcher] Saltado ${codigo} — error permanente: ${err.message}`);
            skipped++;
            break;
          }

          if (attempt < MAX_RETRIES) {
            console.log(`[ImageWatcher] Reintento ${attempt}/${MAX_RETRIES} para ${codigo}: ${err.message}`);
            await connectFtp();
          } else {
            console.error(`[ImageWatcher] Error con ${codigo} (${subdir}/${filename}) tras ${MAX_RETRIES} intentos: ${err.message}`);
          }
        }
      }
    }

    if (processed > 0) {
      const log = new SyncLog({ type: 'image', status: 'success', imagesUploaded: processed, duration: 0 });
      await log.save();
    }

    return { processed, pending: pending - newOffers.length, checked, updated, skipped };

  } catch (error) {
    console.error(`[ImageWatcher] Error de conexión FTP tras ${MAX_RETRIES} intentos: ${error.message}`);
    return { processed: 0, pending, checked: 0, updated: 0, skipped: 0, error: error.message };
  }
}

export async function watchFtpImages() {
  return processImageBatch(1418);
}
