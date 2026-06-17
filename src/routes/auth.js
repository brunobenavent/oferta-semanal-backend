import { existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import multer from 'multer';
import sharp from 'sharp';
import config from '../config/index.js';
import { User } from '../models/User.js';
import { authenticate, authorize } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendInviteEmail,
} from '../services/email.js';

const router = express.Router();

// ─── Public routes ───────────────────────────────────────────────

// POST /register
router.post('/register', async (req, res, next) => {
  try {
    const { nombre, email, password } = req.body;

    if (!nombre || !email || !password) {
      return res.status(400).json({ message: 'Todos los campos son requeridos' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
    }

    // Domain check: only @viverosguzman.es or allowed emails
    const emailDomain = email.split('@')[1]?.toLowerCase();
    const isAllowedDomain = emailDomain === config.allowedEmailDomain;
    const isAllowedEmail = config.allowedEmails.includes(email);

    if (!isAllowedDomain && !isAllowedEmail) {
      return res.status(400).json({ message: `Solo se permiten correos @${config.allowedEmailDomain}` });
    }

    // Check duplicate
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: 'El correo ya está registrado' });
    }

    const user = new User({
      nombre,
      email: email.toLowerCase(),
      password,
      roles: ['employee'],
      isVerified: false,
    });

    const verificationToken = user.generateVerificationToken();
    await user.save();

    // Non-blocking email send
    sendVerificationEmail(user.email, user.nombre, verificationToken);

    res.status(201).json({
      message: 'Revisa tu correo para verificar tu cuenta',
    });
  } catch (error) {
    next(error);
  }
});

// POST /verify-me — authenticated user verifies their own email directly
router.post('/verify-me', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    if (user.isVerified) {
      return res.json({ message: 'El email ya está verificado' });
    }

    user.isVerified = true;
    user.verificationToken = null;
    user.verificationExpires = null;
    await user.save();

    res.json({ message: 'Email verificado correctamente' });
  } catch (error) {
    next(error);
  }
});

// GET /verify/:token
router.get('/verify/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    const { email } = req.query;
    const user = await User.findOne({
      verificationToken: token,
    }).select('+verificationToken +verificationExpires');

    if (!user) {
      // Token not found — could be already consumed (StrictMode double-mount)
      // Check if user with that email is already verified
      if (email) {
        const alreadyVerified = await User.findOne({
          email: email.toLowerCase(),
          isVerified: true,
        });
        if (alreadyVerified) {
          return res.json({ message: 'El correo ya está verificado', alreadyVerified: true });
        }
      }
      return res.status(400).json({ message: 'Token de verificación inválido' });
    }

    if (user.isVerified) {
      return res.json({ message: 'El correo ya está verificado', alreadyVerified: true });
    }

    if (user.verificationExpires && user.verificationExpires < new Date()) {
      return res.status(400).json({ message: 'El token de verificación ha expirado' });
    }

    user.isVerified = true;
    user.verificationToken = null;
    user.verificationExpires = null;
    await user.save();

    res.json({ message: 'Correo verificado correctamente' });
  } catch (error) {
    next(error);
  }
});

// POST /login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email y contraseña son requeridos' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Cuenta inactiva. Contacta al administrador.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    if (!user.isVerified) {
      return res.status(403).json({ message: 'Debes verificar tu correo antes de iniciar sesión' });
    }

    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        roles: user.roles,
        role: user.roles?.[0] || null, // backward compat
        priceTier: user.priceTier,
      },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    res.json({
      user: {
        id: user._id,
        email: user.email,
        nombre: user.nombre,
        roles: user.roles,
        priceTier: user.priceTier,
        clientName: user.clientName,
        isVerified: user.isVerified,
        isActive: user.isActive,
        photo: user.photo || null,
      },
      token,
    });
  } catch (error) {
    next(error);
  }
});

// POST /change-password — authenticated user changes their own password
router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Debes ingresar tu contraseña actual y la nueva' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    const user = await User.findById(req.user.userId).select('+password');
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(403).json({ message: 'La contraseña actual es incorrecta' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    next(error);
  }
});

// POST /forgot-password
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email: email?.toLowerCase() });

    if (user) {
      const resetToken = user.generateResetToken();
      await user.save();
      sendPasswordResetEmail(user.email, user.nombre, resetToken);
    }

    // Always return same message to prevent email enumeration
    res.json({
      message: 'Si el correo existe, recibirás un enlace para restablecer tu contraseña',
    });
  } catch (error) {
    next(error);
  }
});

