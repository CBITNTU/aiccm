# Security Mitigation Plan

This document outlines the work needed to align this app with the same security mitigations used in the other agent/app: SQL injection, RCE, email enumeration, token brute force, email spam, bcrypt DoS, null-byte attacks, and XSS in email.

---

## Implemented (safe to ship)

The following are already in place and safe for production:

- **SQL Injection:** `sanitizeHexToken()` in `lib/utils/invite-token.ts`; used in invite validate and signup-invite (POST and PUT). Invalid tokens get a generic "Invalid invitation link" response.
- **bcrypt DoS + Null byte:** Password max 128 characters and rejection of `\0` in `app/api/auth/signup/route.ts` and `app/api/auth/signup-invite/route.ts` (POST).
- **XSS in email:** `escapeHtml()` in `lib/email/utils.ts`; used in team-invitation, approval-notification, company-join-request, and admin-notification templates.
- **Open redirect:** Shared `isValidRedirectUrl()` in `lib/utils/redirectUrl.ts`; used in auth callback and middleware so the `next` / `redirectTo` param is only a safe relative path.

**Policy (documentation):**

- **RCE:** Do not introduce `eval`, shell execution, or dynamic code execution on user input. Use parameterized queries and validated/sanitized input only.
- **Sensitive data in logs:** Never log passwords, raw tokens, or full auth codes. Log only opaque IDs or "present/absent". Audit `logApiEvent` and `console.*` in auth/invite flows when adding new fields.
- **CSRF / same-origin:** State-changing APIs are designed for same-origin use with cookie-based auth. If exposing APIs to other origins, add CSRF protection (e.g. double-submit cookie or SameSite).
- **Secrets:** Never put secrets in `NEXT_PUBLIC_*`. Keep `.env*.local` and production env out of version control; use platform secrets in production.

---

## 1. SQL Injection

**Defense:** `sanitizeHexToken()` + parameterized queries.

**Current state:**
- Supabase client uses parameterized queries by default (`.eq()`, `.select()`, etc.), so raw SQL injection via app code is not an issue.
- Invite **token** is user-controlled: it is hashed with `hashToken(token)` and the hash is used in `.eq("token_hash", tokenHash)`. The hash is a fixed-length hex string, so it is safe. The risk is accepting arbitrary token strings (e.g. very long or malformed) before hashing.

**Done:**
- [x] `sanitizeHexToken()` in `lib/utils/invite-token.ts` (64 hex chars only).
- [x] Used in `app/api/team/invite/validate/route.ts` and `app/api/auth/signup-invite/route.ts` (POST and PUT).
- [x] All DB access uses Supabase parameterized APIs (no raw SQL with user input).

---

## 2. Remote Code Execution

**Defense:** No `eval`, no shell commands, validated input.

**Current state:**
- Grep shows no `eval()`, `exec()`, `spawn`, `child_process`, or `Function()` in the codebase.

**Planned work:**
- [ ] **Confirm** no RCE vectors in dependencies or scripts (e.g. no `eval` in `scripts/` or config).
- [ ] **Add a short note** in this doc or in CONTRIBUTING: “Do not introduce eval, shell execution, or dynamic code execution on user input.”

**Files:** Documentation only (this file or CONTRIBUTING).

---

## 3. Email Enumeration

**Defense:** Generic “email sent” (or similar) response so attackers cannot infer whether an email exists or was sent.

**Current state:**
- **Signup** (`app/api/auth/signup/route.ts`): Returns different messages for “already been registered” vs success → **leaks existence**.
- **Resend verification** (`app/api/auth/resend-verification/route.ts`): Returns “Email is already verified”, “No email address found”, “Failed to send…” → **leaks state**.
- **Team invite** (`app/api/team/invite/route.ts`): Returns “An invitation has already been sent to this email” → **leaks existence**.

**Planned work:**
- [ ] **Signup:** On success and on “already registered”, return the same generic message, e.g. “If an account with that email exists, we’ve sent instructions. Please check your inbox.” Do not mention “already exists” in the API response (log internally if needed).
- [ ] **Resend verification:** Always return a generic success message when the request is valid (e.g. “If your email is unverified, we’ve sent a new link. Please check your inbox.”). Do not differentiate “already verified” or “no email” in the response (handle and log server-side).
- [ ] **Team invite:** On success and on “invitation already sent”, return the same generic message, e.g. “If that email is eligible, we’ve sent an invitation.”

**Files:** `app/api/auth/signup/route.ts`, `app/api/auth/resend-verification/route.ts`, `app/api/team/invite/route.ts`.

---

## 4. Token Brute Force

**Defense:** Rate limiting (e.g. 3 attempts per hour per IP or per identifier).

**Current state:**
- No rate limiting on token validation or token consumption.
- `POST /api/team/invite/validate` and `POST /api/auth/signup-invite` accept a token and can be brute-forced.

