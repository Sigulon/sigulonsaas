import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth-helpers";
import { canCreateAndRun } from "@/lib/roles";
import { ContactRepository, DncRepository } from "@sigulon/database";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { orgId } = await getOrgContext();
    const { searchParams } = new URL(req.url);

    const search = searchParams.get("search") || undefined;
    const dncOnly = searchParams.get("dnc") === "true";
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);


    const { contacts, total } = await ContactRepository.findByOrg(orgId, {
      search,
      dncOnly,
      limit,
      offset,
    });

    const formatted = contacts.map((c) => ({
      id: c._id.toString(),
      org_id: c.organizationId.toString(),
      name: c.name || "",
      phone_number: c.phone,
      normalized_phone: c.normalizedPhone,
      email: c.email || "",
      company: c.company || "",
      do_not_call: c.doNotCall,
      metadata: c.customFields,
      created_at: c.createdAt.toISOString(),
      updated_at: c.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      contacts: formatted,
      total,
      limit,
      offset,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const code = (err as NodeJS.ErrnoException).code;
    const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await getOrgContext();
    if (!canCreateAndRun(context.role)) {
      return NextResponse.json(
        { error: "Forbidden: requires member role or higher." },
        { status: 403 }
      );
    }
    const { orgId } = context;
    const body = await req.json();

    const { name, phone_number, email = "", company = "", do_not_call = false, metadata = {} } = body;

    if (!phone_number) {
      return NextResponse.json(
        { error: "Phone number is required." },
        { status: 400 }
      );
    }

    const normalized = normalizePhone(phone_number);
    if (!normalized) {
      return NextResponse.json(
        { error: "Invalid phone number format." },
        { status: 400 }
      );
    }

    const contact = await ContactRepository.create({
      organizationId: orgId,
      name,
      phone: phone_number,
      normalizedPhone: normalized,
      email,
      company,
      doNotCall: Boolean(do_not_call),
      customFields: metadata,
    });

    if (do_not_call) {
      await DncRepository.add(orgId, normalized, "Added via contact creation");
    }

    return NextResponse.json(
      {
        contact: {
          id: contact._id.toString(),
          org_id: contact.organizationId.toString(),
          name: contact.name,
          phone_number: contact.phone,
          normalized_phone: contact.normalizedPhone,
          email: contact.email,
          company: contact.company,
          do_not_call: contact.doNotCall,
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const code = (err as NodeJS.ErrnoException).code;
    const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const context = await getOrgContext();
    if (!canCreateAndRun(context.role)) {
      return NextResponse.json(
        { error: "Forbidden: requires member role or higher." },
        { status: 403 }
      );
    }
    const { orgId } = context;
    const body = await req.json();
    const { id, do_not_call } = body;

    if (!id || do_not_call === undefined) {
      return NextResponse.json(
        { error: "Contact ID and do_not_call status are required." },
        { status: 400 }
      );
    }

    const contact = await ContactRepository.updateDnc(orgId, id, Boolean(do_not_call));
    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    if (do_not_call) {
      await DncRepository.add(orgId, contact.normalizedPhone, "Updated DNC flag");
    } else {
      await DncRepository.remove(orgId, contact.normalizedPhone);
    }

    return NextResponse.json({
      contact: {
        id: contact._id.toString(),
        do_not_call: contact.doNotCall,
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    const code = (err as NodeJS.ErrnoException).code;
    const status = code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: errorMsg }, { status });
  }
}
