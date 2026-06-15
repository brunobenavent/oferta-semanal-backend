import cron from 'node-cron';
import { syncOffers } from '../services/sync.js';

let isSyncing = false;

const run = async () => {
  if (isSyncing) {
    console.log('[SyncJob] Sincronización anterior sigue en curso. Omitiendo.');
    return;
  }

  isSyncing = true;
  console.log('[SyncJob] Iniciando sincronización programada...');

  try {
    await syncOffers('cron');
  } catch (err) {
    console.error('[SyncJob] Error:', err.message);
  } finally {
    isSyncing = false;
    console.log('[SyncJob] Tarea de sincronización finalizada.');
  }
};

export const startSyncJob = () => {
  console.log('[SyncJob] Programando sync cada 5 minutos...');
  cron.schedule('*/5 * * * *', run);

  console.log('[SyncJob] Ejecutando sincronización inicial...');
  run();
};
