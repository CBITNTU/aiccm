# Hardcoded Data Report

## 🔴 CRITICAL: Extensive Hardcoded Data Found

This report documents all hardcoded/mock data found in the codebase that should be replaced with real database queries or dynamic calculations.

---

## 1. COMPANIES - HARDCODED ARRAY

### Location: `src/components/AdminDataImport.tsx`

**38 Hardcoded Companies** in `CONSTRUCTION_COMPANIES` array (lines 10-299)

```typescript
const CONSTRUCTION_COMPANIES = [
  {
    company_name: "Abbotsbury Contractors Limited",
    contact_phone: "01246 273806",
    description: "construction of new residential properties...",
    companies_house_number: "04948325",
    postcode: "S43 4UL"
  },
  // ... 37 more companies
];
```

**Impact:**
- These are the companies you see in the directory
- Only 8 companies showing = only 8 were imported from this array
- This is why the directory is limited

**Fix Required:**
- Remove hardcoded array
- Companies should come from database only
- Import should be from external source (CSV, API, etc.)

---

## 2. TENDERS - SAMPLE DATA IN MIGRATIONS

### Location: `supabase/migrations/20250916101852_*.sql` and `20251104111105_*.sql`

**5 Hardcoded Sample Tenders** inserted via SQL migrations (lines 232-256)

```sql
INSERT INTO public.tenders (reference_number, title, buyer, ...) VALUES
('TND-2024-001', 'Nottingham City Centre Infrastructure Upgrade', ...),
('TND-2024-002', 'Leicester Sports Complex Construction', ...),
('TND-2024-003', 'Derby Housing Development - Phase 2', ...),
('TND-2024-004', 'Lincoln Hospital Expansion', ...),
('TND-2024-005', 'Mansfield School Building Programme', ...);
```

**Impact:**
- These 5 tenders are seeded in the database
- If you see 162 tenders, they likely came from:
  - `fetch-uk-tenders` function (real API data)
  - OR there are more migrations with sample data
  - OR multiple runs of the import function

**Fix Required:**
- Remove sample tender inserts from migrations
- All tenders should come from API imports only
- Use `fetch-uk-tenders` function for real data

---

## 3. DASHBOARD - MOCK CHART DATA

### Location: `src/pages/Dashboard.tsx` (lines 202-238)

**Hardcoded Mock Data for Charts:**

```typescript
// Generate mock data for charts
const tendersByMonth = [{
  month: 'Jan',
  tenders: 45  // ❌ HARDCODED
}, {
  month: 'Feb',
  tenders: 52  // ❌ HARDCODED
}, {
  month: 'Mar',
  tenders: 67  // ❌ HARDCODED
}, {
  month: 'Apr',
  tenders: 58  // ❌ HARDCODED
}, {
  month: 'May',
  tenders: 72  // ❌ HARDCODED
}, {
  month: 'Jun',
  tenders: 84  // ❌ HARDCODED - This is why you see 84!
}];

const matchScoreDistribution = [{
  range: '90-100',
  count: 5,  // ❌ HARDCODED
  color: '#22c55e'
}, {
  range: '80-89',
  count: 12,  // ❌ HARDCODED
  color: '#3b82f6'
}, {
  range: '70-79',
  count: 18,  // ❌ HARDCODED
  color: '#f59e0b'
}, {
  range: '60-69',
  count: 8,  // ❌ HARDCODED
  color: '#ef4444'
}];
```

**Impact:**
- Charts show fake data, not real statistics
- The "84" you see in June tenders is hardcoded
- Match score distribution is completely fake

**Fix Required:**
- Calculate `tendersByMonth` from actual database queries grouped by month
- Calculate `matchScoreDistribution` from actual matching_results table
- Use real data aggregation

---

## 4. ADMIN DASHBOARD - ALL STATS HARDCODED

### Location: `src/pages/Admin.tsx` (lines 14-58)

**All Admin Stats are Hardcoded:**

