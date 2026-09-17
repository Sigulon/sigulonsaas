import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth-helpers";
import { AppointmentRepository, AppointmentStatus } from "@sigulon/database";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CreateAppointmentSchema = z.object({
  agentId: z.string().optional(),
  contactId: z.string().optional(),
  callId: z.string().optional(),
  title: z.string().min(1).default("Consultation Appointment"),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  timezone: z.string().default("Asia/Kolkata"),
  notes: z.string().optional(),
});

const UpdateAppointmentSchema = z.object({
  id: z.string(),
  status: z.enum(["scheduled", "confirmed", "completed", "cancelled", "no_show"]),
});

export async function GET(req: NextRequest) {
  try {
    const { orgId } = await getOrgContext();
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const status = url.searchParams.get("status") as AppointmentStatus | undefined;

    const appointments = await AppointmentRepository.listByOrg(orgId, {
      limit,
      status: status || undefined,
    });

    return NextResponse.json({ appointments });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { orgId } = await getOrgContext();
    const body = await req.json();
    const parsed = CreateAppointmentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { agentId, contactId, callId, title, startTime, endTime, timezone, notes } =
      parsed.data;
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date(start.getTime() + 30 * 60 * 1000);

    const isAvailable = await AppointmentRepository.checkAvailability(
      orgId,
      start,
      end
    );
    if (!isAvailable) {
      return NextResponse.json(
        { error: "Time slot is not available or conflicts with another appointment" },
        { status: 409 }
      );
    }

    const appointment = await AppointmentRepository.create({
      organizationId: orgId,
      agentId,
      contactId,
      callId,
      title,
      startTime: start,
      endTime: end,
      timezone,
      notes,
    });

    return NextResponse.json({ appointment }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create appointment";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { orgId } = await getOrgContext();
    const body = await req.json();
    const parsed = UpdateAppointmentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const updated = await AppointmentRepository.updateStatus(
      parsed.data.id,
      orgId,
      parsed.data.status
    );

    if (!updated) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }

    return NextResponse.json({ appointment: updated });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update appointment";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
