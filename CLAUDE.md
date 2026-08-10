# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TNDRX is a construction and consulting tender matching platform built with Next.js, React, TypeScript, PostgreSQL, Better-Auth, and Drizzle ORM. The application facilitates matching companies with relevant tenders, managing consulting projects (VO - Virtual Organizations), and providing AI-powered business intelligence.

Key features:

- Tender matching with AI-powered recommendations
- Company onboarding and profile management
- Virtual Organization (VO) consulting project management
- CPV (Common Procurement Vocabulary) code-based taxonomy
- Geographic coverage analysis (UK-focused)
- Real-time tender feeds with AI-powered analysis

## Development Commands

```bash
# Install dependencies
npm install

# Start development server (runs on http://localhost:3000)
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Lint the codebase
npm run lint
```

### Database Commands

```bash
# Local PostgreSQL (Docker)
npm run docker:up          # Start local PostgreSQL
npm run docker:down        # Stop local PostgreSQL

# Drizzle ORM
npm run db:generate        # Generate migrations from schema changes
npm run db:migrate         # Run migrations
npm run db:push            # Push schema directly (dev shortcut)
npm run db:studio          # Open Drizzle Studio (visual DB browser)
npm run db:reset-local:drizzle  # Reset local DB
```

## Architecture

### Tech Stack

- **Frontend**: Next.js 16 + React 19 + TypeScript
- **UI Framework**: shadcn/ui components + Radix UI primitives + Tailwind CSS
- **Backend**: PostgreSQL + Better-Auth + Drizzle ORM + Next.js API Routes
- **Auth**: Better-Auth with Drizzle adapter
- **ORM**: Drizzle ORM (node-postgres driver)
- **State Management**: TanStack Query (React Query)
- **Routing**: Next.js App Router
- **AI Integration**: Vercel AI SDK (`ai` package) with OpenAI, Google, and DeepSeek providers
- **Maps**: Leaflet

### Project Structure

