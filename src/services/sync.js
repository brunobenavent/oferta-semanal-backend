import { Offer } from '../models/Offer.js';
import { SyncLog } from '../models/SyncLog.js';
import { queryArticles } from './dantia.js';

function mapArticle(article) {
  return {
    codigoArticulo: article.CodigoArticulo,
    descripcionArticulo: article.DescripcionArticulo,
    descripcion: article.Descripcion,
    descripcion2Articulo: article.Descripcion2Articulo,
    centro: article._Centro || article.Centro,
    tipoMaceta: article._TipoMaceta,
    maceta: article._Maceta,
    altura: article._Altura,
    codigoFamilia: article.CodigoFamilia,
    presentacion: article._Presentacion,
    calibre: article._Calibre,
    ubicacion: article.Ubicacion,
    ean: article.CodigoAlternativo2,
    undsCarro: article._UndsCarro,
    undsTabla: article._UndsTabla,
    undsCaja: article._UndsCaja,
    precio1: article.Precio1,
    precio2: article.PrecioVentasinIVA2,
    precio3: article.PrecioVentasinIVA3,
    ofertaNuevoEspacio: article._OfertaNuevoEspacio?.value === -1,
    ofertaEuroPlanta: article._OfertaEuroPlanta?.value === -1,
    ofertaCortijo: article._OfertaCortijo?.value === -1,
    ofertaFinca: article._OfertaFinca?.value === -1,
    ofertaArroyo: article._OfertaArroyo?.value === -1,
    ofertaGamera: article._OfertaGamera?.value === -1,
    ofertaGarden: article._OfertaGarden?.value === -1,
    ofertaMarbella: article._OfertaMarbella?.value === -1,
    ofertaEstacion: article._OfertaEstacion?.value === -1,
    ofertaActiva: true,
    ultimaActualizacion: new Date()
  };
}

export async function syncOffers(triggeredBy = 'cron') {
  const startTime = Date.now();
  console.log('[OfferSync] Iniciando sincronización de ofertas...');

  const log = new SyncLog({ type: 'offer', triggeredBy });
  await log.save();

  try {
    const whereOffers = [
      '_OfertaNuevoEspacio=-1', '_OfertaEuroPlanta=-1', '_OfertaCortijo=-1',
      '_OfertaFinca=-1', '_OfertaArroyo=-1', '_OfertaGamera=-1',
      '_OfertaGarden=-1', '_OfertaMarbella=-1', '_OfertaEstacion=-1'
    ].join(' or ');

    const result = await queryArticles({
      page: 1,
      count: 5000,
      where: `CodigoEmpresa=1 and (${whereOffers})`
    });

    const resources = result.data.$resources || [];

    if (resources.length === 0) {
      console.log('[OfferSync] No se encontraron artículos en oferta');
      log.status = 'success';
      log.articlesCount = 0;
      await log.save();
      return { totalProcessed: 0, newCount: 0, updatedCount: 0, deactivatedCount: 0, duration: 0 };
    }

    console.log(`[OfferSync] Recibidos ${resources.length} artículos de Dantia`);

    const seenCodes = new Set();
    const bulkOps = [];

    for (const article of resources) {
      const codigoArticulo = article.CodigoArticulo;
      if (!codigoArticulo) continue;
      seenCodes.add(codigoArticulo);
      bulkOps.push({
        updateOne: {
          filter: { codigoArticulo },
          update: { $set: mapArticle(article) },
          upsert: true
        }
      });
    }

    let newCount = 0;
    let updatedCount = 0;
    let totalProcessed = 0;

    if (bulkOps.length > 0) {
      const r = await Offer.bulkWrite(bulkOps, { ordered: false });
      newCount = r.upsertedCount || 0;
      updatedCount = r.matchedCount || 0;
      totalProcessed = bulkOps.length;
    }

    const deactivatedCount = await Offer.updateMany(
      { codigoArticulo: { $nin: Array.from(seenCodes) }, ofertaActiva: true },
      { $set: { ofertaActiva: false } }
    );

    const duration = Date.now() - startTime;

    log.status = 'success';
    log.articlesCount = totalProcessed;
    log.newCount = newCount;
    log.updatedCount = updatedCount;
    log.deactivatedCount = deactivatedCount.modifiedCount;
    log.duration = duration;
    await log.save();

    console.log(`[OfferSync] Completado: ${totalProcessed} artículos (${newCount} nuevos, ${updatedCount} actualizados, ${deactivatedCount.modifiedCount} desactivados) en ${duration}ms`);

    return { totalProcessed, newCount, updatedCount, deactivatedCount: deactivatedCount.modifiedCount, duration };

  } catch (error) {
    const duration = Date.now() - startTime;
    log.status = 'error';
    log.error = error.message;
    log.duration = duration;
    await log.save();

    console.error('[OfferSync] Error:', error.message);
    throw error;
  }
}