```typescript
const overviewStats = [
  { 
    label: "Total Companies", 
    value: 247,  // ❌ HARDCODED
    change: +12,  // ❌ HARDCODED
  },
  { 
    label: "Active Tenders", 
    value: 89,  // ❌ HARDCODED
    change: +7,  // ❌ HARDCODED
  },
  { 
    label: "Consulting Teams", 
    value: 23,  // ❌ HARDCODED
    change: +3,  // ❌ HARDCODED
  },
  { 
    label: "AI Extractions Today", 
    value: 45,  // ❌ HARDCODED
    change: +8,  // ❌ HARDCODED
  },
];

const systemHealth = [
  { service: "Company Data Extraction", status: "Operational", uptime: 99.9 },  // ❌ HARDCODED
  { service: "Tender Matching Engine", status: "Operational", uptime: 99.7 },  // ❌ HARDCODED
  { service: "VO Composer", status: "Operational", uptime: 98.9 },  // ❌ HARDCODED
  { service: "CCM Tender Feed", status: "Issues", uptime: 95.2 },  // ❌ HARDCODED
  { service: "OpenAI API", status: "Operational", uptime: 99.8 },  // ❌ HARDCODED
];

const recentActivity = [
  { type: "Company", action: "Onboarded", entity: "Midlands Construction Ltd", time: "2 hours ago" },  // ❌ HARDCODED
  { type: "Tender", action: "Published", entity: "Leicester Sports Complex", time: "3 hours ago" },  // ❌ HARDCODED
  { type: "VO", action: "Formed", entity: "Nottingham Infrastructure Group", time: "5 hours ago" },  // ❌ HARDCODED
  { type: "System", action: "AI Model Updated", entity: "GPT-4 Turbo", time: "6 hours ago" },  // ❌ HARDCODED
];
```

**Impact:**
- Admin dashboard shows completely fake data
- No real insights into platform usage
- System health is fake
- Recent activity is fake

**Fix Required:**
- Query real counts from database:
  - `SELECT COUNT(*) FROM companies`
  - `SELECT COUNT(*) FROM tenders WHERE status = 'open'`
  - `SELECT COUNT(*) FROM virtual_organizations`
- Calculate changes from previous period
- Implement real system health monitoring
- Query actual recent activity from database

---

## 5. PERFORMANCE BENCHMARK - FALLBACK VALUES

### Location: `supabase/functions/analyze-company/index.ts` (lines 250-276)

**Hardcoded Fallback Analysis** (used when AI analysis fails):

```typescript
// Fallback analysis if parsing fails
analysis = {
  companyInfo: {},
  performanceBenchmark: {
    technicalExpertise: 70,  // ❌ HARDCODED
    safetyStandards: 70,  // ❌ HARDCODED
    innovation: 65,  // ❌ HARDCODED
    projectExperience: 70,  // ❌ HARDCODED
    certifications: 65,  // ❌ HARDCODED
    marketReputation: 70,  // ❌ HARDCODED
    financialHealth: 70,  // ❌ HARDCODED
    operationalCapacity: 70,  // ❌ HARDCODED
    overallScore: 69,  // ❌ HARDCODED - But you saw 84?
  },
  coreCompetencies: ["General construction"],  // ❌ HARDCODED
  digitalMaturity: "Not assessed yet",  // ❌ HARDCODED
  safetyRating: "Not assessed yet",  // ❌ HARDCODED
  marketPosition: "Not assessed yet",  // ❌ HARDCODED
  businessInsights: ["Analysis incomplete, please try again"],  // ❌ HARDCODED
  competitivePositioning: "Emerging Player",  // ❌ HARDCODED
  swotSummary: {
    strengths: ["Established presence"],  // ❌ HARDCODED
    weaknesses: ["Limited data"],  // ❌ HARDCODED
    opportunities: ["Market expansion"],  // ❌ HARDCODED
    threats: ["Competition"],  // ❌ HARDCODED
  },
  executiveSummary: "Analysis could not be completed.",  // ❌ HARDCODED
};
```

**Impact:**
- If AI analysis fails, you get fake scores (69/100)
- If you saw 84/100, the AI analysis likely succeeded
- But business insights might still be generic if AI response was incomplete

**Fix Required:**
- The fallback is acceptable for error cases
- BUT: Need to ensure AI analysis actually runs
- Need to validate AI response completeness
- Should show error state instead of fake data

