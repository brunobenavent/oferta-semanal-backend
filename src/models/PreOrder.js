import mongoose from 'mongoose';
import { getISOWeek, getWeekYear } from '../utils/week.js';

const PreOrderItemSchema = new mongoose.Schema({
  codigoArticulo: { 
    type: String, required: true, match: /^\d{6}$/,
    description: 'Código de artículo de 6 dígitos'
  },
  descripcionArticulo: { type: String, default: '' },
  undsCarro:   { type: Number, default: 0 },  // UCC — unidades por carro/karry
  undsTabla:   { type: Number, default: 0 },  // UTA — unidades por tabla
  undsCaja:    { type: Number, default: 0 },  // UCA — unidades por caja
  unidades:    { type: Number, default: 0, min: 0 },
  precio1:     { type: Number, default: 0 },  // PVP
  precio2:     { type: Number, default: 0 },  // T2
  precio3:     { type: Number, default: 0 },  // T3
}, { _id: false });

const PreOrderSchema = new mongoose.Schema({
  cliente: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  comerciales: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  estado: { 
    type: String, 
    enum: ['borrador', 'enviado', 'visto', 'servido'], 
    default: 'borrador' 
  },
  items: [PreOrderItemSchema],
  notas: { type: String, default: '' },
  semana: { type: Number },
  anio: { type: Number },
}, { timestamps: true });

// Pre-save: compute semana/anio from createdAt
PreOrderSchema.pre('save', function(next) {
  if (!this.semana || !this.anio) {
    const now = this.createdAt || new Date();
    this.semana = getISOWeek(now);
    this.anio = getWeekYear(now);
  }
  next();
});

// Indexes for fast role-filtered queries
PreOrderSchema.index({ cliente: 1, estado: 1 });
PreOrderSchema.index({ comerciales: 1, estado: 1 });
PreOrderSchema.index({ estado: 1, createdAt: -1 });
PreOrderSchema.index({ updatedAt: 1 });

export const PreOrder = mongoose.model('PreOrder', PreOrderSchema);
