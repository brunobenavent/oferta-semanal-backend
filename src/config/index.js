import 'dotenv/config';

export default {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  mongodbUri: process.env.MONGODB_URI,

  dantia: {
    baseURL: process.env.THIRD_PARTY_API_URL,
    username: process.env.THIRD_PARTY_USERNAME,
    password: process.env.THIRD_PARTY_PASSWORD,
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },

  ftp: {
    host: process.env.FTP_HOST,
    port: parseInt(process.env.FTP_PORT) || 21,
    user: process.env.FTP_USER,
    password: process.env.FTP_PASSWORD,
    path: process.env.FTP_PATH || '/',
  },

  sync: {
    offerInterval: parseInt(process.env.SYNC_OFFER_INTERVAL) || 600000,
    imageInterval: parseInt(process.env.SYNC_IMAGE_INTERVAL) || 30000,
  },

  jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  allowedEmailDomain: 'viverosguzman.es',
  allowedEmails: process.env.ALLOWED_EMAILS ? process.env.ALLOWED_EMAILS.split(',') : [],
  email: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    from: process.env.EMAIL_FROM || 'Oferta Semanal <noreply@viverosguzman.es>',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  },
};
