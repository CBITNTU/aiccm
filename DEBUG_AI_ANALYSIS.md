# Debugging AI Analysis Issues

## Problem: Analysis Shows Hardcoded/Generic Values

If you're seeing scores around 65-70 that don't make sense, here's how to debug:

## Check 1: Is AI Actually Being Called?

1. Open browser console (F12)
2. Click "Analyze" button
3. Look for these logs:
   - `🔄 Fetching company analysis for: [Company Name]`
   - `Sending analyze-company request to OpenAI...`
   - `OpenAI response received, length: [number]`
   - `✅ Successfully parsed AI analysis`

## Check 2: Is Parsing Failing?

If you see:
- `⚠️ Using FALLBACK analysis - AI parsing failed`
- `Failed to parse OpenAI response`

Then the AI response isn't in the expected JSON format. Check the console for the raw response.

## Check 3: Does Company Have Enough Data?

The AI needs some data to work with. Check if your company has:
- Company name (required)
- Description (helps)
- Key capabilities (helps)
- Financial data (helps)
- Certifications (helps)

If the company only has a name like "Test", the AI will generate generic scores.

## Check 4: Is It Using Cached Data?

The dashboard loads from `company.ai_analysis` field. If you see old data:
1. Check the database: `SELECT ai_analysis FROM companies WHERE id = 'your-company-id'`
2. Look for `executiveSummary` containing "could not be completed" = fallback data
3. Click "Re-analyze" to force a new analysis

## How to Force Fresh Analysis

1. Click "Re-analyze" button in dashboard
2. Check browser console for logs
3. Verify the scores change
4. If scores are still generic, check:
   - OpenAI API key is set
   - Company has some data (not just "Test")
   - Network tab shows successful API call

## Expected Behavior

**Good Analysis:**
- Scores vary (not all 65-70)
- Executive summary is specific to your company
- Scores make sense based on company data

**Bad Analysis (Fallback):**
- All scores around 65-70
- Executive summary says "could not be completed"
- Generic competencies like "General construction"

## Quick Test

1. Create a company with real data:
   - Name: "ABC Construction Ltd"
   - Description: "Specializes in commercial construction and infrastructure projects"
   - Capabilities: "Steel fabrication, concrete work, project management"
   - Certifications: "ISO 9001, ISO 14001"

2. Click "Analyze"
3. Check if scores are specific and varied
4. If still generic, check console logs for errors
