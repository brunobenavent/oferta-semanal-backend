import express from 'express';
import { PreOrder } from '../models/PreOrder.js';
import { User } from '../models/User.js';
import { authenticate, authorize, tryAuthenticate } from '../middleware/auth.js';
import { getISOWeek, getWeekYear } from '../utils/week.js';
import * as emailService from '../services/email.js';

const router = express.Router();

// ── Helpers ──

/** Allowed estado transitions — from → [to, ...] */
const TRANSITIONS = {
  borrador:   ['pendiente'],
  pendiente:  ['revisado', 'rechazado', 'borrador'],
  revisado:   ['confirmado', 'rechazado', 'pendiente'],
  confirmado: ['enviado', 'rechazado'],
  enviado:    [],
  rechazado:  ['borrador'],
};

/**
 * Middleware: ensures req.user can access this preorder.
 * Sets req.preorder on success.
 * Client → only own preorders
 * Commercial → only if in comerciales[]
 * Admin → any
 * Employee → denied (403)
 */
async function loadPreorder(req, res, next) {
  try {
    const preorder = await PreOrder.findById(req.params.id)
      .populate('comerciales', 'nombre email role');
    if (!preorder) {
      return res.status(404).json({ message: 'Prepedido no encontrado' });
    }

    const roles = req.user.roles || [];
    const userId = req.user.userId;

    if (roles.includes('superadmin') || roles.includes('admin')) {
      req.preorder = preorder;
      return next();
    }

    if (roles.includes('employee')) {
      return res.status(403).json({ message: 'No tienes permisos para ver prepedidos' });
    }

    if (roles.includes('client')) {
      if (preorder.cliente.toString() !== userId) {
        return res.status(403).json({ message: 'No tienes permisos para acceder a este prepedido' });
      }
      req.preorder = preorder;
      return next();
    }

    if (roles.includes('commercial')) {
      const isAssigned = preorder.comerciales.some(
        c => c.toString() === userId
      );
      if (!isAssigned) {
        return res.status(403).json({ message: 'No tienes permisos para acceder a este prepedido' });
      }
      req.preorder = preorder;
      return next();
    }

    return res.status(403).json({ message: 'No tienes permisos para acceder a este prepedido' });
  } catch (error) {
    next(error);
  }
}

// ── POST / — Create borrador ──
router.post('/', authenticate, async (req, res, next) => {
  try {
    const roles = req.user.roles || [];
    if (!roles.includes('client')) {
      return res.status(403).json({ message: 'Solo los clientes pueden crear prepedidos' });
    }

    // Inherit assigned commercials from user
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    const preorder = await PreOrder.create({
      cliente: req.user.userId,
      comerciales: user.assignedCommercials || [],
      items: [],
      estado: 'borrador',
    });

    res.status(201).json(preorder);
  } catch (error) {
    next(error);
  }
});

