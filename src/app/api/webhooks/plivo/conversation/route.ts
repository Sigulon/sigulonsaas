import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Retired endpoint retained only to give old Plivo XML a clear terminal
 * response while deployments roll forward. New answer webhooks always use
 * the authenticated Pipecat media stream and never link to this route.
 */
export async function POST() {
  return new NextResponse("The legacy voice endpoint has been retired.", {
    status: 410,
    headers: { "Content-Type": "text/plain" },
  });
}
