import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

import express from 'express';
import cors from 'cors';
import config from './config/index.js';
import { connectDB } from './config/mongo.js';
import { seedIfEmpty } from './seed.js';
import offerRoutes from './routes/offers.js';
import { syncOffers } from './services/sync.js';
import { startSyncJob } from './jobs/sync.job.js';
import { processImageBatch, watchFtpImages } from './services/imageWatcher.js';
import { Offer } from './models/Offer.js';
import authRoutes from './routes/auth.js';
import commercialRoutes from './routes/commercials.js';
import preorderRoutes from './routes/preorders.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Oferta Semanal API Running' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/uploads', express.static(resolve(__dirname, '..', 'uploads')));
app.use('/api/auth', authRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/commercials', commercialRoutes);
app.use('/api/preorders', preorderRoutes);

app.post('/api/sync', async (req, res) => {
  try {
    const result = await syncOffers('manual');
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/backfill-images', async (req, res) => {
  try {
    const offers = await Offer.find({ $or: [
      { imagenUrl: { $exists: false } },
      { imagenUrl: null },
      { imagenUrl: '' }
    ]});
    res.json({ ok: true, total: offers.length });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/trigger-image-watcher', async (req, res) => {
  try {
    const result = await watchFtpImages();
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ message: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'La imagen supera el tamaño máximo de 5MB' });
  }
  res.status(500).json({ message: err.message || 'Internal server error' });
});

const PORT = config.port;

async function runImageWatcher() {
  try {
    await processImageBatch(50);
  } catch (err) {
    console.error('[ImageWatcher] Error:', err.message);
  }
}

connectDB().then(async () => {
  await seedIfEmpty();

  // Migrate: convert single role to roles array
  const { User } = await import('./models/User.js');
  const migrateResult = await User.updateMany(
    { roles: { $exists: false } },
    [{ $set: { roles: { $ifNull: ['$roles', ['$role']] } } }]
  );
  if (migrateResult.modifiedCount > 0) {
    console.log(`Migrated ${migrateResult.modifiedCount} users: role → roles[]`);
  }
  // Drop old role field
  await User.updateMany({ role: { $exists: true } }, [{ $unset: ['role'] }]);

  startSyncJob();

  setTimeout(runImageWatcher, 10000);
  setInterval(runImageWatcher, 30000);

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});

export default app;
