export type OrgRole = "owner" | "admin" | "member" | "viewer";

export interface OrganizationRecord {
  id: string;
  name: string;
  max_concurrent_calls: number;
  created_at: string;
  updated_at: string;
}

export interface OrgMemberRecord {
  id: string;
  org_id: string;
  user_id: string;
  role: OrgRole;
  created_at: string;
}
