import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
  reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', required: true },
  authorId: { type: String, default: null },
  content: { type: String, required: true },
}, { timestamps: true });

export default mongoose.models.Comment || mongoose.model('Comment', commentSchema);
