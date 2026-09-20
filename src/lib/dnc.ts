/**
 * Do-Not-Call decisions — pure, org-scoped, unit-tested.
 *
 * A contact is undiallable when EITHER holds:
 *   1. its own `do_not_call` flag, OR
 *   2. its normalized number sits in its org's DNC entries.
 *
 * DNC entries are keyed `(org_id, normalized_phone)`: org A listing a
 * number never suppresses org B's outreach to the same line. The index
 * below makes that scoping explicit instead of trusting callers to filter.
 */

import { normalizePhone } from "./phone";

export interface DncContact {
  id: string;
  phone_number: string;
  normalized_phone: string | null;
  do_not_call: boolean;
}

export interface DncEntryRow {
  org_id: string;
  normalized_phone: string;
}

/** Org → its normalized DNC numbers. */
export function buildDncIndex(rows: DncEntryRow[]): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row?.org_id || !row?.normalized_phone) continue;
    const normalized = normalizePhone(row.normalized_phone);
    if (!normalized) continue;
    let set = index.get(row.org_id);
    if (!set) {
      set = new Set();
      index.set(row.org_id, set);
    }
    set.add(normalized);
  }
  return index;
}

/** True when this contact must not be dialled for this org. */
export function isDncListed(
  orgId: string,
  contact: DncContact,
  index: Map<string, Set<string>>
): boolean {
  if (contact.do_not_call) return true;
  const contactNorm =
    normalizePhone(contact.normalized_phone ?? "") ??
    normalizePhone(contact.phone_number);
  const normalized = contactNorm;
  if (!normalized) return false;
  return index.get(orgId)?.has(normalized) ?? false;
}

export interface PartitionedContacts {
  /** Diallable, each carrying its normalized number. */
  callable: { contact: DncContact; normalized: string }[];
  dnc: DncContact[];
  /** Unparseable numbers — recorded, never dialled. */
  skipped: DncContact[];
}

/** Split a contact batch into callable / DNC / skipped. */
export function partitionContacts(
  orgId: string,
  contacts: DncContact[],
  index: Map<string, Set<string>>
): PartitionedContacts {
  const out: PartitionedContacts = { callable: [], dnc: [], skipped: [] };
  for (const contact of contacts) {
    const contactNorm =
      normalizePhone(contact.normalized_phone ?? "") ??
      normalizePhone(contact.phone_number);
    const normalized = contactNorm;
    if (contact.do_not_call || (normalized && index.get(orgId)?.has(normalized))) {
      out.dnc.push(contact);
    } else if (!normalized) {
      out.skipped.push(contact);
    } else {
      out.callable.push({ contact, normalized });
    }
  }
  return out;
}
