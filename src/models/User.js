import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  password: { type: String, required: true, select: false },
  nombre: { type: String, required: true },
  roles: { type: [String], enum: ['superadmin', 'admin', 'employee', 'client', 'commercial'], default: ['client'] },
  role: { type: String }, // deprecated — kept for migration, use roles instead
  priceTier: { type: Number, enum: [2, 3], default: 2 },  // only for clients
  clientName: { type: String, default: null },  // empresa for clients
  cif: { type: String, default: '' },
  taxAddress: { type: String, default: '' },
  authorizedName: { type: String, default: '' },
  authorizedPosition: { type: String, default: '' },
  authorizedEmail: { type: String, default: '' },
  // Commercial-specific fields (optional for other roles)
  phone: { type: String, default: '' },
  position: { type: String, default: '' },
  photo: { type: String, default: '' },
  languages: [{ code: String, name: String }],
  displayOrder: { type: Number, default: 0 },
  isVerified: { type: Boolean, default: false, index: true },
  isActive: { type: Boolean, default: true, index: true },
  verificationToken: { type: String, default: null, select: false },
  verificationExpires: { type: Date, default: null, index: { expireAfterSeconds: 0 } },
  resetToken: { type: String, default: null, select: false },
  resetExpires: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  assignedCommercials: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

// Hash password on save
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function(candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Generate verification token
userSchema.methods.generateVerificationToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  this.verificationToken = token;
  this.verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
  return token;
};

// Generate reset token
userSchema.methods.generateResetToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  this.resetToken = token;
  this.resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1h
  return token;
};

export const User = mongoose.model('User', userSchema);
