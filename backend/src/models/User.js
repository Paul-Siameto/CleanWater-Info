import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  role: { type: String, enum: ['citizen','ngo','gov','lab','admin'], default: 'citizen' },
  displayName: { type: String },
  email: { type: String },
  organizationId: { type: String },
}, { timestamps: true });

export default mongoose.models.User || mongoose.model('User', userSchema);
