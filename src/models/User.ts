import mongoose, { Schema, Document, Model } from 'mongoose';
import bcrypt from 'bcryptjs';

export type UserRole = 'super_admin' | 'hr_admin' | 'hr_manager' | 'payroll_officer' | 'finance_auditor' | 'compliance_officer' | 'employee' | 'digital_worker' | 'readonly';

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  employeeId?: mongoose.Types.ObjectId;
  tenantId?: mongoose.Types.ObjectId;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  passwordResetToken?: string;
  passwordResetExpiry?: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    name:        { type: String, required: true, trim: true },
    email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
    password:    { type: String, required: true, minlength: 6 },
    role:        {
      type: String,
      enum: ['super_admin','hr_admin','hr_manager','payroll_officer','finance_auditor','compliance_officer','employee','digital_worker','readonly'],
      default: 'employee',
    },
    employeeId:  { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    tenantId:    { type: Schema.Types.ObjectId, ref: 'Tenant', default: null },
    isActive:            { type: Boolean, default: true },
    lastLoginAt:         { type: Date },
    passwordResetToken:  { type: String },
    passwordResetExpiry: { type: Date },
  },
  { timestamps: true }
);

// Mongoose v9: save hooks use Promise — no next() needed
UserSchema.pre('save', async function () {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = this as any;
  if (!doc.isModified('password')) return;
  doc.password = await bcrypt.hash(doc.password, 12);
});

UserSchema.methods.comparePassword = function (candidate: string) {
  return bcrypt.compare(candidate, this.password);
};

const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;
