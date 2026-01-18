# Event Logging Guide

## Rule: ALL API endpoints MUST log events

Every API endpoint should log events for:
- Success cases
- Error cases
- Important state changes

## Quick Integration

### Option 1: Manual Logging (Recommended for specific actions)

```typescript
import { logApiEvent } from "@/lib/services/eventLogger";

// In your route handler:
await logApiEvent(request, {
  actionType: "company_created", // Use predefined action types
  userId: user.id,
  userEmail: user.email || undefined,
  entityType: "company",
  entityId: company.id,
  details: {
    companyName: company.company_name,
    // Add relevant context
  },
});
```

### Option 2: Automatic Logging Wrapper (For simple endpoints)

```typescript
import { withEventLogging } from "@/lib/middleware/withEventLogging";

export const POST = withEventLogging(
  async (request: NextRequest) => {
    // Your handler code
    return NextResponse.json({ success: true });
  },
  { actionType: "custom_action" }
);
```

## Action Types

Use these predefined action types from `lib/services/eventLogger.ts`:

### Authentication
- `user_login`
- `user_logout`
- `user_signup`
- `user_email_verified`
- `password_reset_requested`
- `password_reset_completed`

### Company Actions
- `company_created`
- `company_updated`
- `company_deleted`
- `company_capabilities_updated`
- `company_member_invited`
- `company_member_approved`
- `company_member_removed`

### Tender Actions
- `tender_viewed`
- `tender_bookmarked`
- `tender_unbookmarked`
- `tender_applied`
- `tender_imported`
- `tender_ai_generated`

### Matching Actions
- `matching_triggered`
- `matching_completed`
- `matching_result_viewed`

### Profile Actions
- `profile_updated`
- `profile_viewed`

### Project/VO Actions
- `project_created`
- `project_updated`
- `project_deleted`
- `project_member_invited`
- `project_member_joined`

### Admin Actions
- `admin_user_approved`
- `admin_user_rejected`
- `admin_company_approved`
- `admin_company_rejected`
- `admin_tender_imported`
- `admin_tender_ai_regenerated`
- `admin_taxonomy_updated`

### Queue/Processing
- `queue_job_created`
- `queue_job_completed`
- `queue_job_failed`

### System Events
- `system_error`
- `rate_limit_exceeded`
- `api_error`

## Error Logging

Always log errors:

```typescript
try {
  // ... your code
} catch (error) {
  await logApiEvent(request, {
    actionType: "your_action",
    userId: user?.id,
    status: "error",
    errorMessage: error instanceof Error ? error.message : String(error),
  });
  throw error; // or return error response
}
```

## Enforcement

1. **ESLint Rule**: We have a custom rule that warns about missing event logging
2. **Code Review**: All PRs must include event logging for new endpoints
3. **TypeScript Types**: Use the predefined `EventActionType` for type safety

## Examples

See `lib/services/eventLogger.example.md` for more examples.

## Checklist for New Endpoints

- [ ] Import `logApiEvent` from `@/lib/services/eventLogger`
- [ ] Log success case with appropriate `actionType`
- [ ] Log error cases with `status: "error"`
- [ ] Include relevant `entityType` and `entityId` if applicable
- [ ] Add useful context in `details` object
- [ ] Test that events are being logged correctly