```
app/                     # Next.js App Router
├── layout.tsx           # Root layout with providers
├── page.tsx             # Landing page
├── globals.css          # Global styles
├── api/                 # Next.js API Routes
│   ├── auth/
│   │   ├── [...all]/route.ts  # Better-Auth API handler
│   │   └── signup/route.ts    # Custom signup (creates profile + role)
│   └── queue/           # Job queue endpoints
│       ├── cron/route.ts      # Cron trigger for production
│       └── worker/route.ts    # Worker endpoint
├── auth/                # Authentication pages
│   └── page.tsx         # Login/signup page
├── (protected)/         # Route group for authenticated pages
│   ├── layout.tsx       # Protected layout with auth check
│   ├── dashboard/       # Main dashboard
│   ├── tenders/         # Tender browsing and matching
│   ├── directory/       # Company directory
│   ├── vo/              # Virtual Organization management
│   ├── profile/         # User profile
│   ├── onboarding/      # Company onboarding
│   ├── company/         # Company details ([companyId])
│   ├── pending-approval/# User approval queue
│   └── admin/           # Admin pages
├── not-found.tsx        # 404 page
├── error.tsx            # Error boundary
└── loading.tsx          # Loading states

components/              # React components
├── ui/                  # shadcn/ui components
├── layout/              # Layout components (Header, etc.)
├── admin/               # Admin-specific components
├── company/             # Company-related components
├── consulting/          # Consulting/VO components
├── directory/           # Directory components
├── onboarding/          # Onboarding components
└── tenders/             # Tender-related components

hooks/                   # Custom React hooks
├── useAuth.tsx          # Authentication hook
├── useTaxonomies.tsx    # Taxonomy data hook
├── useUserRole.tsx      # User role hook
├── useDashboard.ts      # Dashboard data query
├── useMyCompanies.ts    # User's companies query
├── useDirectory.ts      # Company directory query
├── useTenders.ts        # Tender search query
├── useSavedTenders.ts   # Saved/bookmarked tenders query
├── useMatchingResults.ts# Matching results query
├── useProfile.ts        # User profile query
├── useProjects.ts       # Projects query
├── useCompanyMutations.ts # Company update/analyze mutations
├── useTenderMutations.ts  # Tender matching/bookmark mutations
├── useProjectMutations.ts # Project CRUD mutations
├── useBatchProgress.ts  # Batch operation progress
└── useMatchingProgress.ts # Matching progress polling

lib/                     # Utilities
├── auth.ts              # Better-Auth server config
├── auth-client.ts       # Better-Auth client (signIn, signUp, signOut, useSession)
├── auth/
│   └── middleware.ts     # Session validation middleware
├── db/                  # Database (Drizzle ORM)
│   ├── index.ts         # Connection pool (pg) + Drizzle instance
│   ├── queries.ts       # Reusable query helpers
│   ├── raw.ts           # Raw SQL for complex queries
│   └── schema/          # Drizzle schema definitions
│       ├── auth.ts      # Better-Auth tables (user, session, account, verification)
│       ├── app.ts       # Application tables (companies, tenders, etc.)
│       └── index.ts     # Re-exports
├── ai/                  # AI integration
│   ├── generate.ts      # Rate-limited generateObject/generateText wrappers
│   ├── models.ts        # Model registry and resolution
│   └── provider.ts      # Platform model configuration
├── services/            # Business logic services
│   ├── queueService.ts  # Job queue (processing_queue table)
│   ├── jobProcessor.ts  # Job execution logic
│   ├── devQueuePoller.ts# Dev-mode auto-poller (started via instrumentation.ts)
│   ├── companyAIService.ts    # AI company analysis
│   └── tenderMatchingService.ts # AI tender matching
├── api/                 # API utilities
│   ├── index.ts         # apiResponse, apiError, getAuthenticatedUser, checkSuperadminRole
│   ├── client.ts        # Typed API client for frontend (api.*)
│   └── validation.ts    # requireAuth, validateBody, handleApiError helpers
├── queryKeys.ts         # Centralized React Query cache key factory
├── email/               # Email utilities (Resend)
├── cpvCodes.ts          # CPV code taxonomy
└── utils.ts             # General utilities

drizzle/                 # Drizzle ORM
├── migrations/          # Generated SQL migrations
└── drizzle.config.ts    # Drizzle Kit configuration (in project root)

instrumentation.ts       # Next.js instrumentation — starts dev queue poller
middleware.ts            # Auth middleware for route protection
```

### Key Architectural Patterns

**Authentication Flow**:

- Uses Better-Auth with `drizzleAdapter` for PostgreSQL
- `middleware.ts` calls `betterAuthUpdateSession()` from `lib/auth/middleware.ts`
- Session stored in `better-auth.session_token` cookie
- Plugins: `organization()`, `admin()`, `nextCookies()`
- Email/password auth with bcryptjs hashing, email verification via Resend
- Client-side: `authClient` from `lib/auth-client.ts` exports `signIn`, `signUp`, `signOut`, `useSession`
- `app/api/auth/[...all]/route.ts` handles Better-Auth API routes
- Custom signup at `app/api/auth/signup/route.ts` (creates profile + role)
- `(protected)` route group contains all authenticated pages

**Data Flow (Client-Side Architecture)**:

- **No direct database access from client components** — use the typed `api` client from `lib/api/client.ts`
- All data operations go through Next.js API routes (`app/api/`)
- API routes use `requireAuth()` for session validation (calls `auth.api.getSession()`) and `db` from `lib/db` for queries
- Authorization checks via helpers in `lib/api/validation.ts` (e.g., `isCompanyMember()`, `getUserCompanyIds()`) and `lib/db/queries.ts`
- TanStack Query hooks in `hooks/` handle caching, refetching, and cache invalidation
- Centralized query key factory in `lib/queryKeys.ts` ensures consistent cache keys
- Mutation hooks invalidate related query keys on success for automatic UI updates

