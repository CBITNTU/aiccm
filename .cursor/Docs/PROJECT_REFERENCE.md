# TNDRX Project Reference

> Curated quick-reference for development. Canonical source: [`CLAUDE.md`](../../CLAUDE.md) at project root.

---

## 1. Project Overview

**TNDRX** is a construction and consulting tender matching platform (UK-focused).

| Layer        | Technology                                        |
| ------------ | ------------------------------------------------- |
| **Frontend** | Next.js 16 + React 19 + TypeScript                |
| **UI**       | shadcn/ui + Radix UI + Tailwind CSS               |
| **Backend**  | Supabase (PostgreSQL + Auth) + Next.js API Routes |
| **Auth**     | @supabase/ssr (server-side)                       |
| **State**    | TanStack Query (React Query)                      |
| **Routing**  | Next.js App Router                                |
| **AI**       | OpenAI API (optional, user-provided key)          |
| **Maps**     | Leaflet                                           |

Key features:

- Tender matching with AI-powered recommendations
- Company onboarding and profile management
- Virtual Organization (VO) consulting project management
- CPV (Common Procurement Vocabulary) code-based taxonomy
- Geographic coverage analysis (UK-focused)
- Real-time tender feeds with OpenAI-powered analysis

---

## 2. Architecture Quick Reference

### Directory Structure

```
app/                        # Next.js App Router
├── api/                    # API Routes (server-side data access)
├── auth/                   # Login/signup page
├── (protected)/            # Route group for authenticated pages
│   ├── dashboard/          # Main dashboard
│   ├── tenders/            # Tender browsing and matching
│   ├── directory/          # Company directory
│   ├── vo/                 # Virtual Organization management
│   ├── profile/            # User profile
│   ├── onboarding/         # Company onboarding
│   ├── company/[companyId] # Company details
│   ├── pending-approval/   # User approval queue
│   └── admin/              # Admin pages

components/
├── ui/                     # shadcn/ui components (generated, don't manually edit)
├── layout/                 # Header, navigation
├── admin/                  # Admin-specific
├── company/                # Company-related
├── consulting/             # Consulting/VO
├── directory/              # Directory components
├── onboarding/             # Onboarding components
└── tenders/                # Tender-related

hooks/                      # Custom React hooks (queries + mutations)
├── useAuth.tsx             # Authentication
├── useTaxonomies.tsx       # Taxonomy data
├── useUserRole.tsx         # User role
├── useDashboard.ts         # Dashboard query
├── useMyCompanies.ts       # User's companies query
├── useDirectory.ts         # Company directory query
├── useTenders.ts           # Tender search query
├── useSavedTenders.ts      # Saved tenders query
├── useMatchingResults.ts   # Matching results query
├── useProfile.ts           # User profile query
├── useProjects.ts          # Projects query
├── useCompanyMutations.ts  # Company mutations
├── useTenderMutations.ts   # Tender mutations
├── useProjectMutations.ts  # Project mutations
├── useBatchProgress.ts     # Batch operation progress
└── useMatchingProgress.ts  # Matching progress polling

lib/
├── supabase/server.ts      # Server-side Supabase client
├── supabase/client.ts      # Client-side Supabase client (AUTH ONLY!)
├── api/index.ts            # apiResponse, apiError, createAdminClient
├── api/client.ts           # Typed API client for frontend (api.*)
├── api/validation.ts       # requireAuth, validateBody, handleApiError
├── queryKeys.ts            # Centralized React Query key factory
├── cpvCodes.ts             # CPV code taxonomy
└── utils.ts                # General utilities (cn(), etc.)

middleware.ts               # Auth middleware for route protection
supabase/migrations/        # Database migrations
```

### Critical Rules

1. **No direct Supabase from client components** -- All data queries go through Next.js API routes via `lib/api/client.ts`. The client-side Supabase client (`lib/supabase/client.ts`) is used **only for auth** (login, signup, session).
2. **API routes use `requireAuth()` + `createAdminClient()`** -- Every API route authenticates the user first, then uses an admin Supabase client for database access.
3. **TanStack Query for all client-side state** -- Query hooks in `hooks/` handle caching, refetching, and invalidation. Centralized key factory in `lib/queryKeys.ts`.
4. **Path alias `@/*`** maps to `./*` (project root).
5. **Always check for company existence** before redirecting to dashboard.

### Authentication Flow

