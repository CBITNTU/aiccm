# AI Tender Matching & Queue System - Implementation Plan

## Overview
Implement AI-powered tender matching with scoring, AI-generated summaries, dynamic capability taxonomies, and a robust queue system with rate limiting and exponential backoff.

## Current State Analysis

### Existing Infrastructure
1. **Database Tables:**
   - `tenders` - Basic tender info (title, description, buyer, budget, etc.)
   - `companies` - Company info with `ai_*` JSONB fields (not fully utilized)
   - `matching_results` - Stores scores but no queue tracking
   - `company_capabilities_ref` - Static capability reference list
   - `company_capabilities` - Junction table linking companies to capabilities

2. **Existing AI Features:**
   - `/api/match-tenders` - Basic matching without queue/rate limiting
   - `/api/analyze-tender` - Uses static taxonomy, not dynamic capabilities
   - `/api/suggest-capabilities` - Pre-selects capabilities for project wizard

3. **Missing Components:**
   - No queue system for background processing
   - No rate limiting (RPM/RPD/TPM guards)
   - No exponential backoff for 429 errors
   - No AI-generated summaries for tenders
   - No dynamic capability taxonomy generation
   - No company profile summary/taxonomy generation

### Grant-Matching Reference
- Uses `p-limit` for concurrency control
- `llmLimiter.ts` with RPM/RPD/TPM limits + exponential backoff
- Database-backed queue (`sync_state` table)
- Background processing with `sync.ts`
- Profile service generates taxonomy + summary
- Scoring service with weighted criteria

## Implementation Plan

### Phase 1: Core Infrastructure

#### 1.1 Database Schema Updates
**Migration: `add_ai_processing_tables.sql`**

```sql
-- Add AI summary and taxonomy fields to tenders
ALTER TABLE tenders ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE tenders ADD COLUMN IF NOT EXISTS ai_capability_taxonomy JSONB; -- Array of capability IDs
ALTER TABLE tenders ADD COLUMN IF NOT EXISTS taxonomy_generated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE tenders ADD COLUMN IF NOT EXISTS summary_generated_at TIMESTAMP WITH TIME ZONE;

-- Add AI summary and taxonomy fields to companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS ai_capability_taxonomy JSONB; -- Array of capability IDs
ALTER TABLE companies ADD COLUMN IF NOT EXISTS taxonomy_generated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS summary_generated_at TIMESTAMP WITH TIME ZONE;

-- Queue system table
CREATE TABLE IF NOT EXISTS processing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL, -- 'tender_summary', 'tender_taxonomy', 'company_summary', 'company_taxonomy', 'tender_matching'
  entity_type TEXT NOT NULL, -- 'tender' or 'company'
  entity_id UUID NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE, -- For matching jobs
  tender_id UUID REFERENCES tenders(id) ON DELETE CASCADE, -- For matching jobs
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  priority INTEGER DEFAULT 0, -- Higher = more urgent
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  error_message TEXT,
  result_data JSONB, -- Store results when job completes (e.g., scores, summaries)
  scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Track batch jobs (for progress tracking)
CREATE TABLE IF NOT EXISTS batch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_type TEXT NOT NULL, -- 'tender_ai_regeneration', 'company_matching'
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- Who triggered it
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE, -- For matching batches
  total_jobs INTEGER NOT NULL,
  completed_jobs INTEGER DEFAULT 0,
  failed_jobs INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'processing', -- 'processing', 'completed', 'failed'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_batch_jobs_user ON batch_jobs(user_id);
CREATE INDEX idx_batch_jobs_status ON batch_jobs(status);

CREATE INDEX idx_processing_queue_status ON processing_queue(status, priority DESC, scheduled_at);
CREATE INDEX idx_processing_queue_entity ON processing_queue(entity_type, entity_id);
CREATE INDEX idx_processing_queue_job_type ON processing_queue(job_type, status);

-- Sync state table (for tracking last runs)
CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  last_run_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB
);
```

#### 1.2 Rate Limiting & Queue Service
**File: `lib/services/llmLimiter.ts`** (Adapt from grant-matching)

