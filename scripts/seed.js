import { connectDB } from '../src/config/mongo.js';
import { Offer } from '../src/models/Offer.js';

const sampleOffers = [
  { codigoArticulo: '128903', descripcionArticulo: 'Rosal Trepadora Rojo Intenso', descripcion: 'Rosal', centro: 'Nuevo Espacio', tipoMaceta: 'Maceta 3L', maceta: '3L', altura: '60-80cm', codigoFamilia: 'ROS', precio1: 12.50, precio2: 10.25, precio3: 8.90, ofertaActiva: true },
  { codigoArticulo: '128904', descripcionArticulo: 'Hortensia Azul Premium', descripcion: 'Hortensia', centro: 'Europlantas', tipoMaceta: 'Maceta 5L', maceta: '5L', altura: '40-50cm', codigoFamilia: 'HOR', precio1: 18.75, precio2: 15.50, precio3: 13.25, ofertaActiva: true },
  { codigoArticulo: '128905', descripcionArticulo: 'Lavanda Francesa', descripcion: 'Aromática', centro: 'Cortijo Blanco', tipoMaceta: 'Maceta 2L', maceta: '2L', altura: '20-30cm', codigoFamilia: 'ARO', precio1: 5.95, precio2: 4.80, precio3: 4.10, ofertaActiva: true },
  { codigoArticulo: '128906', descripcionArticulo: 'Geranio Rojo Colgante', descripcion: 'Geranio', centro: 'Nuevo Espacio', tipoMaceta: 'Maceta 3L', maceta: '3L', altura: '25-35cm', codigoFamilia: 'GER', precio1: 7.25, precio2: 6.00, precio3: 5.15, ofertaActiva: true },
  { codigoArticulo: '128907', descripcionArticulo: 'Bougainvillea Morada', descripcion: 'Enredadera', centro: 'Europlantas', tipoMaceta: 'Maceta 7L', maceta: '7L', altura: '100-120cm', codigoFamilia: 'ENR', precio1: 22.00, precio2: 18.50, precio3: 16.00, ofertaActiva: true },
  { codigoArticulo: '128908', descripcionArticulo: 'Cala Blanca Elegante', descripcion: 'Bulbo', centro: 'Cortijo Blanco', tipoMaceta: 'Maceta 3L', maceta: '3L', altura: '50-60cm', codigoFamilia: 'BUL', precio1: 9.50, precio2: 7.80, precio3: 6.65, ofertaActiva: true },
  { codigoArticulo: '128909', descripcionArticulo: 'Ficus Benjamina', descripcion: 'Ficus', centro: 'Nuevo Espacio', tipoMaceta: 'Maceta 12L', maceta: '12L', altura: '150-175cm', codigoFamilia: 'FIC', precio1: 35.00, precio2: 29.50, precio3: 25.00, ofertaActiva: true },
  { codigoArticulo: '128910', descripcionArticulo: 'Petunia Rizada Rosa', descripcion: 'Petunia', centro: 'Europlantas', tipoMaceta: 'Maceta 1L', maceta: '1L', altura: '15-20cm', codigoFamilia: 'PET', precio1: 4.25, precio2: 3.50, precio3: 2.95, ofertaActiva: true },
  { codigoArticulo: '128911', descripcionArticulo: 'Cactus San Pedro', descripcion: 'Cactus', centro: 'Cortijo Blanco', tipoMaceta: 'Maceta 5L', maceta: '5L', altura: '40-60cm', codigoFamilia: 'CAC', precio1: 15.00, precio2: 12.50, precio3: 10.75, ofertaActiva: true },
  { codigoArticulo: '128912', descripcionArticulo: 'Orquídea Phalaenopsis Blanca', descripcion: 'Orquídea', centro: 'Nuevo Espacio', tipoMaceta: 'Maceta 2L', maceta: '2L', altura: '50-70cm', codigoFamilia: 'ORQ', precio1: 28.50, precio2: 24.00, precio3: 20.50, ofertaActiva: true },
  { codigoArticulo: '128913', descripcionArticulo: 'Tomate Cherry Pera', descripcion: 'Hortícola', centro: 'Europlantas', tipoMaceta: 'Maceta 3L', maceta: '3L', altura: '30-40cm', codigoFamilia: 'HOR', precio1: 6.50, precio2: 5.25, precio3: 4.50, ofertaActiva: true },
  { codigoArticulo: '128914', descripcionArticulo: 'Albahaca Genovesa', descripcion: 'Aromática', centro: 'Cortijo Blanco', tipoMaceta: 'Maceta 1L', maceta: '1L', altura: '15-20cm', codigoFamilia: 'ARO', precio1: 3.75, precio2: 3.00, precio3: 2.55, ofertaActiva: true },
  { codigoArticulo: '128915', descripcionArticulo: 'Clavelina Rosa', descripcion: 'Clavel', centro: 'Nuevo Espacio', tipoMaceta: 'Maceta 2L', maceta: '2L', altura: '20-30cm', codigoFamilia: 'CLA', precio1: 5.00, precio2: 4.20, precio3: 3.60, ofertaActiva: true },
  { codigoArticulo: '128916', descripcionArticulo: 'Helecho Boston', descripcion: 'Helecho', centro: 'Europlantas', tipoMaceta: 'Maceta 4L', maceta: '4L', altura: '30-45cm', codigoFamilia: 'HEL', precio1: 11.00, precio2: 9.00, precio3: 7.70, ofertaActiva: true },
  { codigoArticulo: '128917', descripcionArticulo: 'Palmera Areca', descripcion: 'Palmera', centro: 'Cortijo Blanco', tipoMaceta: 'Maceta 15L', maceta: '15L', altura: '120-150cm', codigoFamilia: 'PAL', precio1: 42.00, precio2: 35.00, precio3: 30.00, ofertaActiva: true },
  { codigoArticulo: '128918', descripcionArticulo: 'Suculenta Echeveria', descripcion: 'Suculenta', centro: 'Nuevo Espacio', tipoMaceta: 'Maceta 1L', maceta: '1L', altura: '10-15cm', codigoFamilia: 'SUC', precio1: 4.50, precio2: 3.75, precio3: 3.20, ofertaActiva: true },
  { codigoArticulo: '128919', descripcionArticulo: 'Poto Dorado', descripcion: 'Trepadora', centro: 'Europlantas', tipoMaceta: 'Maceta 3L', maceta: '3L', altura: '60-80cm', codigoFamilia: 'TRE', precio1: 8.00, precio2: 6.50, precio3: 5.60, ofertaActiva: true },
  { codigoArticulo: '128920', descripcionArticulo: 'Cuna de Moisés', descripcion: 'Follaje', centro: 'Cortijo Blanco', tipoMaceta: 'Maceta 4L', maceta: '4L', altura: '40-50cm', codigoFamilia: 'FOL', precio1: 13.50, precio2: 11.00, precio3: 9.45, ofertaActiva: true },
  { codigoArticulo: '128921', descripcionArticulo: 'Anturio Rojo', descripcion: 'Anturio', centro: 'Nuevo Espacio', tipoMaceta: 'Maceta 3L', maceta: '3L', altura: '35-45cm', codigoFamilia: 'ANT', precio1: 16.50, precio2: 13.75, precio3: 11.75, ofertaActiva: true },
  { codigoArticulo: '128922', descripcionArticulo: 'Romero', descripcion: 'Aromática', centro: 'Europlantas', tipoMaceta: 'Maceta 2L', maceta: '2L', altura: '20-30cm', codigoFamilia: 'ARO', precio1: 4.00, precio2: 3.25, precio3: 2.80, ofertaActiva: true },
  { codigoArticulo: '128923', descripcionArticulo: 'Margarita Leucanthemum', descripcion: 'Margarita', centro: 'Cortijo Blanco', tipoMaceta: 'Maceta 2L', maceta: '2L', altura: '25-35cm', codigoFamilia: 'MAR', precio1: 5.50, precio2: 4.50, precio3: 3.85, ofertaActiva: true },
  { codigoArticulo: '128924', descripcionArticulo: 'Bonsái Olivo', descripcion: 'Bonsái', centro: 'Nuevo Espacio', tipoMaceta: 'Maceta 1L', maceta: '1L', altura: '20-30cm', codigoFamilia: 'BON', precio1: 45.00, precio2: 38.00, precio3: 32.50, ofertaActiva: true },
];

async function seed() {
  await connectDB();
  await Offer.deleteMany({});
  await Offer.insertMany(sampleOffers);
  console.log(`Seeded ${sampleOffers.length} offers`);
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
