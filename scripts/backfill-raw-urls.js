import { connectDB } from '../src/config/mongo.js';
import { Offer } from '../src/models/Offer.js';
import { getUrl, FOLDER } from '../src/services/cloudinary.js';

async function backfill() {
  await connectDB();

  const offers = await Offer.find({
    imagenUrl: { $exists: true, $ne: null, $ne: '' }
  });

  console.log(`Re-bacfilling ${offers.length} offers with raw URLs...`);

  let updated = 0;
  for (const offer of offers) {
    const rawUrl = getUrl(`${FOLDER}/${offer.codigoArticulo}`, 'real');
    await Offer.updateOne(
      { codigoArticulo: offer.codigoArticulo },
      { $set: { imagenUrl: rawUrl } }
    );
    updated++;
    if (updated % 100 === 0) console.log(`  ${updated} updated`);
  }

  console.log(`✅ Updated ${updated} offers with raw URLs`);
  process.exit(0);
}

backfill().catch(err => { console.error(err); process.exit(1); });