- Port `llmLimiter.ts` from grant-matching
- Configure RPM/RPD/TPM limits via env vars
- Implement exponential backoff for 429 errors
- Use `p-limit` for concurrency control
- Export `runLLM()` wrapper function

**File: `lib/services/queueService.ts`** (New)

- Database-backed queue operations
- `enqueueJob()` - Add job to queue
- `enqueueBatch()` - Add multiple jobs and create batch tracking record
- `dequeueJob()` - Get next pending job
- `markJobProcessing()` - Update job status
- `markJobCompleted()` - Mark success, update batch progress
- `markJobFailed()` - Mark failure with retry logic, update batch progress
- `getQueueStats()` - Monitor queue health
- `getBatchStatus()` - Get progress for a batch job
- `getJobsByEntity()` - Get all jobs for a specific entity (for progress tracking)

### Phase 2: AI Services

#### 2.1 Tender AI Services
**File: `lib/services/tenderAIService.ts`** (New)

**Functions:**
1. `generateTenderSummary(tenderId: string)`
   - Fetch tender data
   - Call OpenAI with prompt to generate ~200-word summary
   - Store in `tenders.ai_summary`
   - Update `tenders.summary_generated_at`

2. `generateTenderCapabilityTaxonomy(tenderId: string)`
   - Fetch tender data (title, description, requirements, etc.)
   - Get existing `company_capabilities_ref` list
   - Call OpenAI to analyze tender and return:
     - Array of relevant capability IDs (from existing list)
     - Array of new capabilities to create (if needed)
   - Create new capabilities in `company_capabilities_ref` if suggested
   - Remove duplicates (case-insensitive matching)
   - Store capability IDs in `tenders.ai_capability_taxonomy` (JSONB array)
   - Update `tenders.taxonomy_generated_at`

#### 2.2 Company AI Services
**File: `lib/services/companyAIService.ts`** (New)

**Functions:**
1. `generateCompanySummary(companyId: string)`
   - Fetch company data (name, description, capabilities, past projects, etc.)
   - Call OpenAI to generate ~200-word summary
   - Store in `companies.ai_summary`
   - Update `companies.summary_generated_at`

2. `generateCompanyCapabilityTaxonomy(companyId: string)`
   - Fetch company data
   - Get existing `company_capabilities_ref` list
   - Call OpenAI to analyze company and return:
     - Array of relevant capability IDs (from existing list)
     - Array of new capabilities to create (if needed)
   - Create new capabilities in `company_capabilities_ref` if suggested
   - Remove duplicates (case-insensitive matching)
   - Store capability IDs in `companies.ai_capability_taxonomy` (JSONB array)
   - Update `companies.taxonomy_generated_at`

#### 2.3 Tender Matching Service
**File: `lib/services/tenderMatchingService.ts`** (New, adapt from grant-matching)

**Functions:**
1. `scoreTenderMatch(companyId: string, tenderId: string)`
   - Fetch company summary + taxonomy
   - Fetch tender summary + taxonomy
   - Call OpenAI to analyze match and provide:
     - Overall score (0-100)
     - Capability match score
     - Experience match score
     - Location match score
     - Certification match score
     - Match reasons (array of strings)
     - Improvement suggestions (array of strings)
     - AI analysis summary
   - Return structured score with breakdown
   - Store in `matching_results` table

2. `batchScoreTendersForCompany(companyId: string, tenderIds?: string[])`
   - Queue matching jobs for all open tenders (or specified ones)
   - Process via queue system

### Phase 3: Queue Worker System

#### 3.1 Queue Worker (Next.js API Route)
**File: `app/api/queue/worker/route.ts`** (New)

- Next.js API route that processes queue
- Can be called by:
  - Cron job (Vercel Cron, external cron service)
  - Manual trigger (admin endpoint)
  - Webhook (if needed)
- Polls `processing_queue` for pending jobs
- Routes to appropriate service based on `job_type`
- Handles retries with exponential backoff
- Updates job status throughout lifecycle
- Processes jobs in batches (configurable, default 10 at a time)

