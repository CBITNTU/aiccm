# AICCM

A construction and consulting tender matching platform built with Next.js, React, TypeScript, and Supabase. AICCM facilitates matching companies with relevant tenders, managing consulting projects (Virtual Organizations), and providing AI-powered business intelligence.

## Features

- **Tender Matching** - AI-powered recommendations matching companies to relevant tenders
- **Company Onboarding** - Profile management with AI-analyzed capabilities and competencies
- **Virtual Organization (VO) Management** - Consulting project management combining multiple companies into teams
- **CPV Taxonomy** - Common Procurement Vocabulary code-based classification system
- **Geographic Coverage** - UK-focused coverage analysis with map visualizations
- **AI Analysis** - OpenAI-powered tender feeds, company analysis, and chatbot

## Tech Stack

- **Framework**: Next.js 16 + React 19 + TypeScript
- **UI**: shadcn/ui + Radix UI + Tailwind CSS
- **Database & Auth**: Supabase (PostgreSQL + Auth)
- **State Management**: TanStack Query (React Query)
- **AI**: OpenAI API (optional, user-provided key)
- **Maps**: Leaflet

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- Supabase account (for database and authentication)

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd aiccm
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

Create a `.env.local` file for local development:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<local-service-role-key>
OPENAI_API_KEY=<your-openai-key>
RESEND_API_KEY=<your-resend-key>
PLATFORM_EMAIL_FROM="noreply@example.com"
PLATFORM_NAME="AICCM Platform"
PLATFORM_URL=http://localhost:3000
```

Create a `.env.production` file for production configuration:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<production-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<production-service-role-key>
```

4. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Project Structure

```
app/                # Next.js App Router (pages and API routes)
├── (protected)/    # Authenticated pages (dashboard, tenders, directory, etc.)
├── api/            # API endpoints
└── auth/           # Authentication pages

components/         # React components
├── ui/             # shadcn/ui components
└── layout/         # Layout components

hooks/              # Custom React hooks
lib/                # Utilities and Supabase clients
supabase/           # Database migrations
```

## Development

```bash
npm run dev       # Start development server
npm run build     # Build for production
npm run start     # Start production server
npm run lint      # Lint the codebase
```

### Supabase Commands

```bash
# Local development
npm run supabase:start    # Start local Supabase
npm run supabase:stop     # Stop local Supabase
npm run supabase:db-push  # Push migrations to local database

# Production
npm run supabase:link:prod    # Link to production project (run once)
npm run supabase:db-push:prod # Push migrations to production
```

## Deployment

### Vercel

```bash
npm run deploy       # Deploy to Vercel preview
npm run deploy:prod  # Deploy to Vercel production
```

Configure environment variables in the Vercel dashboard before deploying.

### Database Migrations

```bash
# First time: link to production Supabase project
npm run supabase:link:prod

# Push migrations to production
npm run supabase:db-push:prod
```

### Manual Build

```bash
npm run build
npm run start
```

Build artifacts are generated in the `.next/` directory.