- `middleware.ts` handles route protection at the edge
- `(protected)` route group contains all authenticated pages
- Server components: `createClient()` from `lib/supabase/server.ts`
- Client components: only `lib/supabase/client.ts` for auth operations (login, signup, session)

### Data Flow

```
Client Component
  → api.method() (lib/api/client.ts)
    → fetch("/api/endpoint")
      → API Route (app/api/*/route.ts)
        → requireAuth(request)
        → createAdminClient()
        → Supabase query
      ← apiResponse({ data })
    ← JSON response
  → TanStack Query cache
```

---

## 3. Development Patterns (Recipes)

### Adding a New Protected Page

1. Create `app/(protected)/[page-name]/page.tsx`
2. Add navigation link in `components/layout/Header.tsx`

### Adding a New API Endpoint

Create `app/api/[endpoint-name]/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { apiResponse, createAdminClient } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("table_name")
      .select("*")
      .eq("user_id", user.id);
    if (error) throw error;
    return apiResponse({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const body = await request.json();
    const supabase = createAdminClient();
    // Your logic here
    return apiResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
```

### Querying Supabase in a Server Component

```typescript
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("user_id", userId);
  // ...
}
```

### Using the API Client (Client Component)

```typescript
"use client";
import { api } from "@/lib/api/client";

const data = await api.getMyCompanies();
```

### Creating a Query Hook

```typescript
"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";

export function useDashboard(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.dashboard(userId!),
    queryFn: () => api.getDashboard(),
    enabled: !!userId,
    staleTime: 60 * 1000,
  });
}
```

### Creating a Mutation Hook with Cache Invalidation

```typescript
"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";

export function useUpdateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      companyId,
      updates,
    }: {
      companyId: string;
      updates: Record<string, unknown>;
    }) => api.updateCompany(companyId, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.company(variables.companyId),
      });
      queryClient.invalidateQueries({ queryKey: ["myCompanies"] });
      queryClient.invalidateQueries({ queryKey: ["directory"] });
    },
  });
}
```

### Adding a New Data Query (End-to-End)

1. Add API route in `app/api/[endpoint]/route.ts` using `requireAuth` + `createAdminClient`
2. Add typed method to the `api` object in `lib/api/client.ts`
3. Add query key to `lib/queryKeys.ts`
4. Create query hook in `hooks/use[Domain].ts` using `queryKeys` and `api`
5. If mutations are needed, create `hooks/use[Domain]Mutations.ts` with cache invalidation

### Cache Invalidation Best Practices

- Use partial key matching: `queryClient.invalidateQueries({ queryKey: ["myCompanies"] })` invalidates all keys starting with `["myCompanies"]`
- Always invalidate related queries (e.g., updating a company should also invalidate `["directory"]` and `["dashboard"]`)

### Adding a shadcn/ui Component

```bash
npx shadcn@latest add [component-name]
```

Installs into `components/ui/` -- do not manually edit unless customization is specifically needed.

---

## 4. Database Schema Summary

| Table                       | Purpose                                                                                                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **companies**               | Core company profiles. AI fields: `ai_capabilities`, `ai_competencies`, `ai_strengths`, `ai_recommendations`. Human override: `human_verified`. System data: `system_extracted` (Companies House). |
| **company_taxonomies**      | Many-to-many link between companies and CPV codes.                                                                                                                                                 |
| **tenders**                 | Tender opportunities: CPV codes, deadlines, contract values, status (active/expired/awarded).                                                                                                      |
| **tender_matching_results** | Computed matches between tenders and companies with scores and AI reasoning.                                                                                                                       |
| **vo_projects**             | Virtual Organization consulting projects. Status: planning -> active -> completed -> archived.                                                                                                     |
| **vo_project_companies**    | Many-to-many link between VO projects and companies (invitation status, roles).                                                                                                                    |

### CPV Taxonomy System

- Codes in `lib/cpvCodes.ts` with human-readable names
- Companies tagged with multiple CPV codes
- Matching uses CPV code overlap scoring
- Helpers: `getCpvCodeName()`, `formatCpvCode()`

---

## 5. Commands Reference

### Development

```bash
npm install              # Install dependencies
npm run dev              # Dev server at http://localhost:3000
npm run build            # Production build
npm run start            # Start production server
npm run lint             # ESLint
```

### Supabase

```bash
npm run supabase:start       # Start local Supabase
npm run supabase:stop        # Stop local Supabase
npm run supabase:db-push     # Push migrations locally
npm run supabase:link:prod   # Link to production (run once)
npm run supabase:db-push:prod # Push migrations to production
```

