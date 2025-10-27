import mongoose from 'mongoose';

const pointSchema = new mongoose.Schema({
  type: { type: String, enum: ['Point'], required: true, default: 'Point' },
  coordinates: { type: [Number], required: true },
}, { _id: false });

const reportSchema = new mongoose.Schema({
  reporterId: { type: String, default: null },
  status: { type: String, enum: ['pending', 'flagged', 'verified', 'rejected'], default: 'pending' },
  location: { type: pointSchema, required: true },
  notes: { type: String, default: '' },
  photos: { type: [String], default: [] }, // store Cloudinary public IDs later
  contaminationType: { type: String, default: null },
  aiScore: { type: Number, default: null },
  aiLabel: { type: String, default: null },
  aiTop: { type: [Object], default: [] },
  weatherSnapshot: { type: Object, default: null },
  duplicates: { type: [mongoose.Schema.Types.ObjectId], ref: 'Report', default: [] },
}, { timestamps: true });

reportSchema.index({ location: '2dsphere' });

export default mongoose.models.Report || mongoose.model('Report', reportSchema);
