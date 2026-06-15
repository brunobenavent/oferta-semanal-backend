import { existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import bcrypt from 'bcryptjs';
import { authenticate, authorize, tryAuthenticate } from '../middleware/auth.js';
import { User } from '../models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

const UPLOADS_DIR = resolve(__dirname, '../../uploads/commercials');

// Ensure uploads directory exists
if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ─── Helper: map User doc to commercial response ────────────────────

function toCommercialJSON(user) {
  return {
    _id: user._id,
    name: user.nombre,
    position: user.position || '',
    email: user.email,
    phone: user.phone || '',
    photo: user.photo || '',
    languages: user.languages || [],
    order: user.displayOrder || 0,
    active: user.isActive !== false,
  };
}

// ─── Multer config ─────────────────────────────────────────────────

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes JPEG, PNG o WebP'));
    }
  }
});

// ─── Routes ────────────────────────────────────────────────────────

// GET /api/commercials — list active commercials (role=commercial, isActive=true), sorted by displayOrder
router.get('/', tryAuthenticate, async (req, res, next) => {
  try {
    const users = await User.find({ role: 'commercial', isActive: true })
      .sort({ displayOrder: 1 })
      .lean();
    res.json({ commercials: users.map(toCommercialJSON) });
  } catch (error) {
    next(error);
  }
});

// POST /api/commercials — create new commercial user
router.post('/', authenticate, authorize('superadmin', 'admin'), async (req, res, next) => {
  try {
    const { name, position, email, phone, photo, languages, order, active } = req.body;

    if (!name || !email || !phone) {
      return res.status(400).json({ message: 'name, email y phone son requeridos' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: 'Ya existe un usuario con ese email' });
    }

    const user = await User.create({
      email: email.toLowerCase(),
      nombre: name,
      password: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
      role: 'commercial',
      phone,
      position: position || '',
      photo: photo || '',
      languages: languages || [],
      displayOrder: order ?? 0,
      isActive: active ?? true,
      isVerified: true,
    });

    res.status(201).json({ commercial: toCommercialJSON(user) });
  } catch (error) {
    next(error);
  }
});

// PUT /api/commercials/:id — update commercial user
router.put('/:id', authenticate, authorize('superadmin', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = {};

    if (req.body.name !== undefined) updateData.nombre = req.body.name;
    if (req.body.position !== undefined) updateData.position = req.body.position;
    if (req.body.email !== undefined) updateData.email = req.body.email.toLowerCase();
    if (req.body.phone !== undefined) updateData.phone = req.body.phone;
    if (req.body.photo !== undefined) updateData.photo = req.body.photo;
    if (req.body.languages !== undefined) updateData.languages = req.body.languages;
    if (req.body.order !== undefined) updateData.displayOrder = req.body.order;
    if (req.body.active !== undefined) updateData.isActive = req.body.active;

    const user = await User.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });

    if (!user) {
      return res.status(404).json({ message: 'Comercial no encontrado' });
    }

    res.json({ commercial: toCommercialJSON(user) });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/commercials/:id — soft delete (isActive: false)
router.delete('/:id', authenticate, authorize('superadmin', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findByIdAndUpdate(id, { isActive: false }, { new: true });

    if (!user) {
      return res.status(404).json({ message: 'Comercial no encontrado' });
    }

    res.json({ commercial: toCommercialJSON(user) });
  } catch (error) {
    next(error);
  }
});

// POST /api/commercials/:id/photo — upload photo with resize
router.post('/:id/photo', authenticate, authorize('superadmin', 'admin'), (req, res, next) => {
  upload.single('photo')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Debes seleccionar una foto' });
    }

    try {
      const { id } = req.params;

      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ message: 'Comercial no encontrado' });
      }

      const filename = `${id}-${Date.now()}.jpg`;
      const filepath = resolve(UPLOADS_DIR, filename);

      await sharp(req.file.buffer)
        .resize(400, 400, { fit: 'cover', position: 'centre' })
        .jpeg({ quality: 80 })
        .toFile(filepath);

      const photoUrl = `/uploads/commercials/${filename}`;

      await User.findByIdAndUpdate(id, { photo: photoUrl });

      res.json({ photo: photoUrl });
    } catch (error) {
      next(error);
    }
  });
});

export default router;
