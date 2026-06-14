# AICCM

A construction and consulting tender matching platform built with Next.js, React, TypeScript, PostgreSQL, Better-Auth, and Drizzle ORM. AICCM facilitates matching companies with relevant tenders, managing consulting projects (Virtual Organizations), and providing AI-powered business intelligence.

## Features

- **Tender Matching** - AI-powered recommendations matching companies to relevant tenders
- **Company Onboarding** - Profile management with AI-analyzed capabilities and competencies
- **Virtual Organization (VO) Management** - Consulting project management combining multiple companies into teams
- **CPV Taxonomy** - Common Procurement Vocabulary code-based classification system
- **Geographic Coverage** - UK-focused coverage analysis with map visualizations
- **AI Analysis** - Multi-provider AI (OpenAI, Google, DeepSeek) for company analysis and tender matching

## Tech Stack

- **Framework**: Next.js 16 + React 19 + TypeScript
- **UI**: shadcn/ui + Radix UI + Tailwind CSS
- **Database**: PostgreSQL (via Docker locally)
- **Auth**: Better-Auth
- **ORM**: Drizzle ORM
- **State Management**: TanStack Query (React Query)
- **AI**: Vercel AI SDK with OpenAI, Google, and DeepSeek providers
- **Maps**: Leaflet

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- Docker (for local PostgreSQL)

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
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/tndrx
BETTER_AUTH_SECRET=<your-secret>
BETTER_AUTH_URL=http://localhost:3000
OPENAI_API_KEY=<your-openai-key>
RESEND_API_KEY=<your-resend-key>
PLATFORM_EMAIL_FROM="noreply@example.com"
PLATFORM_NAME="AICCM Platform"
PLATFORM_URL=http://localhost:3000
```

4. Start the local database:

```bash
npm run docker:up
npm run db:push
```

5. Run the development server:

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
lib/                # Database, auth, and utilities
drizzle/            # Database migrations
```

## Development

```bash
npm run dev       # Start development server
npm run build     # Build for production
npm run start     # Start production server
npm run lint      # Lint the codebase
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
npm run db:studio          # Open Drizzle Studio
npm run db:reset-local:drizzle  # Reset local DB
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
# Generate migration from schema changes
npm run db:generate

# Apply migrations to database
npm run db:migrate
```

### Manual Build

```bash
npm run build
npm run start
```

Build artifacts are generated in the `.next/` directory.

## Documentation

| Topic | Doc |
|-------|-----|
| TED (EU) notice links & backfill | [docs/ted-notice-links.md](docs/ted-notice-links.md) |
| Admin tender sync testing | [docs/testing-admin-tender-sync.md](docs/testing-admin-tender-sync.md) |
