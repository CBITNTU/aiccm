# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AICCM is a construction and consulting tender matching platform built with React, TypeScript, Vite, and Supabase. The application facilitates matching companies with relevant tenders, managing consulting projects (VO - Virtual Organizations), and providing AI-powered business intelligence.

Key features:
- Tender matching with AI-powered recommendations
- Company onboarding and profile management
- Virtual Organization (VO) consulting project management
- CPV (Common Procurement Vocabulary) code-based taxonomy
- Geographic coverage analysis (UK-focused)
- Real-time tender feeds with OpenAI-powered analysis

## Migration Plan: Vite → Next.js

**IMPORTANT**: A new `web/` folder has been created with a Next.js application. The plan is to migrate all functionality from the current Vite + React + Lovable setup to Next.js.

Key points about the migration:
- The `web/` folder will undergo significant changes during this transition
- Expect frequent file movements and restructuring in `web/`
- The Supabase backend (`supabase/` folder and database) should remain unchanged
- The root-level Vite app (current implementation) will eventually be deprecated
- During the transition, both applications may coexist

When working on new features, clarify with the user whether to implement in:
- The existing Vite app (root `src/` folder)
- The new Next.js app (`web/` folder)

## Development Commands

```bash
# Install dependencies
npm i

# Start development server (runs on http://[::]:8080)
npm run dev

# Build for production
npm run build

# Build for development (with component tagging)
npm run build:dev

# Lint the codebase
npm run lint

# Preview production build
npm run preview
```

## Architecture

### Tech Stack
- **Frontend**: React 18 + TypeScript + Vite
- **UI Framework**: shadcn/ui components + Radix UI primitives + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Edge Functions)
- **State Management**: TanStack Query (React Query)
- **Routing**: React Router v6
- **AI Integration**: OpenAI API (client-side, optional user-provided key)
- **Maps**: Leaflet

### Project Structure

```
web/                     # Next.js application (migration in progress)
├── app/                 # Next.js App Router
└── [structure TBD]      # Will evolve during migration

src/                     # Vite + React application (current, will be deprecated)
├── components/           # React components
│   ├── ui/              # shadcn/ui components (auto-generated, Radix UI-based)
│   ├── consulting/      # VO project management components
│   └── [feature].tsx    # Feature-specific components
├── pages/               # Route pages
│   ├── Dashboard.tsx    # Main dashboard with company analytics
│   ├── Tenders.tsx      # Tender browsing and matching
│   ├── Consulting.tsx   # VO project management
│   ├── Companies.tsx    # Company directory
│   └── Admin*.tsx       # Admin pages
├── hooks/               # Custom React hooks
│   ├── useAuth.tsx      # Authentication context and hook
│   ├── useUserRole.tsx  # Role-based permissions
│   └── useTaxonomies.tsx # Taxonomy management
├── integrations/
│   └── supabase/        # Supabase client and types
│       ├── client.ts    # Configured Supabase client
│       └── types.ts     # Auto-generated database types
└── lib/
    ├── openai.ts        # OpenAI integration utilities
    ├── cpvCodes.ts      # CPV code mappings and helpers
    └── utils.ts         # General utilities (cn for classnames)

supabase/                # Backend (remains unchanged during migration)
├── migrations/          # Database migrations
└── functions/           # Supabase Edge Functions
```

### Key Architectural Patterns

**Authentication Flow**:
- Uses Supabase Auth with localStorage persistence
- `useAuth` hook provides global auth state via React Context
- `ProtectedRoute` component guards authenticated routes
- Auth state changes trigger redirect logic in components (not in useAuth hook)
- Always check for company existence before redirecting to dashboard

**Data Flow**:
- TanStack Query for server state management (caching, refetching)
- Supabase client for database operations
- Real-time subscriptions available but not widely used

**UI Component Pattern**:
- All UI components from shadcn/ui (installed via CLI, can be customized)
- Components use `@/` path alias (resolves to `./src/`)
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

Required in `.env`:
```
VITE_SUPABASE_URL=<your-supabase-url>
VITE_SUPABASE_PUBLISHABLE_KEY=<your-supabase-anon-key>
```

Optional (user can provide via UI):
- OpenAI API key (stored in localStorage, not in .env)

### TypeScript Configuration

- Path alias `@/*` maps to `./src/*`
- Relaxed strictness: `noImplicitAny: false`, `strictNullChecks: false`
- Allows JS files: `allowJs: true`

### Important Implementation Notes

**OpenAI Integration**:
- API key provided by users through `OpenAIKeyDialog` component
- Stored in localStorage as `openai_api_key`
- Optional feature: app functions without it but lacks AI-powered analysis
- Used for: company analysis, tender matching reasoning, chatbot

**Component Updates**:
- UI components in `src/components/ui/` are from shadcn/ui
- These can be regenerated or updated via shadcn CLI
- Do not manually edit unless customization is needed

**Supabase Types**:
- `src/integrations/supabase/types.ts` is auto-generated
- Regenerate after schema changes with Supabase CLI
- Import as `Database` type for type-safe queries

**React Router Setup**:
- Uses `<BrowserRouter>` in main.tsx
- All routes defined in App.tsx
- Protected routes wrap pages with `<ProtectedRoute>`

**Styling Approach**:
- Tailwind utility-first
- CSS variables in `src/index.css` for theming
- shadcn/ui components use CSS variables for consistent theming
- No global CSS modules or styled-components

### Common Development Patterns

**Adding a new protected page**:
1. Create page component in `src/pages/`
2. Add route in `src/App.tsx` wrapped in `<ProtectedRoute>`
3. Add navigation link in `src/components/Header.tsx`

**Querying Supabase**:
```typescript
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

const { data, error } = await supabase
  .from('companies')
  .select('*')
  .eq('user_id', userId);
```

**Using TanStack Query**:
```typescript
import { useQuery } from "@tanstack/react-query";

const { data, isLoading, error } = useQuery({
  queryKey: ['companies', userId],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;
    return data;
  },
});
```

**Adding a shadcn/ui component**:
```bash
npx shadcn@latest add [component-name]
```

This installs the component into `src/components/ui/` and updates necessary dependencies.

### Testing & Quality

- ESLint configured with React hooks and refresh plugins
- No formal test suite currently (manual testing)
- Lovable tagger plugin in development mode for component tracking

### Deployment

- Deployed via Lovable platform (auto-deploy on push to main)
- Can also deploy to any static hosting (Vercel, Netlify, etc.)
- Build artifacts in `dist/` directory
