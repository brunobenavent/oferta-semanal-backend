import jwt from 'jsonwebtoken';
import config from '../config/index.js';

export function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token de acceso requerido' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwtSecret);

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      roles: decoded.roles || (decoded.role ? [decoded.role] : []),
      priceTier: decoded.priceTier,
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expirado' });
    }
    return res.status(401).json({ message: 'Token inválido' });
  }
}

export function authorize(...allowedRoles) {
  return (req, res, next) => {
    const userRoles = req.user?.roles || [];
    if (!req.user || !userRoles.some(r => allowedRoles.includes(r))) {
      return res.status(403).json({ message: 'No tienes permisos para acceder a este recurso' });
    }
    next();
  };
}

export function tryAuthenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwtSecret);

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      roles: decoded.roles || (decoded.role ? [decoded.role] : []),
      priceTier: decoded.priceTier,
    };
  } catch {
    // Token inválido o expirado — continuamos sin usuario
  }

  next();
}