---

## 6. BUSINESS INSIGHTS - AI GENERATED BUT FALLBACK EXISTS

### Location: `supabase/functions/analyze-company/index.ts`

**Status:** ✅ Business insights ARE generated by AI (lines 43-173)
**BUT:** ❌ Fallback has hardcoded values (line 267)

The AI prompt asks for:
- `businessInsights`: Array of strategic insights
- `swotSummary`: Strengths, weaknesses, opportunities, threats
- `executiveSummary`: Overall assessment

**If AI succeeds:** Real insights from company data
**If AI fails:** Hardcoded fallback values shown above

**Fix Required:**
- Ensure AI analysis always runs
- Better error handling if AI fails
- Show loading/error states instead of fake data

---

## 7. HERO SECTION STATS - REAL DATA ✅

### Location: `src/components/HeroSection.tsx` (lines 9-40)

**Status:** ✅ Uses real data from `get-platform-stats` function

```typescript
const { data } = await supabase.functions.invoke('get-platform-stats');
setRealStats({
  companies: data.companies || 0,
  tenders: data.tenders || 0,
  matches: data.matches || 0,
  projects: data.projects || 0
});
```

**This is GOOD** - uses real database counts.

---

## Summary of Hardcoded Data

| Component | Location | Type | Count | Status |
|-----------|----------|------|-------|--------|
| Companies | AdminDataImport.tsx | Hardcoded Array | 38 companies | ❌ CRITICAL |
| Tenders | Migration files | SQL INSERT | 5 tenders | ⚠️ Sample data |
| Dashboard Charts | Dashboard.tsx | Mock arrays | 2 charts | ❌ CRITICAL |
| Admin Stats | Admin.tsx | Hardcoded values | All stats | ❌ CRITICAL |
| Admin System Health | Admin.tsx | Hardcoded array | 5 services | ❌ CRITICAL |
| Admin Activity | Admin.tsx | Hardcoded array | 4 activities | ❌ CRITICAL |
| Performance Fallback | analyze-company | Hardcoded object | 1 fallback | ⚠️ Acceptable if error |
| Hero Stats | HeroSection.tsx | Real API call | ✅ GOOD | ✅ Real data |

---

## Why You're Seeing These Issues

1. **162 Tenders:** Likely from `fetch-uk-tenders` API (real data) + 5 sample tenders = 167 total
2. **84/100 Performance:** Either:
   - AI analysis succeeded and calculated 84
   - OR you're looking at the "Jun" month in the hardcoded chart (line 220)
3. **Only 8 Companies:** Only 8 of the 38 hardcoded companies were imported
4. **Business Insights:** Should be AI-generated, but if AI fails, shows hardcoded fallback

---

## Recommended Fixes (Priority Order)

### 🔴 CRITICAL - Fix Immediately

1. **Remove hardcoded companies array**
   - Delete `CONSTRUCTION_COMPANIES` from AdminDataImport.tsx
   - Companies should only come from database
   - Import should use CSV/API upload

2. **Fix Dashboard charts**
   - Replace mock data with real database queries
   - Aggregate tenders by month from database
   - Calculate match score distribution from matching_results

3. **Fix Admin Dashboard**
   - Replace all hardcoded stats with real database queries
   - Implement real system health monitoring
   - Query actual recent activity

### 🟡 IMPORTANT - Fix Soon

4. **Remove sample tenders from migrations**
   - Comment out or remove INSERT statements
   - All tenders should come from API imports

5. **Improve AI analysis error handling**
   - Show proper error states instead of fallback data
   - Log when AI analysis fails
   - Retry mechanism for failed analyses

---

## Files That Need Changes

1. `src/components/AdminDataImport.tsx` - Remove hardcoded companies
2. `src/pages/Dashboard.tsx` - Replace mock chart data with real queries
3. `src/pages/Admin.tsx` - Replace all hardcoded stats with real queries
4. `supabase/migrations/*.sql` - Remove sample tender inserts (or mark as optional)
5. `supabase/functions/analyze-company/index.ts` - Improve error handling

---

*Report generated: 2025-01-XX*
*All hardcoded data should be replaced with real database queries or API calls*

