import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth-helpers";
import { RecordingModel, connectToDatabase } from "@sigulon/database";
import { generateDownloadUrl } from "@/lib/storage";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { orgId } = await getOrgContext();
    const { id } = await params;

    await connectToDatabase();

    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    if (!isObjectId) {
      return NextResponse.json({ error: "Invalid recording or call ID" }, { status: 400 });
    }

    // Try finding by recording _id first, then by callId
    let recording = await RecordingModel.findOne({
      _id: new mongoose.Types.ObjectId(id),
      organizationId: orgId,
    });

    if (!recording) {
      recording = await RecordingModel.findOne({
        callId: new mongoose.Types.ObjectId(id),
        organizationId: orgId,
      });
    }

    if (!recording) {
      return NextResponse.json({ error: "Recording not found" }, { status: 404 });
    }

    const downloadUrl = generateDownloadUrl({
      provider: recording.storageProvider,
      bucket: recording.bucket,
      objectKey: recording.objectKey,
    });

    return NextResponse.json({
      recording: {
        id: recording._id.toString(),
        callId: recording.callId.toString(),
        durationSeconds: recording.durationSeconds,
        format: recording.format,
        sizeBytes: recording.sizeBytes,
        status: recording.status,
        url: downloadUrl,
        createdAt: recording.createdAt,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch recording";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