**Job Types:**
- `tender_summary` → `tenderAIService.generateTenderSummary()`
- `tender_taxonomy` → `tenderAIService.generateTenderCapabilityTaxonomy()`
- `company_summary` → `companyAIService.generateCompanySummary()`
- `company_taxonomy` → `companyAIService.generateCompanyCapabilityTaxonomy()`
- `tender_matching` → `tenderMatchingService.scoreTenderMatch()`

#### 3.2 API Endpoints for Queue Management

**File: `app/api/queue/worker/route.ts`** (New)
- Main worker endpoint to process queue
- Can be called by cron job or manually
- Processes pending jobs in batches
- Returns stats on completion

**File: `app/api/queue/stats/route.ts`** (New)
- Get queue statistics (pending, processing, failed counts)
- Public endpoint for monitoring

**File: `app/api/queue/retry-failed/route.ts`** (New)
- Retry failed jobs (admin only)
- Allows manual retry of specific jobs

**File: `app/api/queue/trigger/route.ts`** (New)
- Manual trigger to start queue processing
- Useful for testing or immediate processing

**File: `app/api/queue/job-status/route.ts`** (New)
- Get status of specific jobs or jobs for an entity
- Returns: pending count, processing count, completed count, failed count
- Returns: list of completed jobs with results
- Used for progress tracking in UI

**File: `app/api/admin/regenerate-tender-ai/route.ts`** (New)
- Admin-only endpoint
- Queues `tender_summary` and `tender_taxonomy` jobs for all tenders (or specified tender IDs)
- Returns job IDs for tracking
- Accepts optional `tenderIds` array to regenerate specific tenders

**File: `app/api/match-tenders/trigger/route.ts`** (New)
- User-triggered matching endpoint
- Queues `tender_matching` jobs for user's company
- Returns job IDs and initial status
- User can poll for completion

### Phase 4: Integration & Triggers

#### 4.1 Tender Import Integration
**Update: `app/api/fetch-uk-tenders/route.ts` & `app/api/fetch-ted-tenders/route.ts`**

- After importing new tenders (on sync), automatically queue:
  - `tender_summary` job for each new tender
  - `tender_taxonomy` job for each new tender
- Tenders are not editable, so no need to check for updates

#### 4.2 Company Update Integration
**Update: Company update flows (API routes, admin panel, CSV import)**

- After company creation, queue:
  - `company_summary` job
  - `company_taxonomy` job

- After company update, check if relevant fields changed:
  - If `description`, `key_capabilities`, `certifications`, `past_projects`, or `equipment` changed → queue regeneration
  - If `company_capabilities` (junction table) changed → queue regeneration
  - If only metadata changed (contact info, address) → skip regeneration

**Files to update:**
- `components/admin/AdminCSVImport.tsx` - Queue after import
- `app/api/company/update/route.ts` (if exists) - Check for relevant changes
- Any company profile update endpoints

#### 4.3 User-Triggered Matching
**Update: `app/api/match-tenders/route.ts`**

- Keep existing endpoint for backward compatibility
- Add new endpoint: `app/api/match-tenders/trigger/route.ts`
  - Queues `tender_matching` jobs for user's company
  - Returns job IDs and queue status
  - User can poll for completion

**New: `app/api/match-tenders/status/route.ts`**
- Check status of matching jobs for a company
- Returns:
  - Total jobs queued
  - Jobs completed
  - Jobs processing
  - Jobs failed
  - List of completed matches with scores
  - Estimated time remaining

### Phase 5: Frontend Updates

#### 5.1 Tender Display
- Show AI-generated summary on tender detail pages
- Display AI-generated capability taxonomy as badges

#### 5.2 Company Profile
- Show AI-generated summary on company profile
- Display AI-generated capability taxonomy

#### 5.3 Matching Results
- Enhanced matching results with:
  - AI-generated summary of match
  - Detailed score breakdown
  - Match reasons
  - Improvement suggestions

