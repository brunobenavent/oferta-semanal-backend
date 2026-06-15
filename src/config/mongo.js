import mongoose from 'mongoose';
import config from './index.js';

export async function connectDB() {
  if (!config.mongodbUri) {
    throw new Error('MONGODB_URI no está configurada en .env');
  }
  await mongoose.connect(config.mongodbUri);
  console.log('Connected to MongoDB:', config.mongodbUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));
}
