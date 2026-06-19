import express from 'express';
import { Offer } from '../models/Offer.js';
import { getISOWeek, getWeekYear } from '../utils/week.js';
import multer from 'multer';
import { uploadImage } from '../services/cloudinary.js';
import * as ftpService from '../services/ftp.js';
import { tryAuthenticate, authorize } from '../middleware/auth.js';

const upload = multer({ 
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});


const OFFER_CENTER_MAP = {
  'Nuevo Espacio': 'ofertaNuevoEspacio',
  'Europlantas': 'ofertaEuroPlanta',
  'Cortijo Blanco': 'ofertaCortijo',
  'Finca': 'ofertaFinca',
  'Arroyo': 'ofertaArroyo',
  'Gamera': 'ofertaGamera',
  'Garden': 'ofertaGarden',
  'Marbella': 'ofertaMarbella',
  'Estación': 'ofertaEstacion',
};

const router = express.Router();

router.get('/', tryAuthenticate, async function(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const search = req.query.search || '';
    const centro = req.query.centro || '';
    const familia = req.query.familia || '';
    const maceta = req.query.maceta || '';
    const altura = req.query.altura || '';
    const codigos = req.query.codigos || '';
    const sortOrderInt = req.query.sortOrder === 'desc' ? -1 : 1;
    const sortBy = req.query.sortBy || 'codigo';

    const semana = getISOWeek();
    const semanaAnio = getWeekYear();

    const query = { ofertaActiva: true };

    if (search) {
      query.$or = [
        { codigoArticulo: { $regex: '^' + search, $options: 'i' } },
        { descripcionArticulo: { $regex: search, $options: 'i' } },
        { descripcion2Articulo: { $regex: search, $options: 'i' } }
      ];
    }

    if (centro) {
      const offerField = OFFER_CENTER_MAP[centro];
      if (offerField) query[offerField] = true;
    }
    if (familia) query.descripcion = familia;
    if (maceta) query.maceta = maceta;
    if (altura) query.altura = altura;

    if (codigos) {
      const codigosArray = codigos.split(',').map(c => c.trim()).filter(Boolean);
      if (codigosArray.length > 0) {
        query.codigoArticulo = { $in: codigosArray };
      }
    }

    let sortObj = {};
    switch (sortBy) {
      case 'precio':
        sortObj = { precio1: sortOrderInt };
        break;
      case 'nombre':
        sortObj = { descripcionArticulo: sortOrderInt };
        break;
      default:
        sortObj = { codigoArticulo: 1 };
    }

    const skip = (page - 1) * limit;
    const total = await Offer.countDocuments(query);
    const totalSinFiltros = await Offer.countDocuments({ ofertaActiva: true });
    const offers = await Offer.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .lean();

    // Price filtering based on user role and tier
    const filteredOffers = offers.map(offer => {
      const result = { ...offer };
      const user = req.user;

      if (!user) {
        // Unauthenticated — only show PVP
        delete result.precio2;
        delete result.precio3;
      } else if (user.roles?.includes('client')) {
        if (user.priceTier === 2) {
          delete result.precio3; // tier 2 sees precio1 + precio2
        } else if (user.priceTier === 3) {
          delete result.precio2; // tier 3 sees precio1 + precio3
        }
        // Clients see only their tier prices
      }
      // superadmin/admin/employee — all prices stay

      return result;
    });

    res.json({
      offers: filteredOffers,
      totalSinFiltros,
      semana,
      semanaAnio,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        page,
        limit
      }
    });

  } catch (error) {
    next(error);
  }
});

router.get('/filters', async function(req, res, next) {
  try {
    const baseQuery = { ofertaActiva: true };

    const centros = [];
    for (const [label, field] of Object.entries(OFFER_CENTER_MAP)) {
      const count = await Offer.countDocuments({ ...baseQuery, [field]: true });
      if (count > 0) centros.push(label);
    }

    const familias = await Offer.distinct('descripcion', { ...baseQuery, descripcion: { $ne: null, $ne: '' } });
    const macetas = await Offer.distinct('maceta', { ...baseQuery, maceta: { $ne: null, $ne: '' } });
    const alturas = await Offer.distinct('altura', { ...baseQuery, altura: { $ne: null, $ne: '' } });

    res.json({
      centros: centros.sort(),
      familias: familias.filter(Boolean).sort(),
      macetas: macetas.filter(Boolean).sort(),
      alturas: alturas.filter(Boolean).sort()
    });

  } catch (error) {
    next(error);
  }
});