#### 5.4 Manual Sync Buttons & Progress Tracking

**Admin Panel - Tender AI Regeneration**
- **Location**: Admin dashboard or tender management page
- **Button**: "Regenerate All Tender AI Summaries" or "Regenerate Tender AI"
- **Functionality**:
  - Queues `tender_summary` and `tender_taxonomy` jobs for all tenders (or selected ones)
  - Shows progress bar with:
    - Total tenders to process
    - Currently processing
    - Completed count
    - Failed count
  - Real-time updates via polling

**User Profile - Trigger Matching**
- **Location**: User's company profile page or dashboard
- **Button**: "Find Matching Tenders" or "Update Tender Matches"
- **Functionality**:
  - Queues `tender_matching` jobs for user's company against all open tenders
  - Shows progress indicator:
    - "Analyzing tenders..." message
    - Progress bar: "X of Y tenders analyzed"
    - Estimated time remaining
    - Live score updates as matches complete
  - Real-time updates via polling
  - Redirect to results when complete

**Progress Tracking Implementation**:
- **API Endpoint**: `app/api/queue/job-status/route.ts`
  - Accepts batch ID or entity IDs
  - Returns current status, progress, and results
- **Polling Strategy**:
  - Poll every 2-3 seconds while processing
  - Show loading spinner + progress bar
  - Update UI incrementally as jobs complete
  - Stop polling when batch status is 'completed' or 'failed'
- **UI Components**:
  - `components/matching/MatchingProgress.tsx` - Progress bar component for user matching
    - Shows: "Analyzing X of Y tenders..."
    - Progress bar with percentage
    - Live score updates as matches complete
    - "View Results" button when complete
  - `components/admin/TenderAIRegeneration.tsx` - Admin regeneration UI
    - Button: "Regenerate All Tender AI"
    - Progress modal/dialog showing:
      - Total tenders
      - Currently processing
      - Completed
      - Failed
      - Progress bar
    - Can cancel/close and resume later
  - `hooks/useMatchingProgress.ts` - Hook for polling matching status
    - Polls `/api/match-tenders/status`
    - Returns: progress, completed matches, estimated time
  - `hooks/useBatchProgress.ts` - Generic hook for polling batch jobs
    - Polls `/api/queue/job-status`
    - Returns: progress, status, results

**User Experience Flow**:
1. User clicks "Find Matching Tenders" button
2. Button shows loading state, opens progress modal
3. Progress modal shows:
   - "Queuing jobs..." → "Processing X of Y tenders..." → "Complete!"
   - Progress bar fills as jobs complete
   - Live updates of top matches as they're scored
4. When complete, shows "View Results" button
5. Redirects to matching results page with new scores

## Technical Details

### Rate Limiting Configuration
```env
LLM_CONCURRENCY=2
LLM_RPM_LIMIT=500
LLM_RPD_LIMIT=10000
LLM_TPM_BUDGET=200000
```

### Queue Processing Strategy
1. **Priority System:**
   - User-triggered matching: priority 10
   - Tender taxonomy/summary: priority 5
   - Company taxonomy/summary: priority 3
   - Background sync: priority 1

2. **Retry Logic:**
   - Max 3 attempts per job
   - Exponential backoff: 1s, 2s, 4s
   - Respect `Retry-After` header from OpenAI

3. **Processing Order:**
   - Process by priority (desc), then scheduled_at (asc)
   - Limit concurrent jobs based on `LLM_CONCURRENCY`

### AI Prompt Strategy

#### Tender Summary Prompt
```
Generate a concise 200-word summary of this tender opportunity, highlighting:
- Key requirements and scope
- Budget range and timeline
- Ideal candidate profile
- Important deadlines and contact information
```

#### Tender Capability Taxonomy Prompt
```
Analyze this tender and identify relevant capabilities from the provided list.
Return a JSON array of capability IDs that are required or highly relevant.
You may also suggest NEW capabilities if the tender requires something not in the list.
If you suggest new capabilities, format them as: {"name": "Capability Name", "category": "Category Name"}
The system will create new capabilities and remove duplicates automatically.
```

