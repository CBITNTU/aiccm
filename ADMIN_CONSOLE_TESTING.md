# Admin Console Testing Guide

## Overview
The Admin Console has been completely rewritten to use **real database queries** instead of hardcoded data. All statistics, metrics, and activity feeds are now dynamically calculated from the database.

## What Was Fixed

### ✅ Removed All Hardcoded Data
- **Before**: All stats were hardcoded (247 companies, 89 tenders, etc.)
- **After**: All stats are calculated from real database queries

### ✅ Real Statistics
- Total Companies (with week-over-week change)
- Active Tenders (with week-over-week change)
- Consulting Teams/Virtual Organizations (with week-over-week change)
- AI Extractions Today (with day-over-day change)
- Total Users (with week-over-week change)
- Total Matching Results (with week-over-week change)

### ✅ Onboarding Metrics
- Total Onboarded Companies
- Completed Profiles (with all required fields)
- Incomplete Profiles
- Completion Rate (percentage)
- Average Completion Time (placeholder for now)

### ✅ Data Quality Monitor
- Data Completeness Rate (percentage)
- Companies with Complete Data
- Companies with Incomplete Data
- AI Analysis Coverage
- Companies with/without AI Analysis

### ✅ Recent Activity Feed
- Real-time activity from:
  - Company onboardings
  - Tender publications
  - Virtual Organization formations
  - User registrations
- Sorted by most recent
- Shows relative time (e.g., "2 hours ago")

### ✅ Admin Access Protection
- Checks user role before allowing access
- Redirects non-admin users to dashboard
- Shows loading state while checking permissions

## How to Test

### Prerequisites
1. **Admin Account**: You need a user account with admin role
2. **Database Data**: The dashboard needs some data to display meaningful stats

### Step 1: Verify Admin Access

1. **Sign in as a regular user** (non-admin):
   ```
   - Navigate to /admin
   - Should see "Admin access required" error
   - Should be redirected to /dashboard
   ```

2. **Sign in as an admin user**:
   ```
   - Navigate to /admin
   - Should see the admin dashboard
   - Should NOT be redirected
   ```

### Step 2: Test Overview Tab

1. **Check Statistics Cards**:
   - All 4 main stat cards should show real numbers (not 247, 89, etc.)
   - Week-over-week changes should show with up/down arrows
   - Numbers should match your actual database counts

2. **Verify Calculations**:
   ```sql
   -- Run these queries in Supabase SQL Editor to verify:
   
   -- Total Companies
   SELECT COUNT(*) FROM companies;
   
   -- Active Tenders
   SELECT COUNT(*) FROM tenders WHERE status IN ('open', 'closing_soon', 'framework');
   
   -- Consulting Teams
   SELECT COUNT(*) FROM virtual_organizations;
   
   -- Total Users
   SELECT COUNT(*) FROM profiles;
   
   -- Matching Results
   SELECT COUNT(*) FROM matching_results;
   ```

3. **Check User Statistics Card**:
   - Should show total users
   - Should show total matches
   - Should show week-over-week changes

4. **Check Onboarding Metrics Card**:
   - Should show total onboarded companies
   - Should show completed vs incomplete profiles
   - Completion rate should be calculated correctly

5. **Check Data Quality Monitor**:
   - Data completeness rate should be a percentage (0-100%)
   - Should show counts of complete vs incomplete companies
   - Should show AI analysis coverage

6. **Check Recent Activity Feed**:
   - Should show real activities from database
   - Should be sorted by most recent
   - Should show relative timestamps ("2 hours ago", etc.)
   - Should include companies, tenders, projects, and users

### Step 3: Test Refresh Functionality

1. **Click the "Refresh" button** (top right):
   - Button should show spinning icon while refreshing
   - All stats should update with latest data
   - Should not show errors

2. **Add new data and refresh**:
   - Create a new company
   - Create a new tender
   - Refresh the admin dashboard
   - Stats should update to reflect new data

### Step 4: Test Other Tabs

1. **Companies Tab**:
   - Should show AdminDataImport component
   - Should show AdminCompanyManager component
   - Both should work as before

