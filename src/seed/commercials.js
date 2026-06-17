import { existsSync, mkdirSync } from 'fs';
import { join, resolve, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const COMMERCIALS_SRC = resolve(process.env.HOME || process.env.USERPROFILE, 'Desktop/comerciales');
const COMMERCIALS_DEST = resolve(__dirname, '../../uploads/commercials');

// ─── Data ──────────────────────────────────────────────────────────

const COMMERCIAL_PASSWORD = process.env.COMMERCIAL_PASSWORD || 'comercial123';

const commercials = [
  { order: 1,  name: 'Benny Hansen',         position: 'Production manager',                            email: 'benny@viverosguzman.es',         phone: '+34 649 893 050', languages: [{code:'es',name:'Español'},{code:'dk',name:'Danés'},{code:'gb',name:'Inglés'},{code:'de',name:'Alemán'}] },
  { order: 2,  name: 'Antonio Santos',       position: 'Project manager',                                email: 'asantos@viverosguzman.es',       phone: '+34 670 228 117', languages: [{code:'es',name:'Español'}] },
  { order: 3,  name: 'Myriam Plan',          position: 'Administrative Assistant & Sales',               email: 'mplan@viverosguzman.es',         phone: '+34 678 588 940', languages: [{code:'es',name:'Español'},{code:'fr',name:'Francés'}] },
  { order: 4,  name: 'Ana Coll',             position: 'Sales',                                         email: 'acoll@viverosguzman.es',         phone: '+34 670 968 696', languages: [{code:'es',name:'Español'},{code:'pt',name:'Portugués'}] },
  { order: 5,  name: 'Yadira Gutiérrez',     position: 'Key Account & Sales',                           email: 'ygutierrez@viverosguzman.es',    phone: '+34 671 636 062', languages: [{code:'es',name:'Español'},{code:'gb',name:'Inglés'},{code:'it',name:'Italiano'}] },
  { order: 6,  name: 'Daniela Ruiz',         position: 'Sales',                                         email: 'druiz@viverosguzman.es',         phone: '+34 673 411 854', languages: [{code:'es',name:'Español'},{code:'gb',name:'Inglés'}] },
  { order: 7,  name: 'José Francisco Fernández', position: 'Export sales',                              email: 'jffernandez@viverosguzman.es',   phone: '+34 661 249 594', languages: [{code:'es',name:'Español'},{code:'gb',name:'Inglés'}] },
  { order: 8,  name: 'Tomas von Leipzig',    position: 'Export manager',                                email: 'tomas@viverosguzman.es',         phone: '+34 608 199 691', languages: [{code:'es',name:'Español'},{code:'gb',name:'Inglés'},{code:'de',name:'Alemán'}] },
  { order: 9,  name: 'Cenk Sela',            position: 'Export sales',                                  email: 'cenk@viverosguzman.es',          phone: '+34 600 565 217', languages: [{code:'es',name:'Español'},{code:'gb',name:'Inglés'},{code:'tr',name:'Turco'}] },
  { order: 10, name: 'Isabel Solano',        position: 'Export sales',                                  email: 'isolano@viverosguzman.es',       phone: '+34 672 749 315', languages: [{code:'es',name:'Español'},{code:'pt',name:'Portugués'},{code:'gb',name:'Inglés'}] },
  { order: 11, name: 'Antonio Guzmán',       position: 'Cash and Carry Supervisor',                     email: 'aguzman@viverosguzman.es',       phone: '+34 663 023 780', languages: [{code:'es',name:'Español'}] },
  { order: 12, name: 'Elisabeth Vergara',    position: 'Sales',                                         email: 'evergara@viverosguzman.es',      phone: '+34 661 249 588', languages: [{code:'es',name:'Español'}] },
  { order: 13, name: 'Juan Antonio Pérez',   position: 'Administration manager',                        email: 'juan@viverosguzman.es',          phone: '+34 607 423 715', languages: [{code:'es',name:'Español'},{code:'pt',name:'Portugués'}] },
  { order: 14, name: 'Isabel Méndez',        position: 'Export administration',                         email: 'imendez@viverosguzman.es',       phone: '+34 674 273 922', languages: [{code:'es',name:'Español'}] },
];

const PHOTO_MAP = {
  'Benny Hansen':           'benny_hansen.png',
  'Antonio Santos':         'antonio santos.JPG',
  'Myriam Plan':            'miriam.jpg',
  'Ana Coll':               'ana coll',
  'Yadira Gutiérrez':       'yadira.JPG',
  'Daniela Ruiz':           'daniela.jpg',
  'José Francisco Fernández': 'francis_fernandez.png',
  'Tomas von Leipzig':      'tomas.png',
  'Cenk Sela':              'cenk.JPG',
  'Isabel Solano':          'isabel_solano.png',
  'Antonio Guzmán':         'antonio guzman.jpeg',
  'Elisabeth Vergara':      'elisabeth.jpg',
  'Juan Antonio Pérez':     'juan antonio perez.jpg',
  'Isabel Méndez':          'isabel Mendez',
};

// ─── Helpers ───────────────────────────────────────────────────────

async function findSourceFile(filename) {
  const filepath = join(COMMERCIALS_SRC, filename);
  if (existsSync(filepath)) return filepath;
  if (!extname(filename)) {
    for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
      const candidate = filepath + ext;
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

async function processPhoto(sourcePath) {
  if (!existsSync(COMMERCIALS_DEST)) {
    mkdirSync(COMMERCIALS_DEST, { recursive: true });
  }
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const destPath = join(COMMERCIALS_DEST, filename);
    await sharp(sourcePath)
      .resize(400, 400, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 80 })
      .toFile(destPath);
  return `/uploads/commercials/${filename}`;
}

// ─── Main seed function ────────────────────────────────────────────

export async function seedCommercials() {
  const isProduction = process.env.NODE_ENV === 'production';
  const srcExists = existsSync(COMMERCIALS_SRC);

  if (!isProduction) console.log('[Seed] Seeding commercials...');
  if (!isProduction && !srcExists) {
    console.log(`[Seed] Source photos directory not found: ${COMMERCIALS_SRC}`);
  }

  for (const data of commercials) {
    let photoUrl = '';

    // Upsert user by email
    const existing = await User.findOne({ email: data.email });

    // Skip photo processing if user already has one
    if (!existing || !existing.photo) {
      const sourceFilename = PHOTO_MAP[data.name];
      if (sourceFilename && srcExists) {
        const sourcePath = await findSourceFile(sourceFilename);
        if (sourcePath) {
          try { photoUrl = await processPhoto(sourcePath); }
          catch (err) {
            if (!isProduction) console.warn(`[Seed] ⚠ Could not process photo for ${data.name}: ${err.message}`);
          }
        }
        if (!photoUrl && !isProduction) {
          console.log(`[Seed]   ${data.name}: no photo found (looked for "${sourceFilename}")`);
        }
      }
    }
    if (existing) {
      const updates = {
        nombre: data.name,
        roles: ['commercial'],
        phone: data.phone,
        position: data.position,
        languages: data.languages,
        displayOrder: data.order,
        isActive: true,
        isVerified: true,
      };
      // Only update photo if the existing one is empty or missing
      if (photoUrl && !existing.photo) updates.photo = photoUrl;
      await User.findByIdAndUpdate(existing._id, { $set: updates });
      if (!isProduction) {
        const hasPhoto = photoUrl ? '📷' : '  ';
        console.log(`[Seed]   ${hasPhoto} ${data.name.padEnd(28)} updated`);
      }
    } else {
      await User.create({
        email: data.email,
        nombre: data.name,
        password: COMMERCIAL_PASSWORD,
        roles: ['commercial'],
        phone: data.phone,
        position: data.position,
        photo: photoUrl,
        languages: data.languages,
        displayOrder: data.order,
        isActive: true,
        isVerified: true,
      });
      if (!isProduction) {
        const hasPhoto = photoUrl ? '📷' : '  ';
        console.log(`[Seed]   ${hasPhoto} ${data.name.padEnd(28)} created`);
      }
    }
  }

  console.log(`[Seed] ✓ ${commercials.length} commercials seeded`);
}
