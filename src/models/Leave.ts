import mongoose, { Schema, Document, Model } from 'mongoose';

export type LeaveType = 'annual' | 'sick' | 'maternity' | 'paternity' | 'unpaid' | 'compensatory';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface ILeave extends Document {
  employeeId: mongoose.Types.ObjectId;
  leaveType: LeaveType;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  reason: string;
  status: LeaveStatus;
  approvedById?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LeaveSchema = new Schema<ILeave>(
  {
    employeeId:      { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    leaveType:       {
      type: String,
      enum: ['annual', 'sick', 'maternity', 'paternity', 'unpaid', 'compensatory'],
      required: true,
    },
    startDate:       { type: Date, required: true },
    endDate:         { type: Date, required: true },
    totalDays:       { type: Number, required: true, min: 0.5 },
    reason:          { type: String, required: true, trim: true },
    status:          {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
    },
    approvedById:    { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    approvedAt:      { type: Date },
    rejectionReason: { type: String },
  },
  { timestamps: true }
);

LeaveSchema.index({ employeeId: 1, status: 1 });
LeaveSchema.index({ startDate: 1, endDate: 1 });
LeaveSchema.index({ status: 1 });

const Leave: Model<ILeave> =
  mongoose.models.Leave || mongoose.model<ILeave>('Leave', LeaveSchema);

export default Leave;
