# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AICCM is a construction and consulting tender matching platform built with Next.js, React, TypeScript, and Supabase. The application facilitates matching companies with relevant tenders, managing consulting projects (VO - Virtual Organizations), and providing AI-powered business intelligence.

Key features:

- Tender matching with AI-powered recommendations
- Company onboarding and profile management
- Virtual Organization (VO) consulting project management
- CPV (Common Procurement Vocabulary) code-based taxonomy
- Geographic coverage analysis (UK-focused)
- Real-time tender feeds with OpenAI-powered analysis

## Project Status

**IMPORTANT**: The migration from Vite to Next.js is **COMPLETE**. All new features must be implemented in the `web/` folder.

Key points:

- The `web/` folder contains the active Next.js application
- The Supabase backend (`supabase/` folder and database) remains unchanged
- The root-level Vite app (`src/` folder) is **DEPRECATED** but kept for reference
- **ALL new features and changes should be made in `web/`**

## Development Commands

### Next.js App (web/ folder) - Use these for development

```bash
# Navigate to web folder
cd web

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

### Deprecated Vite App (root folder) - Reference only

```bash
# These commands run the deprecated Vite app from the root folder
npm i          # Install dependencies
npm run dev    # Start dev server (http://[::]:8080)
npm run build  # Build for production
npm run lint   # Lint the codebase
```

## Architecture

### Tech Stack

- **Frontend**: Next.js 16 + React 19 + TypeScript
- **UI Framework**: shadcn/ui components + Radix UI primitives + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Edge Functions)
- **Auth**: @supabase/ssr for server-side authentication
- **State Management**: TanStack Query (React Query)
- **Routing**: Next.js App Router
- **AI Integration**: OpenAI API (optional user-provided key)
- **Maps**: Leaflet

### Project Structure

```
web/                     # Next.js application (ACTIVE - use this for development)
├── app/                 # Next.js App Router
│   ├── layout.tsx       # Root layout with providers
│   ├── page.tsx         # Landing page
│   ├── auth/            # Authentication pages
│   │   └── page.tsx     # Login/signup page
│   ├── (protected)/     # Route group for authenticated pages
│   │   ├── layout.tsx   # Protected layout with auth check
│   │   ├── dashboard/   # Main dashboard
│   │   ├── tenders/     # Tender browsing and matching
│   │   ├── directory/   # Company directory
│   │   ├── vo/          # Virtual Organization management
│   │   ├── profile/     # User profile
│   │   ├── onboarding/  # Company onboarding
│   │   ├── company/     # Company details ([companyId])
│   │   └── admin/       # Admin pages
│   ├── not-found.tsx    # 404 page
│   ├── error.tsx        # Error boundary
│   └── loading.tsx      # Loading states
├── components/          # React components
│   ├── ui/              # shadcn/ui components
│   └── layout/          # Layout components (Header, etc.)
├── hooks/               # Custom React hooks
├── lib/                 # Utilities
│   ├── supabase/        # Supabase client (browser + server)
│   └── utils.ts         # General utilities
└── middleware.ts        # Auth middleware for route protection

src/                     # DEPRECATED - Vite + React app (kept for reference)
├── components/          # React components
├── pages/               # Route pages
├── hooks/               # Custom React hooks
├── integrations/        # Supabase client and types
└── lib/                 # Utilities

supabase/                # Backend (shared between both apps)
├── migrations/          # Database migrations
└── functions/           # Supabase Edge Functions
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
- Components use `@/` path alias (resolves to `./web/` in Next.js app)
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

Required in `web/.env.local` for Next.js app:

```
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

Deprecated (for old Vite app in root `.env`):

```
VITE_SUPABASE_URL=<your-supabase-url>
VITE_SUPABASE_PUBLISHABLE_KEY=<your-supabase-anon-key>
```

Optional (user can provide via UI):

- OpenAI API key (stored in localStorage, not in .env)

### TypeScript Configuration

**Next.js app (`web/`):**

- Path alias `@/*` maps to `./web/*`
- Standard Next.js TypeScript configuration

**Deprecated Vite app (root):**

- Path alias `@/*` maps to `./src/*`
- Relaxed strictness: `noImplicitAny: false`, `strictNullChecks: false`

### Important Implementation Notes

**OpenAI Integration**:

- API key provided by users through `OpenAIKeyDialog` component
- Stored in localStorage as `openai_api_key`
- Optional feature: app functions without it but lacks AI-powered analysis
- Used for: company analysis, tender matching reasoning, chatbot

**Component Updates**:

- UI components in `web/components/ui/` are from shadcn/ui
- These can be regenerated or updated via shadcn CLI
- Do not manually edit unless customization is needed

**Supabase Types**:

- Types are imported from `@supabase/supabase-js`
- Regenerate after schema changes with Supabase CLI

**Routing (Next.js App Router)**:

- File-based routing in `web/app/` directory
- `(protected)` route group for authenticated pages
- `middleware.ts` handles auth checks at the edge
- Dynamic routes use `[param]` folder naming (e.g., `company/[companyId]/`)

**Styling Approach**:

- Tailwind utility-first
- CSS variables in `web/app/globals.css` for theming
- shadcn/ui components use CSS variables for consistent theming
- No global CSS modules or styled-components

### Common Development Patterns

**Adding a new protected page**:

1. Create a new folder in `web/app/(protected)/[page-name]/`
2. Add `page.tsx` in that folder
3. Add navigation link in `web/components/layout/Header.tsx`

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
cd web
npx shadcn@latest add [component-name]
```

This installs the component into `web/components/ui/` and updates necessary dependencies.

### Testing & Quality

- ESLint configured for Next.js
- No formal test suite currently (manual testing)

### Deployment

- Next.js app can be deployed to Vercel, Netlify, or any Node.js hosting
- Build artifacts in `web/.next/` directory
- Run `npm run build` in `web/` folder to create production build
