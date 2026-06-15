import config from '../config/index.js';
import { connectDB } from '../config/mongo.js';
import { syncOffers } from '../services/sync.js';
import { watchFtpImages } from '../services/imageWatcher.js';

async function startCron() {
  await connectDB();
  console.log('[Cron] Conectado a MongoDB');

  console.log(`[Cron] Sync de ofertas cada ${config.sync.offerInterval / 1000}s`);
  console.log(`[Cron] Watcher de imágenes cada ${config.sync.imageInterval / 1000}s`);

  const runSync = async () => {
    try {
      await syncOffers('cron');
    } catch (error) {
      console.error('[Cron] Error en sync de ofertas:', error.message);
    }
  };

  const runWatcher = async () => {
    try {
      await watchFtpImages();
    } catch (error) {
      console.error('[Cron] Error en watcher de imágenes:', error.message);
    }
  };

  runSync();
  runWatcher();

  setInterval(runSync, config.sync.offerInterval);
  setInterval(runWatcher, config.sync.imageInterval);

  console.log('[Cron] Servicios iniciados');
}

startCron().catch(console.error);
