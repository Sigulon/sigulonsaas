import mongoose, { Schema, Document, Model } from "mongoose";

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";

export interface IAppointment extends Document {
  _id: mongoose.Types.ObjectId;
  organizationId: mongoose.Types.ObjectId;
  agentId?: mongoose.Types.ObjectId;
  contactId?: mongoose.Types.ObjectId;
  callId?: mongoose.Types.ObjectId;
  title: string;
  startTime: Date;
  endTime?: Date;
  timezone: string;
  status: AppointmentStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AppointmentSchema = new Schema<IAppointment>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    agentId: {
      type: Schema.Types.ObjectId,
      ref: "Agent",
      index: true,
    },
    contactId: {
      type: Schema.Types.ObjectId,
      ref: "Contact",
      index: true,
    },
    callId: {
      type: Schema.Types.ObjectId,
      ref: "Call",
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      default: "Consultation Call",
    },
    startTime: {
      type: Date,
      required: true,
      index: true,
    },
    endTime: {
      type: Date,
    },
    timezone: {
      type: String,
      default: "Asia/Kolkata",
    },
    status: {
      type: String,
      enum: [
        "scheduled",
        "confirmed",
        "cancelled",
        "completed",
        "no_show",
      ],
      default: "scheduled",
      index: true,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
    collection: "appointments",
  }
);

AppointmentSchema.index({ organizationId: 1, startTime: 1 });

export const AppointmentModel: Model<IAppointment> =
  mongoose.models.Appointment ||
  mongoose.model<IAppointment>("Appointment", AppointmentSchema);
