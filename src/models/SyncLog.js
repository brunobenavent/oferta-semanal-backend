import mongoose from 'mongoose';

const syncLogSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['offer', 'image', 'manual'],
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['running', 'success', 'error'],
    default: 'running'
  },
  articlesCount: Number,
  newCount: Number,
  updatedCount: Number,
  deactivatedCount: Number,
  imagesUploaded: Number,
  error: String,
  duration: Number,
  triggeredBy: {
    type: String,
    default: 'cron'
  }
}, {
  timestamps: true
});

syncLogSchema.index({ type: 1, createdAt: -1 });

export const SyncLog = mongoose.model('SyncLog', syncLogSchema);
