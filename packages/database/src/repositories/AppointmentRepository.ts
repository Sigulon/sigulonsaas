import mongoose from "mongoose";
import { connectToDatabase } from "../client";
import {
  AppointmentModel,
  IAppointment,
  AppointmentStatus,
} from "../models/Appointment";

export class AppointmentRepository {
  static async listByOrg(
    orgId: string | mongoose.Types.ObjectId,
    options?: { limit?: number; status?: AppointmentStatus }
  ): Promise<IAppointment[]> {
    await connectToDatabase();
    const query: Record<string, unknown> = { organizationId: orgId };
    if (options?.status) query.status = options.status;

    return AppointmentModel.find(query)
      .populate("agentId", "name")
      .populate("contactId", "name phone normalizedPhone")
      .sort({ startTime: -1 })
      .limit(options?.limit ?? 50)
      .exec();
  }

  static async findById(
    id: string | mongoose.Types.ObjectId,
    orgId?: string | mongoose.Types.ObjectId
  ): Promise<IAppointment | null> {
    await connectToDatabase();
    const query: Record<string, unknown> = { _id: id };
    if (orgId) query.organizationId = orgId;
    return AppointmentModel.findOne(query)
      .populate("agentId")
      .populate("contactId")
      .exec();
  }

  static async checkAvailability(
    orgId: string | mongoose.Types.ObjectId,
    startTime: Date,
    endTime: Date
  ): Promise<boolean> {
    await connectToDatabase();
    const overlapping = await AppointmentModel.countDocuments({
      organizationId: orgId,
      status: { $in: ["scheduled", "confirmed"] },
      $or: [
        {
          startTime: { $lt: endTime },
          endTime: { $gt: startTime },
        },
      ],
    }).exec();

    return overlapping === 0;
  }

  static async create(data: {
    organizationId: string | mongoose.Types.ObjectId;
    agentId?: string | mongoose.Types.ObjectId;
    contactId?: string | mongoose.Types.ObjectId;
    callId?: string | mongoose.Types.ObjectId;
    title?: string;
    startTime: Date;
    endTime?: Date;
    timezone?: string;
    notes?: string;
    status?: AppointmentStatus;
  }): Promise<IAppointment> {
    await connectToDatabase();
    const appointment = new AppointmentModel({
      organizationId: data.organizationId,
      agentId: data.agentId,
      contactId: data.contactId,
      callId: data.callId,
      title: data.title || "Consultation Appointment",
      startTime: data.startTime,
      endTime: data.endTime || new Date(data.startTime.getTime() + 30 * 60 * 1000),
      timezone: data.timezone || "Asia/Kolkata",
      notes: data.notes || "",
      status: data.status || "scheduled",
    });
    return appointment.save();
  }

  static async updateStatus(
    id: string | mongoose.Types.ObjectId,
    orgId: string | mongoose.Types.ObjectId,
    status: AppointmentStatus
  ): Promise<IAppointment | null> {
    await connectToDatabase();
    return AppointmentModel.findOneAndUpdate(
      { _id: id, organizationId: orgId },
      { status },
      { returnDocument: "after" }
    ).exec();
  }
}