router.get('/export', tryAuthenticate, async function(req, res, next) {
  try {
    const semana = getISOWeek();
    const semanaAnio = getWeekYear();
    const { centro, familia, maceta, altura, search, codigos } = req.query;

    const query = { ofertaActiva: true };

    if (codigos) {
      query.codigoArticulo = { $in: codigos.split(',').map(c => c.trim()) };
    } else if (search) {
      query.$or = [
        { codigoArticulo: { $regex: '^' + search, $options: 'i' } },
        { descripcionArticulo: { $regex: search, $options: 'i' } }
      ];
    }
    if (centro) {
      const offerField = OFFER_CENTER_MAP[centro];
      if (offerField) query[offerField] = true;
    }
    if (familia) query.descripcion = familia;
    if (maceta) query.maceta = maceta;
    if (altura) query.altura = altura;

    const offers = await Offer.find(query).sort({ codigoArticulo: 1 }).lean();

    if (req.query.format === 'json') {
      return res.json({ offers, semana, semanaAnio });
    }

    // Price filtering based on user role and tier
    const filteredOffers = offers.map(offer => {
      const result = { ...offer };
      const user = req.user;

      if (!user) {
        delete result.precio2;
        delete result.precio3;
      } else if (user.roles?.includes('client')) {
        if (user.priceTier === 2) {
          delete result.precio3;
        } else if (user.priceTier === 3) {
          delete result.precio2;
        }
      }

      return result;
    });

    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Ofertas Semanales');

    sheet.columns = [
      { header: 'Código', key: 'codigoArticulo', width: 10 },
      { header: 'Nombre', key: 'descripcionArticulo', width: 40 },
      { header: 'Familia', key: 'descripcion', width: 20 },
      { header: 'Centro', key: 'centro', width: 20 },
      { header: 'Maceta', key: 'maceta', width: 15 },
      { header: 'Altura', key: 'altura', width: 15 },
      { header: 'PVP', key: 'precio1', width: 10 },
    ];

    filteredOffers.forEach(offer => {
      sheet.addRow({
        codigoArticulo: offer.codigoArticulo,
        descripcionArticulo: offer.descripcionArticulo,
        descripcion: offer.descripcion,
        centro: offer.centro,
        maceta: offer.maceta,
        altura: offer.altura,
        precio1: offer.precio1,
      });
    });

    sheet.getRow(1).font = { bold: true };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=ofertas-semanales.xlsx');

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    next(error);
  }
});

router.post('/:codigo/imagen', tryAuthenticate, authorize('superadmin', 'admin', 'employee'), upload.single('imagen'), async (req, res, next) => {
  try {
    const { codigo } = req.params;
    const file = req.file;

    if (!file) return res.status(400).json({ message: 'No se recibió imagen' });

    // 1. Subir a Cloudinary
    const result = await uploadImage(file.buffer, codigo);

    // 2. Update Offer
    const offer = await Offer.findOneAndUpdate(
      { codigoArticulo: codigo },
      { 
        $set: { 
          imagenUrl: result.secure_url, 
          imagenSubidaManual: true, 
          imagenActualizado: new Date() 
        } 
      },
      { new: true }
    );

    if (!offer) return res.status(404).json({ message: 'Oferta no encontrada' });

    // 3. Subir a FTP (best effort)
    try {
      await ftpService.connectFtp();
      const subdir = ftpService.getSubdir(codigo);
      const remotePath = `${process.env.FTP_PATH}${subdir}/${codigo}-0.jpg`;
      await ftpService.uploadToFtp(file.buffer, remotePath);
    } catch (ftpError) {
      console.error('Error subiendo a FTP (best effort):', ftpError);
    }

    res.json({ imagenUrl: result.secure_url });
  } catch (error) {
    next(error);
  }
});

router.delete('/:codigo/imagen', tryAuthenticate, authorize('superadmin', 'admin', 'employee'), async (req, res, next) => {
  try {
    const { codigo } = req.params;

    const offer = await Offer.findOneAndUpdate(
      { codigoArticulo: codigo },
      { 
        $set: { imagenSubidaManual: false },
        $unset: { imagenUrl: '', imagenActualizado: '' }
      },
      { new: true }
    );

    if (!offer) return res.status(404).json({ message: 'Oferta no encontrada' });

    res.json({ message: 'Imagen restaurada al ciclo automático' });
  } catch (error) {
    next(error);
  }
});

router.get('/:codigo', tryAuthenticate, async (req, res, next) => {
  try {
    const { codigo } = req.params;
    const offer = await Offer.findOne({ codigoArticulo: codigo, ofertaActiva: true }).lean();

    if (!offer) {
      return res.status(404).json({ message: 'Oferta no encontrada' });
    }

    // Price filtering matching the list endpoint
    const result = { ...offer };
    const user = req.user;

    if (!user) {
      delete result.precio2;
      delete result.precio3;
    } else if (user.roles?.includes('client')) {
      if (user.priceTier === 2) {
        delete result.precio3;
      } else if (user.priceTier === 3) {
        delete result.precio2;
      }
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
