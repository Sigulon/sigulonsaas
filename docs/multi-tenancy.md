# Multi-tenancy and authorization

Sigulon stores tenant data in MongoDB. Every user-facing route resolves an
active organization from the authenticated session, then scopes its repository
queries with `organizationId`. The active-organization cookie is accepted only
after the server confirms that the user is a current member.

## Roles

`viewer < member < admin < owner`.

- Viewers can read authorized workspace data.
- Members can create and run calls and campaigns.
- Admins manage team members, carrier configuration, and phone numbers.
- Owners can grant or change owner/admin roles and cannot remove the last
  owner.

`src/lib/roles.ts` is the shared role policy; the membership and telephony
routes enforce it server-side.

## Service boundaries

- Plivo callbacks are signature-verified before any mutation.
- Internal runtime calls require `INTERNAL_API_SECRET`.
- Provider credentials are AES-256-GCM encrypted at rest. Active
  per-workspace Plivo credentials take precedence for that workspace's
  outbound calls and callback verification; complete platform credentials are
  used only as a fallback when no workspace Plivo account is stored. The web
  service and campaign worker must share `ENCRYPTION_SECRET` for this to work.
- Demo mode is available only outside production.

MongoDB has no automatic row-level security. Repository scoping and route
authorization are therefore security-critical; add integration coverage for
each new tenant-owned model and API route.
