import mongoose, { Schema, Document, Model } from 'mongoose';

export type EmploymentStatus = 'active' | 'on_leave' | 'probation' | 'suspended' | 'terminated';
export type EmploymentType = 'full_time' | 'part_time' | 'contractor' | 'intern';

export interface IEmployee extends Document {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  avatar?: string;
  dateOfBirth?: Date;
  nationalId?: string;
  // Salary & compensation
  baseSalary: number;
  currency: string;
  bankAccount?: string;
  bankName?: string;
  // Work info
  departmentId: mongoose.Types.ObjectId;
  jobTitle: string;
  managerId?: mongoose.Types.ObjectId;
  employmentStatus: EmploymentStatus;
  employmentType: EmploymentType;
  hireDate: Date;
  probationEndDate?: Date;
  terminationDate?: Date;
  // Location
  countryCode: string;
  timezone: string;
  locale: string;
  // ML scores
  burnoutRiskScore: number;
  flightRiskScore: number;
  performancePercentile?: number;
  riskLastComputedAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  fullName: string;
}

const EmployeeSchema = new Schema<IEmployee>(
  {
    employeeCode:       { type: String, required: true, unique: true, trim: true },
    firstName:          { type: String, required: true, trim: true },
    lastName:           { type: String, required: true, trim: true },
    email:              { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone:              { type: String, trim: true },
    avatar:             { type: String },
    dateOfBirth:        { type: Date },
    nationalId:         { type: String, trim: true },
    baseSalary:         { type: Number, required: true, min: 0 },
    currency:           { type: String, default: 'USD', uppercase: true, length: 3 },
    bankAccount:        { type: String },
    bankName:           { type: String },
    departmentId:       { type: Schema.Types.ObjectId, ref: 'Department', required: true },
    jobTitle:           { type: String, required: true, trim: true },
    managerId:          { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    employmentStatus:   {
      type: String,
      enum: ['active', 'on_leave', 'probation', 'suspended', 'terminated'],
      default: 'probation',
    },
    employmentType: {
      type: String,
      enum: ['full_time', 'part_time', 'contractor', 'intern'],
      default: 'full_time',
    },
    hireDate:           { type: Date, required: true },
    probationEndDate:   { type: Date },
    terminationDate:    { type: Date },
    countryCode:        { type: String, default: 'US', uppercase: true },
    timezone:           { type: String, default: 'UTC' },
    locale:             { type: String, default: 'en-US' },
    burnoutRiskScore:   { type: Number, default: 0, min: 0, max: 1 },
    flightRiskScore:    { type: Number, default: 0, min: 0, max: 1 },
    performancePercentile: { type: Number, min: 0, max: 100 },
    riskLastComputedAt: { type: Date },
    isActive:           { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

EmployeeSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

EmployeeSchema.index({ email: 1 }, { unique: true });
EmployeeSchema.index({ employeeCode: 1 }, { unique: true });
EmployeeSchema.index({ departmentId: 1 });
EmployeeSchema.index({ employmentStatus: 1, isActive: 1 });
EmployeeSchema.index({ flightRiskScore: -1 });
EmployeeSchema.index({ burnoutRiskScore: -1 });

const Employee: Model<IEmployee> =
  mongoose.models.Employee || mongoose.model<IEmployee>('Employee', EmployeeSchema);

export default Employee;