**Planned work:**
- [ ] **Introduce a small rate-limit layer** (e.g. in-memory store or Redis; for single-instance, in-memory is enough). Option: use a library such as `@upstash/ratelimit` or a simple custom helper keyed by IP (and optionally by token hash for consume endpoint).
- [ ] **Apply rate limit to:**
  - `POST /api/team/invite/validate`: e.g. 3 requests per hour per IP (or per IP + token prefix).
  - `POST /api/auth/signup-invite`: e.g. 3 requests per hour per IP (token consume).
- [ ] **Response:** On rate limit exceeded, return 429 with a message like “Too many attempts. Please try again later.”

**Files:** New `lib/rateLimit.ts` (or similar), `app/api/team/invite/validate/route.ts`, `app/api/auth/signup-invite/route.ts`. Optionally middleware if you want to centralize.

---

## 5. Email Spam

**Defense:** Rate limiting (e.g. 3 per hour) on endpoints that send email.

**Current state:**
- No rate limiting on signup, resend-verification, or team invite.

**Planned work:**
- [ ] **Apply rate limit (e.g. 3/hour per IP or per user where applicable):**
  - `POST /api/auth/signup` (sends verification email).
  - `POST /api/auth/resend-verification` (sends verification email).
  - `POST /api/team/invite` (sends invite email).
- [ ] **Response:** 429 with a message like “Too many requests. Please try again later.”

**Files:** Same rate-limit layer as above; `app/api/auth/signup/route.ts`, `app/api/auth/resend-verification/route.ts`, `app/api/team/invite/route.ts`.

---

## 6. bcrypt DoS

**Defense:** Max 128 character password limit (or 72 if strictly bcrypt-safe).

**Current state:**
- Signup and signup-invite only enforce minimum length (6). No maximum length.
- Supabase Auth may use bcrypt; very long passwords can be slow.

**Planned work:**
- [ ] **Enforce maximum password length** (e.g. 128 characters) in:
  - `app/api/auth/signup/route.ts`
  - `app/api/auth/signup-invite/route.ts` (POST and any PUT that sets password).
- [ ] **Reject with 400** and a clear message, e.g. “Password must be between 6 and 128 characters.”

**Files:** `app/api/auth/signup/route.ts`, `app/api/auth/signup-invite/route.ts`.

---

## 7. Null Byte Attack

**Defense:** Password validation rejects `\0`.

**Current state:**
- No explicit check for null bytes in password.

**Planned work:**
- [ ] **Reject passwords containing `\0`** in the same endpoints that validate length:
  - `app/api/auth/signup/route.ts`
  - `app/api/auth/signup-invite/route.ts` (POST and PUT that accept password).
- [ ] **Message:** e.g. “Invalid password.”

**Files:** `app/api/auth/signup/route.ts`, `app/api/auth/signup-invite/route.ts`.

---

## 8. XSS in Email

**Defense:** HTML email uses trusted templates and escapes any user-provided data.

**Current state:**
- Email HTML is built from templates in `lib/email/templates/`. 
- **Signup verification:** Only `verificationLink` and platform name/URL are interpolated; link is generated server-side → low XSS risk if URL is trusted.
- **Team invitation:** `inviterName`, `companyName`, `inviteeEmail`, `inviteLink`, `expiresAt` are interpolated. `inviterName` and `companyName` are from DB (user/admin editable) → **could be XSS if not escaped**.

**Done:**
- [x] `escapeHtml()` in `lib/email/utils.ts`. User/DB-sourced data escaped in team-invitation, approval-notification, company-join-request, and admin-notification templates.
- [x] All email HTML uses trusted templates and escapes dynamic content (see policy above).

---

## Summary Table

| Attack Type           | Defense                         | Status   | Main files |
|-----------------------|----------------------------------|----------|------------|
| SQL Injection         | sanitizeHexToken + parameterized | Done     | invite-token, validate, signup-invite |
| Remote Code Execution | No eval/shell, validated input   | Doc      | Policy in this doc |
| Email Enumeration     | Generic “email sent” response   | Plan     | signup, resend-verification, team invite |
| Token Brute Force     | Rate limiting (3/hour)          | Plan     | rateLimit, validate, signup-invite |
| Email Spam            | Rate limiting (3/hour)          | Plan     | rateLimit, signup, resend-verification, team invite |
| bcrypt DoS            | Max 128 char password           | Done     | signup, signup-invite |
| Null Byte Attack      | Reject `\0` in password         | Done     | signup, signup-invite |
| XSS in Email          | Trusted template + escape       | Done     | lib/email utils + templates |
| Open redirect         | isValidRedirectUrl in callback  | Done     | redirectUrl, callback, middleware |

---

## Suggested Implementation Order

1. **Low risk, high impact:** Password rules (max length 128, reject `\0`) and `sanitizeHexToken()`.
2. **Rate limiting:** Implement shared helper, then apply to token + email endpoints.
3. **Email enumeration:** Unify responses to generic messages.
4. **XSS in email:** Escape helper and template updates.
5. **Documentation:** RCE policy and email/template guidelines.

After implementation, run the linter and tests, and do a quick manual pass on signup, invite, and resend-verification flows.
