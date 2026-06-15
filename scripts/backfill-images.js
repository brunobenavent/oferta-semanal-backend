import { connectDB } from '../src/config/mongo.js';
import { Offer } from '../src/models/Offer.js';
import { imageExists, getUrl, FOLDER } from '../src/services/cloudinary.js';

async function backfill() {
  await connectDB();

  // Offers sin imagenUrl
  const offers = await Offer.find({
    $or: [
      { imagenUrl: { $exists: false } },
      { imagenUrl: null },
      { imagenUrl: '' }
    ],
    ofertaActiva: true
  });

  console.log(`Procesando ${offers.length} ofertas sin imagenUrl...`);

  let updated = 0;
  let notFound = 0;

  for (const offer of offers) {
    const codigo = offer.codigoArticulo;
    try {
      // Check if image exists in Cloudinary
      const exists = await imageExists(`${FOLDER}/${codigo}`);
      if (exists) {
        const url = getUrl(`${FOLDER}/${codigo}`, 'medium');
        await Offer.updateOne(
          { codigoArticulo: codigo },
          { $set: { imagenUrl: url, imagenActualizado: new Date() } }
        );
        updated++;
        if (updated % 50 === 0) console.log(`  Progreso: ${updated} actualizadas`);
      } else {
        notFound++;
      }
    } catch (err) {
      // Image doesn't exist on Cloudinary
      notFound++;
    }
  }

  console.log(`\nCompletado:`);
  console.log(`  ✅ ${updated} ofertas con imagen linkeada`);
  console.log(`  ❌ ${notFound} ofertas sin imagen en Cloudinary`);
  console.log(`  📊 Total procesadas: ${offers.length}`);
  process.exit(0);
}

backfill().catch(err => { console.error(err); process.exit(1); });
