# Firestore Security Specification

## 1. Data Invariants
1. All collections start from a default-deny catch-all (`allow read, write: if false;`).
2. Public storefront catalog collections (`site_content`, `courses`, `artisans`, `gallery_works`) allow public reads (`get`, `list`) and strictly restrict writes (`create`, `update`, `delete`) to verified administrators (`isAdmin()`).
3. PII collections (`members`, `enrollments`, `notifications`, `contact_submissions`) strictly enforce `ownerUid == request.auth.uid || isAdmin()` on `get`, `list`, and writes, preventing unauthenticated reads or cross-member scraping.
4. `enrollments` creation verifies that the referenced `memberId` and `courseId` exist via `exists()`, enforces `ownerUid == request.auth.uid`, and prevents students from setting `paymentStatus` directly to `paid` when choosing `bank_transfer`.
5. `enrollments` updates by students are limited strictly to updating `transferLastFive`, `receiptMediaId`, `paymentStatus` (to `awaiting_verification`), and `updatedAt` while the record is not cancelled; full verification (`paid` / `needs_revision` / `cancelled`) is restricted to `isAdmin()`.
6. `admin_users`, `admin_identities`, and `cms_revisions` are strictly restricted to `isAdmin()`, and self-assigned admin escalation is blocked.
7. Every timestamp field (`createdAt`, `updatedAt`, `readAt`) on create/update is validated against `request.time`.

## 2. Dirty Dozen Attack Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated write to `/site_content/published` -> Denied (`isAdmin()` fails).
2. Non-admin authenticated user creating `/courses/c1` -> Denied (`isAdmin()` fails).
3. Unauthenticated `list` on `/members` -> Denied (PII protection).
4. Authenticated student reading another student's `/members/{otherId}` -> Denied (`ownerUid != request.auth.uid`).
5. Authenticated student adding shadow field `isAdmin: true` in `/members/{id}` -> Denied (`keys().hasOnly(...)` fails).
6. Authenticated student modifying `paymentStatus` directly to `'paid'` on a `bank_transfer` enrollment -> Denied.
7. Authenticated student updating `totalAmount` on an existing `/enrollments/{id}` -> Denied (`affectedKeys().hasOnly(...)` fails).
8. Authenticated student deleting `/enrollments/{id}` -> Denied (`isAdmin()` only).
9. Authenticated user forging `ownerUid` to another UID when creating `/contact_submissions/{id}` -> Denied (`ownerUid == request.auth.uid` fails).
10. Unverified email token (`email_verified: false`) pretending to be super admin -> Denied (`email_verified == true` enforced).
11. Authenticated student injecting >1MB string into `/media_assets/{id}` `dataUrl` -> Denied (`size() <= 900000`).
12. Authenticated student creating `/admin_identities/{uid}` for privilege escalation -> Denied (`isSuperAdminEmail()` or `isAdmin()` only).
