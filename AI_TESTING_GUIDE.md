# AI Testing Guide - Where to Find the Buttons

## 🎯 User Dashboard - AI Analysis & Matching

### Location: `/dashboard` page

#### 1. **Company Performance Analysis** (AI Analysis)
- **Location**: Dashboard → "Company Performance Benchmark" card (top section)
- **Button**: "Analyze" or "Re-analyze" button (top right of the card)
- **What it does**: 
  - Analyzes your company profile
  - Generates performance benchmark scores
  - Creates AI summary and taxonomy
  - Shows radar chart with scores
- **How to test**:
  1. Go to `/dashboard`
  2. Select a company (if you have multiple)
  3. Look for the "Company Performance Benchmark" card
  4. Click "Analyze" button
  5. Wait for analysis to complete (shows "Analyzing..." while processing)
  6. View the results: radar chart, executive summary, scores

#### 2. **Find Matching Tenders** (AI Matching)
- **Location**: Dashboard → "Recent Matches" section (bottom of page)
- **Button**: "Find Matching Tenders" button (top right of Recent Matches card)
- **What it does**:
  - Triggers AI matching for all open tenders
  - Scores your company against each tender
  - Shows progress bar with real-time updates
  - Displays top matches as they complete
- **How to test**:
  1. Go to `/dashboard`
  2. Scroll to "Recent Matches" section
  3. Click "Find Matching Tenders" button
  4. Dialog opens showing progress
  5. Watch progress bar update in real-time
  6. See top matches appear as they complete

## 🔧 Admin Panel - Tender AI Regeneration

### Location: `/admin` page → "Tenders" tab

#### **Regenerate All Tender AI**
- **Location**: Admin → Tenders tab → Top of the page
- **Button**: "Regenerate All Tender AI" button (next to "Tender Management" heading)
- **What it does**:
  - Regenerates AI summaries for all tenders
  - Regenerates capability taxonomies for all tenders
  - Queues jobs for background processing
  - Shows progress with batch status
- **How to test**:
  1. Go to `/admin` (must be superadmin)
  2. Click "Tenders" tab
  3. Look for "Regenerate All Tender AI" button at the top
  4. Click the button
  5. Dialog opens showing progress
  6. Watch progress bar as jobs complete
  7. See completion status

## 📍 Visual Guide

### Dashboard Layout:
```
┌─────────────────────────────────────┐
│ Dashboard                          │
├─────────────────────────────────────┤
│ [Company Selector]                  │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Company Performance Benchmark  │ │
│ │                    [Analyze] ←──┼─┼─ Button #1
│ │ [Radar Chart]                   │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Recent Matches                  │ │
│ │ [Find Matching Tenders] ←────────┼─┼─ Button #2
│ │ [View All]                      │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### Admin Panel Layout:
```
┌─────────────────────────────────────┐
│ Admin Panel                         │
├─────────────────────────────────────┤
│ [Overview] [Tenders] [Users] ...    │
│                                     │
│ Tender Management                   │
│ [Regenerate All Tender AI] ←────────┼─ Button #3
│                                     │
│ [Tender Import Section]             │
└─────────────────────────────────────┘
```

## 🧪 Testing Checklist

### For Users:
- [ ] Go to `/dashboard`
- [ ] Verify company is selected
- [ ] Click "Analyze" button in Performance Benchmark card
- [ ] Wait for analysis to complete
- [ ] Verify radar chart appears with scores
- [ ] Click "Find Matching Tenders" button
- [ ] Verify progress dialog opens
- [ ] Watch progress bar update
- [ ] Verify matches appear as they complete

### For Admins:
- [ ] Go to `/admin` (must be superadmin)
- [ ] Click "Tenders" tab
- [ ] Find "Regenerate All Tender AI" button
- [ ] Click button
- [ ] Verify dialog opens with progress
- [ ] Watch jobs complete
- [ ] Verify success message

## 🔍 What Happens Behind the Scenes

### When you click "Analyze" (Company):
1. Calls `/api/analyze-company`
2. Fetches company data
3. Sends to OpenAI for analysis
4. Generates performance benchmark
5. Updates company record with analysis
6. Displays results in UI

### When you click "Find Matching Tenders":
1. Calls `/api/match-tenders/trigger`
2. Queues matching jobs for all open tenders
3. Background worker processes jobs
4. Each job scores company vs tender
5. Results saved to `matching_results` table
6. Progress updates in real-time

### When admin clicks "Regenerate All Tender AI":
1. Calls `/api/admin/regenerate-tender-ai`
2. Fetches all tenders
3. Queues 2 jobs per tender (summary + taxonomy)
4. Background worker processes jobs
5. Updates tender records with AI data
6. Progress tracked by batch ID

## ⚠️ Troubleshooting

### Button not showing?
- **Dashboard**: Make sure you have a company selected
- **Admin**: Make sure you're logged in as superadmin
- **Matching**: Make sure you have an active company

### Analysis not working?
- Check browser console for errors
- Verify OpenAI API key is set in `.env.local`
- Check network tab for API call failures
- Verify you have tenders in the database (for matching)

### Progress not updating?
- Check that queue worker is running
- Verify `/api/queue/worker` endpoint is accessible
- Check browser console for polling errors

## 🚀 Quick Test Commands

```bash
# Check if queue worker endpoint works
curl -X POST http://localhost:3000/api/queue/worker \
  -H "Content-Type: application/json" \
  -d '{"batchSize": 1}'

# Check queue stats
curl http://localhost:3000/api/queue/stats
```

## 📝 Notes

- **Queue Worker**: The queue worker needs to be called periodically. You can:
  - Set up a cron job
  - Use Vercel Cron
  - Call it manually for testing
  - Set up a background service

- **Rate Limiting**: AI calls are rate-limited to prevent 429 errors
- **Progress Updates**: Progress bars poll every 2.5 seconds
- **Error Handling**: Errors are logged but don't break the UI
