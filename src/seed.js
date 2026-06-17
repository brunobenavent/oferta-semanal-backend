import { Offer } from './models/Offer.js';
import { User } from './models/User.js';
import { seedCommercials } from './seed/commercials.js';

export async function seedIfEmpty() {
  const count = await Offer.countDocuments();
  if (count === 0) {
    console.log('[Seed] Database empty — waiting for Dantia sync to populate offers');
  } else {
    console.log(`[Seed] Database already has ${count} offers`);
  }

  // Ensure superadmins exist (comma-separated list)
  const superadminEmails = (process.env.SUPERADMIN_EMAILS || 'admin@viverosguzman.es').split(',');
  for (const email of superadminEmails) {
    const trimmed = email.trim();
    const existing = await User.findOne({ email: trimmed });
    if (existing) {
      if (!existing.roles?.includes('superadmin')) {
        existing.roles = ['superadmin'];
        existing.isVerified = true;
        await existing.save();
        console.log(`[Seed] User ${trimmed} promoted to superadmin`);
      }
    } else {
      await User.create({
        email: trimmed,
        password: process.env.SUPERADMIN_PASSWORD || 'admin123',
        nombre: 'Superadmin',
        roles: ['superadmin'],
        isVerified: true,
      });
      console.log(`[Seed] Superadmin created: ${trimmed}`);
    }
  }

  await seedCommercials();
}
