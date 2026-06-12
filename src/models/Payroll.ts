import mongoose, { Schema, Document, Model } from 'mongoose';

export type PayrollStatus = 'draft' | 'processing' | 'approved' | 'paid' | 'cancelled';

export interface IPayrollRun extends Document {
  month: number;
  year: number;
  status: PayrollStatus;
  totalGross: number;
  totalNet: number;
  totalDeductions: number;
  currency: string;
  employeeCount: number;
  processedAt?: Date;
  approvedById?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPayrollRecord extends Document {
  payrollRunId: mongoose.Types.ObjectId;
  employeeId: mongoose.Types.ObjectId;
  month: number;
  year: number;
  baseSalary: number;
  grossSalary: number;
  netSalary: number;
  currency: string;
  deductions: {
    tax: number;
    providentFund: number;
    insurance: number;
    other: number;
  };
  allowances: {
    hra: number;
    transport: number;
    medical: number;
    other: number;
  };
  overtimeHours: number;
  overtimePay: number;
  status: PayrollStatus;
  createdAt: Date;
  updatedAt: Date;
}

const PayrollRunSchema = new Schema<IPayrollRun>(
  {
    month:          { type: Number, required: true, min: 1, max: 12 },
    year:           { type: Number, required: true },
    status:         {
      type: String,
      enum: ['draft', 'processing', 'approved', 'paid', 'cancelled'],
      default: 'draft',
    },
    totalGross:     { type: Number, default: 0 },
    totalNet:       { type: Number, default: 0 },
    totalDeductions:{ type: Number, default: 0 },
    currency:       { type: String, default: 'USD' },
    employeeCount:  { type: Number, default: 0 },
    processedAt:    { type: Date },
    approvedById:   { type: Schema.Types.ObjectId, ref: 'Employee' },
    approvedAt:     { type: Date },
  },
  { timestamps: true }
);

PayrollRunSchema.index({ month: 1, year: 1 }, { unique: true });

const PayrollRecordSchema = new Schema<IPayrollRecord>(
  {
    payrollRunId:   { type: Schema.Types.ObjectId, ref: 'PayrollRun', required: true },
    employeeId:     { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    month:          { type: Number, required: true },
    year:           { type: Number, required: true },
    baseSalary:     { type: Number, required: true },
    grossSalary:    { type: Number, required: true },
    netSalary:      { type: Number, required: true },
    currency:       { type: String, default: 'USD' },
    deductions: {
      tax:           { type: Number, default: 0 },
      providentFund: { type: Number, default: 0 },
      insurance:     { type: Number, default: 0 },
      other:         { type: Number, default: 0 },
    },
    allowances: {
      hra:       { type: Number, default: 0 },
      transport: { type: Number, default: 0 },
      medical:   { type: Number, default: 0 },
      other:     { type: Number, default: 0 },
    },
    overtimeHours:  { type: Number, default: 0 },
    overtimePay:    { type: Number, default: 0 },
    status:         {
      type: String,
      enum: ['draft', 'processing', 'approved', 'paid', 'cancelled'],
      default: 'draft',
    },
  },
  { timestamps: true }
);

PayrollRecordSchema.index({ payrollRunId: 1, employeeId: 1 }, { unique: true });
PayrollRecordSchema.index({ employeeId: 1, year: 1, month: 1 });

export const PayrollRun: Model<IPayrollRun> =
  mongoose.models.PayrollRun || mongoose.model<IPayrollRun>('PayrollRun', PayrollRunSchema);

export const PayrollRecord: Model<IPayrollRecord> =
  mongoose.models.PayrollRecord || mongoose.model<IPayrollRecord>('PayrollRecord', PayrollRecordSchema);