### Deployment

```bash
npm run deploy           # Deploy to Vercel preview
npm run deploy:prod      # Deploy to Vercel production
```

---

## 6. Environment Variables

### Local Development (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<local-service-role-key>
OPENAI_API_KEY=<your-openai-key>
RESEND_API_KEY=<your-resend-key>
PLATFORM_EMAIL_FROM="noreply@example.com"
PLATFORM_NAME="TNDRX Platform"
PLATFORM_URL=http://localhost:3000
```

### Production (`.env.production`)

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<production-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<production-service-role-key>
OPENAI_API_KEY=<your-openai-key>
RESEND_API_KEY=<your-resend-key>
PLATFORM_EMAIL_FROM="noreply@yourdomain.com"
PLATFORM_NAME="TNDRX Platform"
PLATFORM_URL=https://yourdomain.com
```

For Vercel deployment, configure environment variables in the Vercel dashboard.

### OpenAI Integration Notes

- API key provided by users through `OpenAIKeyDialog` component
- Stored in localStorage as `openai_api_key`
- Optional: app functions without it but lacks AI-powered analysis
- Used for: company analysis, tender matching reasoning, chatbot

---

## 7. Project Status & Priorities

> Source: `.cursor/Docs/PROJECT_STATUS.md` (December 2024 snapshot)

### Overall Completion: ~65%

| Section                                  | Status      | Completion |
| ---------------------------------------- | ----------- | ---------- |
| Sign-Up & Account Management             | Partial     | ~65%       |
| Company Onboarding & Profiling           | Complete    | ~95%       |
| Capability & Competence Mapping          | Partial     | ~70%       |
| Tender Aggregation & Analysis            | Partial     | ~75%       |
| Company Directory                        | Complete    | ~90%       |
| AI Matching Engine                       | Complete    | ~90%       |
| Collaboration & Consulting Team Building | Partial     | ~70%       |
| Cluster Management                       | Not Started | ~0%        |
| Search, Dashboards, and Transparency     | Partial     | ~80%       |

### Stakeholder Priorities

1. **User Management** -- Company member invitations, profile visibility, Google OAuth
2. **Admin Management** -- COMPLETE
3. **Taxonomy** -- COMPLETE
4. **Company Management** -- Profile completeness tracking, periodic re-checking, version history
5. **Tender Management** -- User publishing, email alerts, manual uploads, Contracts Finder & TED APIs
6. **Tender Matching** -- Real-time notifications, alert preferences, user feedback for training
7. **Teaming Function** -- PDF/JSON export, collaboration features, file storage

### Key Missing Features (for development planning)

**Priority 1 -- User Management:**

- Google OAuth Sign-In
- Profile visibility settings (public/private)
- Company member invitation system
- Multi-user company management

**Priority 4 -- Company Management:**

- Profile completeness tracking UI
- Periodic automatic data re-checking
- Profile version history UI

**Priority 5 -- Tender Management:**

- User tender publishing
- Tender alerts by email
- Manual upload UI (RSS/XML/CSV)
- Contracts Finder & TED APIs

**Priority 6 -- Tender Matching:**

- Real-time notifications
- Alert preferences
- User feedback for training

**Priority 7 -- Teaming Function:**

- PDF/JSON export
- Enhanced collaboration features
- File storage & sharing

**Not Started:**

- Cluster Management (entire section) -- cluster creation, dashboard, funding integration

### Known Issues

- Hardcoded company data in `src/components/AdminDataImport.tsx` (38 companies, only 8 imported)
- Sample tender data in SQL migrations (5 test tenders)
- Performance benchmark defaults in `supabase/functions/analyze-company/index.ts` (acceptable fallbacks)

---

## 8. Implementation Notes

### Styling

- Tailwind utility-first with CSS variables in `app/globals.css`
- shadcn/ui components use CSS variables for theming
- `cn()` utility from `lib/utils.ts` for conditional class merging
- No CSS modules or styled-components

### TypeScript

- Path alias `@/*` maps to `./*`
- Strict type checking enabled
- Types from `@supabase/supabase-js` (regenerate after schema changes)

### Routing (App Router)

- File-based routing in `app/`
- `(protected)` route group for authenticated pages
- `middleware.ts` for edge auth checks
- Dynamic routes: `[param]` folder naming (e.g., `company/[companyId]/`)

### Testing

- ESLint configured for Next.js
- No formal test suite (manual testing only)