// ── GET / — List preorders (role-filtered) ──
router.get('/', authenticate, async (req, res, next) => {
  try {
    const roles = req.user.roles || [];
    const userId = req.user.userId;
    const { estado, search, page = 1, limit = 50 } = req.query;

    if (roles.includes('employee')) {
      return res.status(403).json({ message: 'No tienes permisos para ver prepedidos' });
    }

    const query = {};

    // Role-based filtering
    if (roles.includes('client')) {
      query.cliente = userId;
    } else if (roles.includes('commercial')) {
      query.comerciales = userId;
    }
    // admin/superadmin: no filter — sees all

    if (estado) query.estado = estado;
    if (search) {
      // Support search by client name or article code
      const users = await User.find({ 
        nombre: { $regex: search, $options: 'i' } 
      }).select('_id').lean();
      const userIds = users.map(u => u._id.toString());
      query.$or = [
        { cliente: { $in: userIds } },
        { 'items.codigoArticulo': { $regex: `^${search}`, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await PreOrder.countDocuments(query);
    const preorders = await PreOrder.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('cliente', 'nombre email clientName')
      .populate('comerciales', 'nombre email')
      .lean();

    res.json({
      preorders,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
});

// ── GET /:id — Detail ──
router.get('/:id', authenticate, loadPreorder, async (req, res, next) => {
  try {
    const preorder = await PreOrder.findById(req.params.id)
      .populate('cliente', 'nombre email clientName')
      .populate('comerciales', 'nombre email')
      .lean();

    res.json(preorder);
  } catch (error) {
    next(error);
  }
});

// ── PATCH /:id/items — Update items ──
// - Client: only when borrador
// - Commercial: when enviado or visto
// - Admin: always
router.patch('/:id/items', authenticate, loadPreorder, async (req, res, next) => {
  try {
    const roles = req.user.roles || [];
    const userId = req.user.userId;
    const isOwner = req.preorder.cliente.toString() === userId;
    const isAssignedCommercial = req.preorder.comerciales.some(c => c.toString() === userId);
    const isAdmin = roles.includes('superadmin') || roles.includes('admin');

    // Permission check based on estado
    if (req.preorder.estado === 'borrador') {
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ message: 'No tienes permisos para modificar este prepedido' });
      }
    } else if (req.preorder.estado === 'enviado' || req.preorder.estado === 'visto') {
      if (!isAssignedCommercial && !isAdmin) {
        return res.status(403).json({ message: 'Solo el comercial asignado puede modificar este prepedido' });
      }
    } else {
      return res.status(400).json({ message: 'No se puede modificar un prepedido en estado ' + req.preorder.estado });
    }

    // Staleness check
    if (req.body.updatedAt && new Date(req.body.updatedAt).getTime() !== req.preorder.updatedAt.getTime()) {
      return res.status(409).json({ 
        message: 'El prepedido fue modificado por otro usuario. Recarga los datos.',
        serverUpdatedAt: req.preorder.updatedAt,
      });
    }

    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ message: 'items debe ser un array' });
    }

    // Validate each item
    for (const item of items) {
      if (!/^\d{6}$/.test(item.codigoArticulo)) {
        return res.status(400).json({ 
          message: `Código de artículo inválido: ${item.codigoArticulo}` 
        });
      }
      if (typeof item.unidades !== 'number' || item.unidades < 0) {
        return res.status(400).json({ 
          message: `unidades debe ser un número >= 0 para ${item.codigoArticulo}` 
        });
      }
    }

    req.preorder.items = items;
    await req.preorder.save();

    const populated = await PreOrder.findById(req.preorder._id)
      .populate('cliente', 'nombre email clientName')
      .lean();

    res.json(populated);
  } catch (error) {
    next(error);
  }
});

// ── PATCH /:id/estado — Change estado with transition guard ──
router.patch('/:id/estado', authenticate, loadPreorder, async (req, res, next) => {
  try {
    const { estado: nuevoEstado, comerciales } = req.body;
    if (!nuevoEstado) {
      return res.status(400).json({ message: 'El campo estado es requerido' });
    }

    const roles = req.user.roles || [];
    const userId = req.user.userId;
    const currentEstado = req.preorder.estado;
    const isOwner = req.preorder.cliente.toString() === userId;
    const isAssignedCommercial = req.preorder.comerciales.some(c => (c._id || c).toString() === userId);
    const isAdmin = roles.includes('superadmin') || roles.includes('admin');

    // Transition matrix
    const allowed = TRANSITIONS[currentEstado] || [];
    const canTransition = allowed.includes(nuevoEstado);

    // Admin bypass — any transition is allowed
    if (!isAdmin && !canTransition) {
      return res.status(400).json({ 
        message: `No se puede cambiar de ${currentEstado} a ${nuevoEstado}`,
        allowedTransitions: allowed,
      });
    }

    // Role-based transition guards
    if (nuevoEstado === 'pendiente') {
      if (currentEstado === 'borrador') {
        if (!isOwner && !isAdmin) {
          return res.status(403).json({ message: 'Solo el cliente puede enviar el prepedido' });
        }
        if (req.preorder.items.length === 0) {
          return res.status(400).json({ message: 'No se puede enviar un prepedido vacío' });
        }
      }
    }

    if (nuevoEstado === 'revisado') {
      if (!isAssignedCommercial && !isAdmin) {
        return res.status(403).json({ message: 'Solo el comercial asignado puede revisar el prepedido' });
      }
    }

    if (nuevoEstado === 'rechazado') {
      if (currentEstado === 'pendiente') {
        if (!isAssignedCommercial && !isAdmin) {
          return res.status(403).json({ message: 'Solo el comercial asignado puede rechazar el prepedido' });
        }
      } else if (currentEstado === 'revisado' || currentEstado === 'confirmado') {
        if (!isAdmin) {
          return res.status(403).json({ message: 'Solo un administrador puede rechazar el prepedido' });
        }
      }
    }

    if (nuevoEstado === 'confirmado') {
      if (!isAdmin) {
        return res.status(403).json({ message: 'Solo un administrador puede confirmar el prepedido' });
      }
    }

    if (nuevoEstado === 'enviado') {
      if (!isAdmin && !isAssignedCommercial) {
        return res.status(403).json({ message: 'Solo el comercial asignado o un administrador puede marcar como enviado' });
      }
    }

    if (nuevoEstado === 'borrador') {
      if (currentEstado === 'pendiente') {
        if (!isOwner && !isAdmin) {
          return res.status(403).json({ message: 'Solo el cliente puede retornar el prepedido a borrador' });
        }
      } else if (currentEstado === 'rechazado') {
        if (!isOwner && !isAdmin) {
          return res.status(403).json({ message: 'Solo el cliente puede reabrir el prepedido rechazado' });
        }
      }
    }

    if (nuevoEstado === 'pendiente' && currentEstado === 'revisado') {
      if (!isAdmin) {
        return res.status(403).json({ message: 'Solo un administrador puede devolver el prepedido al comercial' });
      }
    }

    // Push to historial
    const byRole = roles.includes('admin') || roles.includes('superadmin') ? 'admin'
      : roles.includes('commercial') ? 'commercial'
      : 'client';

    req.preorder.historial.push({
      estadoAnterior: currentEstado,
      estado: nuevoEstado,
      by: req.user.userId,
      byRole,
      observaciones: req.body.observaciones || '',
      at: new Date(),
    });

    // First time borrador → pendiente: set sentAt/sentBy
    if (currentEstado === 'borrador' && nuevoEstado === 'pendiente' && !req.preorder.sentAt) {
      req.preorder.sentAt = new Date();
      req.preorder.sentBy = req.user.userId;
    }

    req.preorder.estado = nuevoEstado;

    if (comerciales && Array.isArray(comerciales) && comerciales.length > 0) {
      req.preorder.comerciales = comerciales;
    }

    await req.preorder.save();

    const populated = await PreOrder.findById(req.preorder._id)
      .populate('cliente', 'nombre email clientName')
      .populate('comerciales', 'nombre email role')
      .lean();

    // Email notification on borrador → pendiente
    if (currentEstado === 'borrador' && nuevoEstado === 'pendiente') {
      try {
        await emailService.sendPreorderNotification(populated);
      } catch (emailErr) {
        console.error('Error enviando notificación de prepedido:', emailErr);
      }
    }

    res.json(populated);
  } catch (error) {
    next(error);
  }
});

// ── DELETE /:id — Delete (only borrador, owner or admin) ──
router.delete('/:id', authenticate, loadPreorder, async (req, res, next) => {
  try {
    const roles = req.user.roles || [];
    const isOwner = req.preorder.cliente.toString() === req.user.userId;
    const isAdmin = roles.includes('superadmin') || roles.includes('admin');

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'No tienes permisos para eliminar este prepedido' });
    }

    if (req.preorder.estado !== 'borrador' && !isAdmin) {
      return res.status(400).json({ message: 'Solo se puede eliminar un prepedido en estado borrador' });
    }

    await PreOrder.findByIdAndDelete(req.params.id);
    res.json({ message: 'Prepedido eliminado' });
  } catch (error) {
    next(error);
  }
});

export default router;
