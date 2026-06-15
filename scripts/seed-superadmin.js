import 'dotenv/config';
import { connectDB } from '../src/config/mongo.js';
import { User } from '../src/models/User.js';

async function seed() {
  await connectDB();

  const emails = (process.env.SUPERADMIN_EMAILS || 'admin@viverosguzman.es').split(',');
  for (const raw of emails) {
    const email = raw.trim();
    const existing = await User.findOne({ email });
    if (existing) {
      if (existing.role !== 'superadmin') {
        existing.role = 'superadmin';
        existing.isVerified = true;
        await existing.save();
        console.log(`User ${email} promoted to superadmin`);
      } else {
        console.log(`${email} is already superadmin`);
      }
    } else {
      await User.create({
        email,
        password: process.env.SUPERADMIN_PASSWORD || 'admin123',
        nombre: 'Superadmin',
        role: 'superadmin',
        isVerified: true,
      });
      console.log(`Superadmin created: ${email}`);
    }
  }
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