2. **Tenders Tab**:
   - Should show AdminTenderImport component
   - Should work as before

3. **Settings Tab**:
   - Should show placeholder message
   - (Future: Will have taxonomy editor, system settings, etc.)

### Step 5: Test Edge Cases

1. **Empty Database**:
   - If database is empty, all stats should show 0
   - No errors should occur
   - Recent activity should show "No recent activity"

2. **No Changes**:
   - If no changes in last week, change badges should not show
   - Or should show 0 change

3. **Loading States**:
   - Initial load should show loading spinner
   - Refresh should show spinning icon on button
   - Should not show errors during loading

## Expected Behavior

### ✅ What Should Work
- All stats show real database values
- Week-over-week changes are calculated correctly
- Recent activity shows real events
- Data quality metrics are accurate
- Refresh button updates all data
- Admin access is properly protected
- Loading states work correctly

### ⚠️ Known Limitations
- **Average Completion Time**: Currently a placeholder (0). Would need proper user_id joins to calculate accurately.
- **System Health**: Removed hardcoded system health section. Could be re-added with real monitoring if needed.
- **Performance**: With large datasets, queries might be slow. Consider adding pagination or caching if needed.

## Database Queries Used

The admin dashboard uses these Supabase queries:

1. **Company Counts**:
   ```typescript
   supabase.from('companies').select('*', { count: 'exact', head: true })
   ```

2. **Active Tenders**:
   ```typescript
   supabase.from('tenders')
     .select('*', { count: 'exact', head: true })
     .in('status', ['open', 'closing_soon', 'framework'])
   ```

3. **Virtual Organizations**:
   ```typescript
   supabase.from('virtual_organizations')
     .select('*', { count: 'exact', head: true })
   ```

4. **User Profiles**:
   ```typescript
   supabase.from('profiles')
     .select('*', { count: 'exact', head: true })
   ```

5. **Matching Results**:
   ```typescript
   supabase.from('matching_results')
     .select('*', { count: 'exact', head: true })
   ```

6. **AI Extractions Today**:
   ```typescript
   supabase.from('companies')
     .select('id', { count: 'exact', head: true })
     .not('ai_analysis', 'is', null)
     .gte('updated_at', todayStart.toISOString())
   ```

7. **Data Quality**:
   ```typescript
   supabase.from('companies')
     .select('id, description, key_capabilities, certifications, postcode, contact_email')
     .eq('status', 'active')
   ```

8. **Recent Activity**:
   ```typescript
   // Companies
   supabase.from('companies')
     .select('company_name, created_at, status')
     .order('created_at', { ascending: false })
     .limit(5)
   
   // Similar for tenders, projects, users
   ```

## Troubleshooting

### Issue: Stats show 0 or incorrect values
**Solution**: 
- Check if you have data in the database
- Verify RLS policies allow admin to read all data
- Check browser console for errors

### Issue: "Admin access required" even though you're admin
**Solution**:
- Verify your user has admin role in `user_roles` table:
  ```sql
  SELECT * FROM user_roles WHERE user_id = 'your-user-id';
  ```
- Check that `useUserRole` hook is working correctly
- Verify RLS policies allow reading user_roles

### Issue: Recent activity is empty
**Solution**:
- Check if there are recent companies, tenders, projects, or users
- Verify the queries are returning data
- Check browser console for errors

### Issue: Refresh button doesn't work
**Solution**:
- Check browser console for errors
- Verify network requests are completing
- Check if Supabase is accessible

## Next Steps (Future Enhancements)

1. **Add Caching**: Cache stats for better performance
2. **Add Real System Health**: Integrate with monitoring services
3. **Add Export Functionality**: Export stats as CSV/PDF
4. **Add Date Range Filters**: Allow filtering stats by custom date ranges
5. **Add Charts/Graphs**: Visualize trends over time
6. **Add Real-time Updates**: Use Supabase real-time subscriptions
7. **Add Average Completion Time**: Properly calculate with user_id joins
8. **Add More Analytics**: User engagement, tender matching success rates, etc.

---

**Last Updated**: 2025-01-XX
**Status**: ✅ All hardcoded data removed, real database queries implemented