// POST /reset-password/:token
router.post('/reset-password/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const user = await User.findOne({
      resetToken: token,
    }).select('+resetToken +resetExpires');

    if (!user) {
      return res.status(400).json({ message: 'Token de restablecimiento inválido' });
    }

    if (user.resetExpires && user.resetExpires < new Date()) {
      return res.status(400).json({ message: 'El token de restablecimiento ha expirado' });
    }

    user.password = password;
    user.resetToken = null;
    user.resetExpires = null;
    await user.save();

    res.json({ message: 'Contraseña restablecida correctamente' });
  } catch (error) {
    next(error);
  }
});

// ─── Protected routes ────────────────────────────────────────────

// GET /me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    res.json({
      user: {
        id: user._id,
        email: user.email,
        nombre: user.nombre,
        roles: user.roles,
        priceTier: user.priceTier,
        clientName: user.clientName,
        isVerified: user.isVerified,
        isActive: user.isActive,
        photo: user.photo || null,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ─── Admin routes ────────────────────────────────────────────────

// GET /users
router.get('/users', authenticate, authorize('superadmin', 'admin'), async (req, res, next) => {
  try {
    const { search } = req.query;
    let query = {};

    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { nombre: { $regex: search, $options: 'i' } },
      ];
    }

    const users = await User.find(query).sort({ createdAt: -1 });
    res.json({ users });
  } catch (error) {
    next(error);
  }
});

// POST /users
router.post('/users', authenticate, authorize('superadmin', 'admin'), async (req, res, next) => {
  try {
    const { email, nombre, role: bodyRole, roles, priceTier, clientName, phone, position, languages, cif, taxAddress, authorizedName, authorizedPosition, authorizedEmail } = req.body;

    if (!email || !nombre) {
      return res.status(400).json({ message: 'Email y nombre son requeridos' });
    }

    // roles: accept array from frontend, or derive from single role for backward compat
    const finalRoles = roles || (bodyRole ? [bodyRole] : ['client']);

    if (finalRoles.includes('superadmin')) {
      return res.status(403).json({ message: 'No puedes crear otro superadmin' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: 'El correo ya está registrado' });
    }

    // Generate a temporary password
    const tempPassword = crypto.randomBytes(16).toString('hex');

    const user = new User({
      email: email.toLowerCase(),
      nombre,
      password: tempPassword,
      roles: finalRoles,
      priceTier: priceTier || 2,
      clientName: clientName || null,
      phone: phone || '',
      position: position || '',
      languages: languages || [],
      cif: cif || '',
      taxAddress: taxAddress || '',
      authorizedName: authorizedName || '',
      authorizedPosition: authorizedPosition || '',
      authorizedEmail: authorizedEmail || '',
      isVerified: finalRoles.includes('commercial'), // commercials start verified
      createdBy: req.user.userId,
    });

    const verificationToken = user.generateVerificationToken();
    await user.save();

    // Send invite email
    sendInviteEmail(user.email, user.nombre, verificationToken);

    res.status(201).json({
      user: {
        id: user._id,
        email: user.email,
        nombre: user.nombre,
        roles: user.roles,
        priceTier: user.priceTier,
        clientName: user.clientName,
        isVerified: user.isVerified,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    next(error);
  }
});

// PUT /users/:id
router.put('/users/:id', authenticate, authorize('superadmin', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role: bodyRole, roles, priceTier, clientName, isActive, nombre, phone, position, languages, photo, cif, taxAddress, authorizedName, authorizedPosition, authorizedEmail } = req.body;

    // Load the current user first
    const currentUser = await User.findById(id);
    if (!currentUser) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // Don't allow editing the superadmin
    if (currentUser.roles.includes('superadmin')) {
      return res.status(403).json({ message: 'No puedes modificar al superadmin' });
    }

    // Don't allow changing anyone to superadmin
    const finalRoles = roles || (bodyRole ? [bodyRole] : undefined);
    if (finalRoles && finalRoles.includes('superadmin')) {
      return res.status(403).json({ message: 'No puedes asignar el rol de superadmin' });
    }

    const updateData = {};
    if (finalRoles !== undefined) updateData.roles = finalRoles;
    if (priceTier !== undefined) updateData.priceTier = priceTier;
    if (clientName !== undefined) updateData.clientName = clientName;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (nombre !== undefined) updateData.nombre = nombre;
    if (phone !== undefined) updateData.phone = phone;
    if (position !== undefined) updateData.position = position;
    if (languages !== undefined) updateData.languages = languages;
    if (photo !== undefined) updateData.photo = photo;
    if (cif !== undefined) updateData.cif = cif;
    if (taxAddress !== undefined) updateData.taxAddress = taxAddress;
    if (authorizedName !== undefined) updateData.authorizedName = authorizedName;
    if (authorizedPosition !== undefined) updateData.authorizedPosition = authorizedPosition;
    if (authorizedEmail !== undefined) updateData.authorizedEmail = authorizedEmail;

    const user = await User.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });

    res.json({
      user: {
        id: user._id,
        email: user.email,
        nombre: user.nombre,
        roles: user.roles,
        priceTier: user.priceTier,
        clientName: user.clientName,
        isActive: user.isActive,
        isVerified: user.isVerified,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /users/:id/resend-verification
router.post('/users/:id/resend-verification', authenticate, authorize('superadmin', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: 'El usuario ya está verificado' });
    }

    const verificationToken = user.generateVerificationToken();
    await user.save();

    sendVerificationEmail(user.email, user.nombre, verificationToken);

    res.json({ message: 'Correo de verificación reenviado' });
  } catch (error) {
    next(error);
  }
});

// POST /users/:id/verify — admin directly verifies a user's email
router.post('/users/:id/verify', authenticate, authorize('superadmin', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    if (user.isVerified) {
      return res.json({ message: 'El usuario ya está verificado' });
    }

    user.isVerified = true;
    user.verificationToken = null;
    user.verificationExpires = null;
    await user.save();

    res.json({ message: 'Usuario verificado correctamente' });
  } catch (error) {
    next(error);
  }
});

