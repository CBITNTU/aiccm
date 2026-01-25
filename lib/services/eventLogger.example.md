# Event Logger Usage Examples

## Basic Usage

```typescript
import { logEvent, logApiEvent } from "@/lib/services/eventLogger";

// Simple event logging
await logEvent({
  actionType: "company_created",
  userId: user.id,
  userEmail: user.email,
  entityType: "company",
  entityId: company.id,
  details: {
    companyName: company.company_name,
  },
});

// From API routes (automatically extracts IP, user agent, etc.)
await logApiEvent(request, {
  actionType: "tender_viewed",
  userId: user.id,
  entityType: "tender",
  entityId: tenderId,
  details: {
    tenderTitle: tender.title,
  },
});
```

## Common Integration Points

### 1. Authentication Events
- `user_login` - When user logs in
- `user_logout` - When user logs out
- `user_signup` - When user signs up
- `user_email_verified` - When email is verified

### 2. Company Actions
- `company_created` - When company is created
- `company_updated` - When company is updated
- `company_capabilities_updated` - When capabilities change
- `company_member_invited` - When member is invited

### 3. Tender Actions
- `tender_viewed` - When tender is viewed
- `tender_bookmarked` - When tender is bookmarked
- `tender_applied` - When user applies to tender
- `tender_imported` - When admin imports tenders

### 4. Matching Actions
- `matching_triggered` - When user triggers matching
- `matching_completed` - When matching completes
- `matching_result_viewed` - When result is viewed

### 5. Admin Actions
- `admin_user_approved` - When admin approves user
- `admin_tender_imported` - When admin imports tenders
- `admin_tender_ai_regenerated` - When AI is regenerated

### 6. Error Logging
```typescript
await logEvent({
  actionType: "api_error",
  userId: user?.id,
  status: "error",
  errorMessage: error.message,
  details: {
    endpoint: "/api/something",
    errorStack: error.stack,
  },
});
```

## Querying Events

```sql
-- Get all events for a user
SELECT * FROM events 
WHERE user_id = 'user-id' 
ORDER BY created_at DESC;

-- Get events by action type
SELECT * FROM events 
WHERE action_type = 'company_created' 
ORDER BY created_at DESC;

-- Get events for a specific entity
SELECT * FROM events 
WHERE entity_type = 'company' 
AND entity_id = 'company-id';

-- Get error events
SELECT * FROM events 
WHERE status = 'error' 
ORDER BY created_at DESC;

-- Get events in date range
SELECT * FROM events 
WHERE created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
```
