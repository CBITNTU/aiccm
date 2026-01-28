# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TNDRX is a construction and consulting tender matching platform built with Next.js, React, TypeScript, and Supabase. The application facilitates matching companies with relevant tenders, managing consulting projects (VO - Virtual Organizations), and providing AI-powered business intelligence.

Key features:

- Tender matching with AI-powered recommendations
- Company onboarding and profile management
- Virtual Organization (VO) consulting project management
- CPV (Common Procurement Vocabulary) code-based taxonomy
- Geographic coverage analysis (UK-focused)
- Real-time tender feeds with OpenAI-powered analysis

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

### Supabase Commands

```bash
# Local development
npm run supabase:start    # Start local Supabase
npm run supabase:stop     # Stop local Supabase
npm run supabase:db-push  # Push migrations to local database

# Production
npm run supabase:link:prod   # Link to production Supabase project (run once)
npm run supabase:db-push:prod # Push migrations to production database
```

## Architecture

### Tech Stack

- **Frontend**: Next.js 16 + React 19 + TypeScript
- **UI Framework**: shadcn/ui components + Radix UI primitives + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth) + Next.js API Routes
- **Auth**: @supabase/ssr for server-side authentication
- **State Management**: TanStack Query (React Query)
- **Routing**: Next.js App Router
- **AI Integration**: OpenAI API (optional user-provided key)
- **Maps**: Leaflet

### Project Structure

```
app/                     # Next.js App Router
├── layout.tsx           # Root layout with providers
├── page.tsx             # Landing page
├── globals.css          # Global styles
├── api/                 # Next.js API Routes
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
├── useAuth.tsx
├── useTaxonomies.tsx
└── useUserRole.tsx

lib/                     # Utilities
├── supabase/            # Supabase client (browser + server)
│   ├── server.ts        # Server-side client
│   └── client.ts        # Client-side client
├── api/                 # API utilities
├── email/               # Email utilities
├── cpvCodes.ts          # CPV code taxonomy
└── utils.ts             # General utilities

supabase/                # Supabase backend (database only)
├── migrations/          # Database migrations
└── config.toml          # Supabase configuration

middleware.ts            # Auth middleware for route protection
```

### Key Architectural Patterns

**Authentication Flow**:

- Uses @supabase/ssr for server-side authentication
- `middleware.ts` handles route protection at the edge
- `(protected)` route group contains all authenticated pages
- Server components can access session via `createClient()` from `lib/supabase/server.ts`
- Client components use `createClient()` from `lib/supabase/client.ts`
- Always check for company existence before redirecting to dashboard

**Data Flow**:

- TanStack Query for server state management (caching, refetching)
- Supabase client for database operations
- Real-time subscriptions available but not widely used

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
- AI analysis (optional) provides match reasoning and recommendations
- Results include match percentage, relevance score, and gap analysis

**Virtual Organization (VO) System**:

- Consulting projects combine multiple companies into teams
- Gap analysis identifies missing competencies
- Team builder suggests partner companies based on complementary skills
- Coverage maps show geographic distribution of team capabilities

### Database Schema (Key Tables)

**companies**:

- Core company profile data
- AI-analyzed fields: `ai_capabilities`, `ai_competencies`, `ai_strengths`, `ai_recommendations`
- Human verification data: `human_verified` (overrides AI analysis)
- System-extracted data: `system_extracted` (from Companies House API)
- User-controlled flag: `is_system_company` (for admin-managed companies)

**company_taxonomies**:

- Links companies to CPV codes
- Many-to-many relationship

**tenders**:

- Tender opportunities data
- Includes CPV codes, deadlines, contract values
- Status tracking (active, expired, awarded)

**tender_matching_results**:

- Stores computed matches between tenders and companies
- Match scores, relevance percentages, AI-generated reasoning

**vo_projects**:

- Virtual Organization consulting projects
- Status workflow: planning → active → completed → archived
- Stores team composition and gap analysis results

**vo_project_companies**:

- Many-to-many link between VO projects and companies
- Tracks invitation status and roles

### Environment Variables

**Local development** (`.env.local`):

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

**Production** (`.env.production`):

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

Note: For Vercel deployment, environment variables are configured in the Vercel dashboard.

### TypeScript Configuration

- Path alias `@/*` maps to `./*` (root directory)
- Strict type checking enabled
- Standard Next.js TypeScript configuration

### Important Implementation Notes

**OpenAI Integration**:

- API key provided by users through `OpenAIKeyDialog` component
- Stored in localStorage as `openai_api_key`
- Optional feature: app functions without it but lacks AI-powered analysis
- Used for: company analysis, tender matching reasoning, chatbot

**Component Updates**:

- UI components in `components/ui/` are from shadcn/ui
- These can be regenerated or updated via shadcn CLI
- Do not manually edit unless customization is needed

**Supabase Types**:

- Types are imported from `@supabase/supabase-js`
- Regenerate after schema changes with Supabase CLI

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
2. Add `route.ts` in that folder with HTTP method handlers

```typescript
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  // Your logic here
  return NextResponse.json({ data: "result" });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();
  // Your logic here
  return NextResponse.json({ data: "result" });
}
```

**Querying Supabase (Server Component)**:

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

**Querying Supabase (Client Component)**:

```typescript
"use client";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();
const { data, error } = await supabase
  .from("companies")
  .select("*")
  .eq("user_id", userId);
```

**Using TanStack Query**:

```typescript
"use client";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

const { data, isLoading, error } = useQuery({
  queryKey: ["companies", userId],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .eq("user_id", userId);
    if (error) throw error;
    return data;
  },
});
```

**Adding a shadcn/ui component**:

```bash
npx shadcn@latest add [component-name]
```

This installs the component into `components/ui/` and updates necessary dependencies.

### Testing & Quality

- ESLint configured for Next.js
- No formal test suite currently (manual testing)

### Deployment

**Vercel Deployment**:

```bash
npm run deploy       # Deploy to Vercel preview
npm run deploy:prod  # Deploy to Vercel production
```

**Database Migrations**:

```bash
# First time: link to production Supabase project
npm run supabase:link:prod

# Push migrations to production
npm run supabase:db-push:prod
```

**Manual Build**:

- Run `npm run build` to create production build
- Build artifacts in `.next/` directory

Note: Configure environment variables in Vercel dashboard before deploying.
