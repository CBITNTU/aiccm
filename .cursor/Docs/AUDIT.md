# AI-CCM Project Audit

**Date:** January 2026  
**Scope:** Codebase health, security, conventions, testing, and alignment with Cursor rules/skills.

---

## 1. Executive Summary

| Area                    | Status     | Notes                                                              |
| ----------------------- | ---------- | ------------------------------------------------------------------ |
| **Architecture**        | ✅ Good    | Next.js 16, React 19, PostgreSQL, Better-Auth, Drizzle, clear app/api/components split |
| **Auth & API security** | ✅ Good    | requireAuth/getAuthenticatedUser used widely; admin checks present |
| **Input validation**    | ⚠️ Partial | Zod used in some routes; not all API routes validate body with Zod |
| **Event logging**       | ✅ Good    | Central eventLogger with typed actions; used in many routes        |
| **LLM usage**           | ✅ Good    | llmLimiter (concurrency, RPM, TPM); provider-agnostic AI helpers   |
| **Testing**             | ❌ Gap     | No Jest/Vitest config or test files found                          |
| **Cursor rules**        | ⚠️ New     | Rules created from this audit (see .cursor/rules/)                 |

---

## 2. Architecture & Stack

- **Framework:** Next.js 16.0.10, React 19.2.1, TypeScript 5.9
- **Backend:** PostgreSQL + Better-Auth + Drizzle ORM
- **UI:** shadcn/ui, Radix, Tailwind 4, Framer Motion
- **Data:** TanStack Query, `lib/api/client.ts` + hooks in `hooks/`
- **AI:** `ai` SDK, `llmLimiter`, provider-agnostic `aiGenerateObject`-style usage

**Strengths:** Single repo, clear separation (app, components, lib, hooks), CLAUDE.md and PROJECT_STATUS.md provide strong context.

---

## 3. Security

### 3.1 Authentication

- **API routes:** ~50+ routes use `getAuthenticatedUser` or `requireAuth` (from `lib/api` or `lib/api/validation`).
- **Admin routes:** Use `checkSuperadminRole` where needed (e.g. approve-user, admin companies).
- **Middleware:** Auth handled at edge via `middleware.ts` for protected routes.

### 3.2 Input Validation & Injection

- **Zod:** Used in `analyze-team`, `prefill-company-data`, and similar; `validateBody(request, schema)` in `lib/api/validation.ts`.
- **SSRF:** `validateUrl()` in validation.ts restricts URLs (HTTPS, no private IPs); used in prefill-company-data.
- **Sanitization:** `sanitizeTextInput()` exists; not used everywhere. No project-wide sanitization for all string inputs.
- **Drizzle:** Parameterized queries via ORM; no raw SQL string concatenation observed.

**Recommendation:** Use Zod (or validateBody) for every POST/PUT body and sanitize/validate query params and path params where they affect behavior.

### 3.3 Secrets & Env

- DATABASE_URL and BETTER_AUTH_SECRET used server-side only.
- No secrets in repo; `.env.local` in .gitignore. CLAUDE.md documents required env vars.

---

## 4. API Conventions

- **Helpers:** `apiResponse()`, `apiError()` from `lib/api`.
- **Errors:** `handleApiError()` and custom `AuthError`/`ValidationError` in validation.ts.
- **Event logging:** `logApiEvent(request, { actionType, userId, entityType, entityId, details })` used for many actions.

**Pattern:** Auth → validate input (Zod when possible) → business logic → log event → return apiResponse.

---

## 5. Testing

- **Current state:** No test runner (Jest/Vitest) or test files found in the repo.
- **Impact:** Refactors and API changes are not guarded by automated tests.

**Recommendation:** Introduce Vitest (or Jest) for at least API route tests and critical lib (e.g. validation, llmLimiter). Start with a few high-value routes (e.g. match-tenders, approve-user, prefill-company-data).

---

## 6. Code Quality

- **Lint:** ESLint (eslint-config-next). No TODO/FIXME/HACK counts run in this audit.
- **TypeScript:** Strict; Drizzle schema types from `lib/db/schema`.
- **Docs:** CLAUDE.md, PROJECT*STATUS.md, PROJECT_REFERENCE.md, EVENT_LOGGING*\*.md.

---

## 7. Cursor Rules Created

The following rules were added under `.cursor/rules/` to encode project patterns:

1. **api-conventions.mdc** – Use `apiResponse`/`apiError`, `requireAuth`, validate body with Zod, call `logApiEvent` for significant actions.
2. **typescript-standards.mdc** – Prefer `async/await`, typed errors, avoid `any`; use Drizzle schema types.
3. **react-patterns.mdc** – Functional components, hooks in `hooks/`, TanStack Query for server state, shadcn/ui for UI.

These keep AI assistance aligned with existing patterns and security expectations.

---

## 8. Action Items (Prioritized)

| Priority | Action                                                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------- |
| High     | Add Zod (or validateBody) to all API routes that accept JSON body.                                      |
| High     | Introduce a test suite (Vitest recommended) and add tests for critical API routes and lib.              |
| Medium   | Use `sanitizeTextInput` (or equivalent) for all user-facing string inputs that are stored or reflected. |
| Medium   | Update PROJECT_STATUS.md with latest completion % and any new features.                                 |
| Low      | Add rate limiting at API route level for sensitive endpoints (e.g. auth, match-tenders).                |

---

## 9. References

- **CLAUDE.md** – Main project guidance (stack, structure, patterns).
- **.cursor/Docs/PROJECT_STATUS.md** – Feature completion and priorities.
- **lib/api/validation.ts** – Auth, Zod, URL validation, sanitization.
- **lib/services/eventLogger.ts** – Event action types and logging.
- **lib/services/llmLimiter.ts** – LLM rate and concurrency limits.
