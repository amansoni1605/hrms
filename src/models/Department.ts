import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDepartment extends Document {
  name: string;
  code: string;
  parentId?: mongoose.Types.ObjectId;
  costCenter?: string;
  headCount: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DepartmentSchema = new Schema<IDepartment>(
  {
    name:       { type: String, required: true, trim: true },
    code:       { type: String, required: true, unique: true, uppercase: true, trim: true },
    parentId:   { type: Schema.Types.ObjectId, ref: 'Department', default: null },
    costCenter: { type: String, trim: true },
    headCount:  { type: Number, default: 0 },
    isActive:   { type: Boolean, default: true },
  },
  { timestamps: true }
);

DepartmentSchema.index({ code: 1 }, { unique: true });
DepartmentSchema.index({ isActive: 1 });

const Department: Model<IDepartment> =
  mongoose.models.Department || mongoose.model<IDepartment>('Department', DepartmentSchema);

export default Department;
