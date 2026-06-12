import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAuditLog extends Document {
  actorId?: mongoose.Types.ObjectId;
  actorEmail?: string;
  actionType: string;
  resourceType: string;
  resourceId?: mongoose.Types.ObjectId;
  description: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    actorId:      { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
    actorEmail:   { type: String },
    actionType:   { type: String, required: true },
    resourceType: { type: String, required: true },
    resourceId:   { type: Schema.Types.ObjectId, default: null },
    description:  { type: String, required: true },
    metadata:     { type: Schema.Types.Mixed },
    ipAddress:    { type: String },
    userAgent:    { type: String },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Audit logs are immutable — block updates
AuditLogSchema.pre('updateOne', function () {
  throw new Error('Audit logs are immutable');
});
AuditLogSchema.pre('findOneAndUpdate', function () {
  throw new Error('Audit logs are immutable');
});

AuditLogSchema.index({ actionType: 1, createdAt: -1 });
AuditLogSchema.index({ resourceType: 1, resourceId: 1 });
AuditLogSchema.index({ actorId: 1, createdAt: -1 });

const AuditLog: Model<IAuditLog> =
  mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

export default AuditLog;