// DELETE /users/:id (hard delete with password confirmation)
router.delete('/users/:id', authenticate, authorize('superadmin', 'admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ message: 'Debes ingresar tu contraseña para eliminar un usuario' });
    }

    // Don't allow deleting yourself
    if (id === req.user.userId.toString()) {
      return res.status(400).json({ message: 'No puedes eliminar tu propia cuenta' });
    }

    // Don't allow deleting the superadmin
    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    if (targetUser.roles.includes('superadmin')) {
      return res.status(403).json({ message: 'No puedes eliminar al superadmin' });
    }

    // Verify admin's password
    const admin = await User.findById(req.user.userId).select('+password');
    if (!admin) {
      return res.status(404).json({ message: 'Administrador no encontrado' });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(403).json({ message: 'Contraseña incorrecta' });
    }

    const user = await User.findByIdAndDelete(id);

    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    res.json({ message: 'Usuario eliminado permanentemente' });
  } catch (error) {
    next(error);
  }
});

// ─── Photo upload dir ──────────────────────────────────────────────
const UPLOADS_DIR = resolve(__dirname, '../../uploads/commercials');
if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes JPEG, PNG o WebP'));
    }
  }
});

// ─── Shared photo processing ────────────────────────────────────

async function processAndSavePhoto(userId, buffer) {
  const filename = `${userId}-${Date.now()}.jpg`;
  const filepath = resolve(UPLOADS_DIR, filename);

  await sharp(buffer)
    .resize(400, 400, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 80 })
    .toFile(filepath);

  const photoUrl = `/uploads/commercials/${filename}`;
  await User.findByIdAndUpdate(userId, { photo: photoUrl });
  return photoUrl;
}

// POST /me/photo — upload own profile photo (any authenticated user)
router.post('/me/photo', authenticate, (req, res, next) => {
  photoUpload.single('photo')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Debes seleccionar una foto' });
    }

    try {
      const photoUrl = await processAndSavePhoto(req.user.userId, req.file.buffer);
      res.json({ photo: photoUrl });
    } catch (error) {
      next(error);
    }
  });
});

// POST /users/:id/photo — upload photo for ANY user role (admin only)
router.post('/users/:id/photo', authenticate, authorize('superadmin', 'admin'), (req, res, next) => {
  photoUpload.single('photo')(req, res, async (err) => {
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
        return res.status(404).json({ message: 'Usuario no encontrado' });
      }

      const photoUrl = await processAndSavePhoto(id, req.file.buffer);
      res.json({ photo: photoUrl });
    } catch (error) {
      next(error);
    }
  });
});

export default router;
