# PDFNestly Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Default Deny**: All paths not explicitly matched in `/databases/{database}/documents` are unconditionally denied (`allow read, write: if false`).
2. **Verified Authentication**: Standard writes require an authenticated user (`request.auth != null`) with a verified email (`request.auth.token.email_verified == true`).
3. **Bootstrap & Database-Backed Admin (`isAdmin()`)**:
   - An administrator is either an entry in `/admins/$(request.auth.uid)` or the bootstrapped runtime administrator (`request.auth.token.email == 'rfjatt002@gmail.com' && request.auth.token.email_verified == true`).
4. **PII Isolation (`/users/{userId}`)**:
   - User profiles contain PII (`email`, `displayName`). Reads (`get`, `list`) are strictly restricted to the document owner (`request.auth.uid == userId` / `resource.data.uid == request.auth.uid`) or `isAdmin()`.
   - Self-registration (`create`) strictly forbids self-assigning `role == 'admin'` (unless `isAdmin()`) or setting `status != 'active'`.
   - User profile updates (`update`) by non-admins are partitioned using `affectedKeys().hasOnly(['displayName', 'photoURL', 'updatedAt'])` and cannot modify `role`, `status`, `email`, `uid`, or `createdAt`.
5. **Relational & Temporal Integrity**:
   - Every `create` validates `incoming().createdAt == request.time`.
   - Every `update` validates `incoming().updatedAt == request.time` and preserves immutable `createdAt`, `uid`, and `userId`.
   - `pdf_jobs` and `activity_events` created by users must reference an existing `/users/$(request.auth.uid)` document (`exists(...)`) and set `userId == request.auth.uid`.
6. **Terminal State Locking (`pdf_jobs`)**:
   - Once a `PdfJob` reaches terminal status (`status == 'completed'` or `status == 'failed'`), non-admin users cannot update it.
7. **Immutable Audit Logs (`admin_audit_logs`)**:
   - Only `isAdmin()` can `get`, `list`, or `create` audit logs; `update` and `delete` are permanently `false`.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 (Privilege Escalation on Signup)**: Authenticated user creates `/users/user_1` with `role: "admin"`. -> `PERMISSION_DENIED`
2. **Payload 2 (Shadow Field Injection)**: Authenticated user creates `/users/user_1` with an undeclared field `isSuperAdmin: true`. -> `PERMISSION_DENIED`
3. **Payload 3 (Unverified Email Spoofing)**: User with `email: "rfjatt002@gmail.com"` but `email_verified: false` attempts to read `/users/other_user`. -> `PERMISSION_DENIED`
4. **Payload 4 (Cross-User PII Read)**: Verified user `user_1` attempts `get` on `/users/user_2`. -> `PERMISSION_DENIED`
5. **Payload 5 (Blanket List Scraping on `/users`)**: Verified non-admin user attempts an unfiltered `list` on `/users`. -> `PERMISSION_DENIED`
6. **Payload 6 (Role Mutation via Profile Update)**: Verified user `user_1` updates `/users/user_1` changing `role` from `"user"` to `"admin"`. -> `PERMISSION_DENIED`
7. **Payload 7 (ID Poisoning / Oversized String)**: Attacker attempts to create `/pdf_jobs/invalid$id!` or a `toolName` exceeding 120 chars. -> `PERMISSION_DENIED`
8. **Payload 8 (Orphaned Job Write)**: Verified user without a `/users/{uid}` profile attempts to create a `/pdf_jobs/{jobId}` record. -> `PERMISSION_DENIED`
9. **Payload 9 (Identity Spoofing on Activity Event)**: Verified user `user_1` creates `/activity_events/evt_1` with `userId: "user_2"`. -> `PERMISSION_DENIED`
10. **Payload 10 (Terminal State Unlock on `pdf_jobs`)**: Verified user attempts to update a `/pdf_jobs/job_1` document whose existing `status` is already `"completed"`. -> `PERMISSION_DENIED`
11. **Payload 11 (Audit Log Tampering)**: Verified admin attempts to `update` or `delete` `/admin_audit_logs/log_1`. -> `PERMISSION_DENIED`
12. **Payload 12 (Unauthorized System Settings Write)**: Verified non-admin user attempts to update `/system_settings/global`. -> `PERMISSION_DENIED`