**UI Component Pattern**:

- All UI components from shadcn/ui (installed via CLI, can be customized)
- Components use `@/` path alias (resolves to `./*` from root)
- Tailwind utility classes + CSS variables for theming
- `cn()` utility for conditional classname merging

**CPV Taxonomy System**:

- CPV codes stored in `cpvCodes.ts` with human-readable names
- Companies can be tagged with multiple CPV codes
- Tender matching uses CPV code overlap scoring
- Helper functions: `getCpvCodeName()`, `formatCpvCode()`

**Tender Matching Algorithm**:

- Matching based on CPV code overlap, location, and company capabilities
- AI analysis provides match reasoning and recommendations
- Results include match percentage, relevance score, and gap analysis

**Virtual Organization (VO) System**:

- Consulting projects combine multiple companies into teams
- Gap analysis identifies missing competencies
- Team builder suggests partner companies based on complementary skills
- Coverage maps show geographic distribution of team capabilities

### Database Schema

Schema is defined in Drizzle format under `lib/db/schema/`. Tables use snake_case in the database and camelCase in Drizzle TypeScript definitions.

**Auth tables** (`lib/db/schema/auth.ts` — managed by Better-Auth):

- `user`, `session`, `account`, `verification`

**App tables** (`lib/db/schema/app.ts`):

- **companies** — Core company profile data, AI-analyzed fields (`aiCapabilities`, `aiCompetencies`, `aiStrengths`, `aiRecommendations`), human verification, system-extracted data
- **companyTaxonomies** — Links companies to CPV codes (many-to-many)
- **companyMembers** — Team membership (owner, admin, member roles)
- **teamInvitations** — Pending team invitations
- **companyJoinRequests** — Requests to join a company
- **tenders** — Tender opportunities with CPV codes, deadlines, contract values, status
- **tenderMatchingResults** — Computed matches between tenders and companies
- **voProjects** — Virtual Organization consulting projects (planning → active → completed → archived)
- **voProjectCompanies** — Many-to-many link between VO projects and companies
- **processingQueue** — Job queue for async processing
- **batchJobs** — Batch operation tracking
- **events** — Event log
- **profiles** — User profiles with roles
- **performanceBenchmarks** — Company performance data

### Internationalization (i18n)

The app uses **`next-intl`** for all user-facing strings. Configuration lives in `i18n/request.ts`, the locale list in `i18n/locales.ts`, and translations in `messages/<locale>.json`.

- **Three locales are supported: English (`en`, default), Simplified Chinese (`zh-CN`), and Thai (`th`).** They are declared in `i18n/locales.ts` (`locales = ["en", "zh-CN", "th"]`). Do not add further locales unless explicitly asked.
- **Always keep all three locale files in sync.** Every user-facing key you add, rename, or remove must be applied to **all of** `messages/en.json`, `messages/zh-CN.json`, **and** `messages/th.json` — add the Simplified Chinese and Thai translations, never leave a key English-only or present in only some files. The three files must always have the exact same set of keys.
- **Any new feature must use `next-intl` for user-facing strings** — no hardcoded UI text. Add the key to all three locale files and read it via `useTranslations("Namespace")` in client components or `getTranslations("Namespace")` in server components. Whenever you develop a feature, translate every new string into Chinese (`zh-CN`) and Thai (`th`), not just English.
- **Namespacing**: group keys by component or feature name, matching the existing style in `en.json` (e.g. `Header`, `HeroSection`, `Onboarding`, `Auth`). Use the same namespace and key in every locale file.
- **Migration status** — only these areas have been migrated so far:
  - Landing page (`app/page.tsx`, `components/layout/HeroSection.tsx`, `components/layout/Header.tsx`)
  - Auth pages (`app/auth/**`)
  - Onboarding flow (`app/(protected)/onboarding/**`, `components/onboarding/**`)

  Other screens still contain hardcoded strings. When editing an unmigrated screen you don't need to migrate the whole file, but **any new strings you add must go through `next-intl` and `messages/en.json`**.

