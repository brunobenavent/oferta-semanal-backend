import mongoose from 'mongoose';

const offerSchema = new mongoose.Schema({
  codigoArticulo: {
    type: String,
    required: true,
    match: /^\d{6}$/,
    index: true
  },
  descripcionArticulo: String,
  descripcion: String,
  descripcion2Articulo: String,
  centro: {
    type: String,
    index: true
  },
  tipoMaceta: String,
  maceta: {
    type: String,
    index: true
  },
  altura: {
    type: String,
    index: true
  },
  codigoFamilia: String,
  precio1: Number,
  precio2: Number,
  precio3: Number,
  presentacion: String,
  calibre: String,
  ubicacion: String,
  ean: String,
  undsCarro: Number,
  undsTabla: Number,
  undsCaja: Number,
  imagenUrl: String,
  imagenSubidaManual: {
    type: Boolean,
    default: false
  },
  imagenActualizado: Date,
  ofertaNuevoEspacio: Boolean,
  ofertaEuroPlanta: Boolean,
  ofertaCortijo: Boolean,
  ofertaFinca: Boolean,
  ofertaArroyo: Boolean,
  ofertaGamera: Boolean,
  ofertaGarden: Boolean,
  ofertaMarbella: Boolean,
  ofertaEstacion: Boolean,
  ofertaActiva: {
    type: Boolean,
    default: true,
    index: true
  },
  ultimaActualizacion: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

offerSchema.index({ centro: 1, descripcion: 1, maceta: 1, altura: 1 });
offerSchema.index({ ofertaActiva: 1, centro: 1 });

export const Offer = mongoose.model('Offer', offerSchema);