#### Company Summary Prompt
```
Generate a concise 200-word professional summary of this company, covering:
- Core competencies and specializations
- Key achievements and past projects
- Certifications and qualifications
- Market position and strengths
```

#### Company Capability Taxonomy Prompt
```
Analyze this company's profile and identify relevant capabilities from the provided list.
Return a JSON array of capability IDs that accurately represent the company's capabilities.
You may also suggest NEW capabilities if the company has capabilities not in the list.
If you suggest new capabilities, format them as: {"name": "Capability Name", "category": "Category Name"}
The system will create new capabilities and remove duplicates automatically.
```

#### Matching Score Prompt
```
Evaluate how well this company matches this tender opportunity.
Provide an overall score (0-100) and individual scores for:
- Capability match
- Experience match  
- Location match
- Certification match
Include match reasons and improvement suggestions.
Return structured JSON with breakdown and recommendations.
```

## Migration Strategy

1. **Week 1: Infrastructure**
   - Create database migrations
   - Port `llmLimiter.ts`
   - Create `queueService.ts`
   - Set up basic queue worker
   - Create job status tracking endpoints

2. **Week 2: AI Services**
   - Implement tender AI services
   - Implement company AI services
   - Implement matching service
   - Test with sample data

3. **Week 3: Integration**
   - Integrate with tender import
   - Integrate with company updates
   - Update matching API
   - Add queue management endpoints
   - Add admin regeneration endpoint
   - Add user matching trigger endpoint

4. **Week 4: Frontend & Polish**
   - Update UI to show AI summaries
   - Add progress tracking components
   - Add admin regeneration button with progress
   - Add user matching button with progress
   - Add queue status indicators
   - Add admin queue dashboard
   - Performance testing and optimization

## Testing Strategy

1. **Unit Tests:**
   - Queue service operations
   - AI service functions (with mocks)
   - Rate limiter logic

2. **Integration Tests:**
   - End-to-end queue processing
   - AI service integration
   - Database operations

3. **Load Tests:**
   - Queue with 1000+ jobs
   - Rate limiting under load
   - Concurrent user requests

## Monitoring & Observability

1. **Queue Metrics:**
   - Jobs pending/processing/completed/failed
   - Average processing time
   - Retry rates

2. **AI Metrics:**
   - API call counts
   - Token usage
   - Error rates (429, 500, etc.)

3. **Alerts:**
   - Queue backlog > 1000 jobs
   - Failed job rate > 10%
   - Rate limit approaching

## Decisions Made

1. ✅ **Queue Worker**: Use Next.js API routes (easier migration path, no Supabase dependency)
2. ✅ **Capability Generation**: Can create new capabilities and automatically remove duplicates
3. ✅ **Scoring**: Simple scoring without complex weights (AI determines relevance naturally)

## Regeneration Frequency

**Tenders**: 
- Tenders are **not editable** - they can only be imported or deleted
- **Generate on sync/import**: When new tenders are imported, automatically queue:
  - `tender_summary` job
  - `tender_taxonomy` job
- **Manual refresh**: Allow admin to manually trigger regeneration if needed

**Companies**:
- Companies **are editable** - regenerate when relevant fields change:
  - `description` changes
  - `key_capabilities` changes
  - `certifications` changes
  - `company_capabilities` (junction table) changes
  - `past_projects` changes
  - `equipment` changes
- **On Update**: When any of these fields change, queue:
  - `company_summary` job
  - `company_taxonomy` job
- **Manual refresh**: Allow user/admin to manually trigger regeneration

**Matching Scores**:
- Regenerate when:
  - Company taxonomy changes
  - Tender taxonomy changes
  - User requests new matching

**Implementation**:
- Track which fields trigger regeneration (not all updates need regeneration)
- Use database triggers or application-level checks to detect relevant changes
- Provide "Regenerate AI Summary" button in UI for manual control

## Dependencies

- `p-limit` - Concurrency control
- `openai` - Already installed
- Database migrations for new tables/columns
- Environment variables for rate limits