**Example (client component)**:

```tsx
"use client";
import { useTranslations } from "next-intl";

export function SaveButton() {
  const t = useTranslations("TenderActions");
  return <button>{t("save")}</button>;
}
```

And add the key to **all three** locale files:

```json
// messages/en.json
{
  "TenderActions": {
    "save": "Save tender"
  }
}
```

```json
// messages/zh-CN.json
{
  "TenderActions": {
    "save": "保存招标"
  }
}
```

```json
// messages/th.json
{
  "TenderActions": {
    "save": "บันทึกประกวดราคา"
  }
}
```

### Services & Job Queue

- `lib/services/queueService.ts` — enqueue/dequeue jobs from the `processingQueue` table
- `lib/services/jobProcessor.ts` — executes jobs (company analysis, tender matching, etc.)
- **Dev mode**: `instrumentation.ts` starts a polling loop (`lib/services/devQueuePoller.ts`) that processes jobs automatically
- **Production**: external cron hits `/api/queue/cron` which triggers `/api/queue/worker` to process pending jobs

### Environment Variables

**Local development** (`.env.local`):

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/tndrx
BETTER_AUTH_SECRET=<your-secret>
BETTER_AUTH_URL=http://localhost:3000
OPENAI_API_KEY=<your-openai-key>
RESEND_API_KEY=<your-resend-key>
PLATFORM_EMAIL_FROM="noreply@example.com"
PLATFORM_NAME="TNDRX Platform"
PLATFORM_URL=http://localhost:3000
```

**Production** (`.env.production`):

```
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<database>
BETTER_AUTH_SECRET=<production-secret>
BETTER_AUTH_URL=https://yourdomain.com
OPENAI_API_KEY=<your-openai-key>
RESEND_API_KEY=<your-resend-key>
PLATFORM_EMAIL_FROM="noreply@yourdomain.com"
PLATFORM_NAME="TNDRX Platform"
PLATFORM_URL=https://yourdomain.com
```

Note: For Vercel deployment, environment variables are configured in the Vercel dashboard.

### TypeScript Configuration

- Path alias `@/*` maps to `./*` (root directory)
- Strict type checking enabled
- Standard Next.js TypeScript configuration

### Important Implementation Notes

**AI Integration**:

- Uses Vercel AI SDK (`ai` package) with multiple providers: `@ai-sdk/openai`, `@ai-sdk/google`, `@ai-sdk/deepseek`
- API keys configured server-side via environment variables
- `lib/ai/generate.ts` provides rate-limited `aiGenerateObject()` and `aiGenerateText()` wrappers
- Used for: company analysis, tender matching reasoning, performance benchmarks

**Component Updates**:

- UI components in `components/ui/` are from shadcn/ui
- These can be regenerated or updated via shadcn CLI
- Do not manually edit unless customization is needed

**Routing (Next.js App Router)**:

- File-based routing in `app/` directory
- `(protected)` route group for authenticated pages
- `middleware.ts` handles auth checks at the edge
- Dynamic routes use `[param]` folder naming (e.g., `company/[companyId]/`)

**Styling Approach**:

- Tailwind utility-first
- CSS variables in `app/globals.css` for theming
- shadcn/ui components use CSS variables for consistent theming
- No global CSS modules or styled-components

### Common Development Patterns

**Adding a new protected page**:

1. Create a new folder in `app/(protected)/[page-name]/`
2. Add `page.tsx` in that folder
3. Add navigation link in `components/layout/Header.tsx`

**Adding a new API endpoint**:

1. Create a new folder in `app/api/[endpoint-name]/`
2. Add `route.ts` in that folder using the standard helpers

```typescript
import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api";
import { requireAuth, handleApiError } from "@/lib/api/validation";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const result = await db
      .select()
      .from(companies)
      .where(eq(companies.userId, user.id));
    return apiResponse({ companies: result });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const body = await request.json();
    // Your logic here using db.insert(), db.update(), etc.
    return apiResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
```

**Querying the Database (Server Component)**:

```typescript
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema/app";
import { eq } from "drizzle-orm";

export default async function Page() {
  const result = await db
    .select()
    .from(companies)
    .where(eq(companies.userId, userId));
  // ...
}
```

**Using the API client (Client Component)**:

```typescript
"use client";
import { api } from "@/lib/api/client";

// Direct API call (for one-off use)
const data = await api.getMyCompanies();
```

**Creating a query hook**:

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

**Creating a mutation hook with cache invalidation**:

```typescript
"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/queryKeys";

export function useUpdateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ companyId, updates }: { companyId: string; updates: Record<string, unknown> }) =>
      api.updateCompany(companyId, updates),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.company(variables.companyId) });
      queryClient.invalidateQueries({ queryKey: ["myCompanies"] });
      queryClient.invalidateQueries({ queryKey: ["directory"] });
    },
  });
}
```

**Adding a new data query (end-to-end)**:

1. Add API route in `app/api/[endpoint]/route.ts` using `requireAuth` + `db` from `lib/db`
2. Add typed method to the `api` object in `lib/api/client.ts`
3. Add query key to `lib/queryKeys.ts`
4. Create query hook in `hooks/use[Domain].ts` using `queryKeys` and `api`
5. If mutations are needed, create `hooks/use[Domain]Mutations.ts` with cache invalidation

**Cache invalidation after mutations**:

- Use partial key matching to invalidate all variants of a query: `queryClient.invalidateQueries({ queryKey: ["myCompanies"] })`
- This invalidates all keys starting with `["myCompanies"]` regardless of additional parameters
- Always invalidate related queries too (e.g., updating a company should invalidate `["directory"]` and `["dashboard"]`)

**Adding a shadcn/ui component**:

```bash
npx shadcn@latest add [component-name]
```

This installs the component into `components/ui/` and updates necessary dependencies.

### Testing & Quality

- ESLint configured for Next.js
- Vitest with two projects (`vitest.config.mts`):
  - **unit** — `__tests__/unit/**`; API route tests live flat in `__tests__/unit/api/` with descriptive names (e.g. `auth-signup.test.ts` for `app/api/auth/signup/route.ts`), lib tests mirror source paths under `__tests__/unit/lib/`; mocked at module seams (`@/lib/db`, `@/lib/ai`, `@/lib/auth`, `@/lib/email`); no DB/network. Run with `npm run test` (also part of `npm run check` and the pre-commit hook).
  - **integration** — `__tests__/integration/**`; real Postgres against a dedicated `tndrx_test` database on the local docker container (`npm run docker:up` first). Run with `npm run test:integration`. Global setup creates the DB (name must end in `_test`), enables pgvector, and pushes the schema.
- Shared test helpers in `__tests__/helpers/` (`makeRequest`, `readJson`, `routeParams`, mock data builders, `resetDb`)
- Tests use explicit vitest imports (no globals); Next 16 route handlers are invoked directly with a `NextRequest`, dynamic-route params passed as `Promise` via `routeParams()`
- Prefer partially mocking `@/lib/api/validation` via `importOriginal` (stub `requireAuth`/`isCompanyMember` only) so `handleApiError`/`validateBody` stay real

### Deployment

**Vercel Deployment**:

```bash
npm run deploy       # Deploy to Vercel preview
npm run deploy:prod  # Deploy to Vercel production
```

**Database Migrations**:

```bash
# Generate migration from schema changes
npm run db:generate

# Apply migrations to database
npm run db:migrate
```

**Manual Build**:

- Run `npm run build` to create production build
- Build artifacts in `.next/` directory

Note: Configure environment variables in Vercel dashboard before deploying.
