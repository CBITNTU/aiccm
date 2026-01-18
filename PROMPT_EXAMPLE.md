# AI Analysis Prompt - What Gets Sent to OpenAI

## System Prompt (sent first)

```
You are an expert construction industry analyst. Provide accurate, fair assessments based STRICTLY on available data.

CRITICAL SCORING RULES:
- If company has minimal data (most fields are N/A), scores should be CONSERVATIVE (40-60 range)
- Do NOT score 70+ unless there is SUBSTANTIAL evidence
- Missing data = lower scores, not assumptions
- Overall score should reflect data completeness: minimal data = 40-60, good data = 60-80, excellent data = 80-100
- Be honest about data limitations in the executive summary
```

## Main Analysis Prompt (with example values for "Test" company)

```
Analyze the following construction company and provide comprehensive performance benchmarking, core competencies, business insights, AND fill in all missing company information fields.

⚠️ IMPORTANT: If the company has MINIMAL DATA (most fields are "N/A"), be CONSERVATIVE in your scoring. 
- Companies with minimal data should score 40-60 overall, not 80+
- Only score high (70+) if there is SUBSTANTIAL evidence
- If data is missing, indicate this in your assessment
- Do NOT make assumptions - base scores ONLY on available data

COMPANY PROFILE:
Company: Test
Website: N/A
Description: N/A - FILL THIS
Key Capabilities: N/A - FILL THIS
Equipment: N/A - FILL THIS
Certifications: N/A - FILL THIS
Past Projects: N/A - FILL THIS
Contact Person: N/A - FILL THIS
Contact Email: N/A - FILL THIS
Contact Phone: N/A - FILL THIS
Postcode: N/A - FILL THIS
Safety Rating: N/A
Digital Maturity: N/A

DATA COMPLETENESS: 0/7 fields have data. ⚠️ MINIMAL DATA - Use conservative scoring (40-60 range)

FINANCIAL DATA:
Employees: N/A
Net Assets: £N/A
Total Assets: £N/A
Total Liabilities: £N/A
Cash: £N/A
Debt Ratio: N/A

COMPLIANCE DATA:
Accounts Filed: N/A
Accounts Due: N/A
Confirmation Statement: N/A
Active Charges: N/A

ANALYSIS REQUIREMENTS:

0. COMPANY INFORMATION ENRICHMENT:
   For ANY field marked "N/A - FILL THIS", provide concise, useful information.
   - description: 2-3 sentences about the company's business and market position
   - key_capabilities: List specific technical capabilities and services (100-150 words max)
   - equipment: Return ONLY equipment names separated by semicolons (NO sentences, NO line breaks).
   - certifications: Return ONLY certification names separated by semicolons (NO sentences, NO line breaks).
   - past_projects: Brief list of 2-3 notable projects with basic details (50-100 words total)
   - contact_person: Extract contact name if available from website
   - contact_email: Extract contact email if available
   - contact_phone: Extract contact phone if available
   - postcode: Extract postcode/location if available

CRITICAL FORMAT REQUIREMENTS:
- For equipment and certifications fields: ONLY names separated by semicolons
- NO full sentences, NO descriptive phrases, NO connecting words
- Example CORRECT format: "ISO 9001; ISO 14001; OHSAS 18001"
- Example WRONG format: "The company holds ISO 9001 for quality management and ISO 14001"

1. PERFORMANCE BENCHMARKING (0-100 scores):
   - Technical Expertise: Assess capabilities, equipment, and project complexity. If no data, score 40-50.
   - Safety Standards: Evaluate certifications, compliance, and safety culture. If no certifications, score 40-50.
   - Innovation & Technology: Rate digital maturity and modern practices. If no data, score 40-50.
   - Project Experience: Analyze past projects and company maturity. If no projects listed, score 40-50.
   - Certifications & Compliance: Review regulatory compliance and industry standards. If no certifications, score 40-50.
   - Market Reputation: Evaluate overall market position and credibility. If minimal data, score 40-50.
   - Financial Health: Assess financial stability, assets, and debt ratios. If no financial data, score 40-50.
   - Operational Capacity: Evaluate workforce size and resource capacity. If no data, score 40-50.
   
   ⚠️ SCORING RULES:
   - If most fields are "N/A", overall score should be 40-60, NOT 70+
   - Only score 70+ if there is SUBSTANTIAL evidence (multiple data points)
   - Be conservative - it's better to score low with minimal data than to guess high
   - Overall score should reflect data completeness: minimal data = 40-60, good data = 60-80, excellent data = 80-100

2. CORE COMPETENCIES:
   Extract 6-9 SHORT, specific competencies (max 3-4 words each).
   Examples: "High-rise construction", "Steel fabrication", "Project management"

3. ASSESSMENT RATINGS:
   Provide these specific assessments:
   - digitalMaturity: Rate as "High", "Medium", "Low", or "Not assessed yet"
   - safetyRating: Rate as "Excellent", "Good", "Fair", "Poor", or "Not assessed yet"
   - marketPosition: Brief summary (1 sentence) or "Not assessed yet"

4. BUSINESS INSIGHTS:
   Provide 3-5 SHORT strategic insights (one sentence each, max 15 words per insight).
   Cover: strengths, opportunities, risks, financial health, or recommendations.

5. COMPETITIVE POSITIONING:
   Rate the company's position: "Market Leader", "Strong Competitor", "Emerging Player", or "Developing"

6. SWOT SUMMARY:
   Brief bullets for Strengths, Weaknesses, Opportunities, Threats (2-3 SHORT items each, max 5 words per item)

Return ONLY a JSON object with this exact structure:
{
  "companyInfo": {
    "description": "2-3 sentence company description",
    "key_capabilities": "100-150 word capabilities list",
    "equipment": "Equipment names only",
    "certifications": "ISO 9001; ISO 14001; OHSAS 18001",
    "past_projects": "",
    "contact_person": "Contact name or null",
    "contact_email": "Contact email or null",
    "contact_phone": "Contact phone or null",
    "postcode": "Company postcode or null"
  },
  "performanceBenchmark": {
    "technicalExpertise": 50,
    "safetyStandards": 50,
    "innovation": 50,
    "projectExperience": 50,
    "certifications": 50,
    "marketReputation": 50,
    "financialHealth": 50,
    "operationalCapacity": 50,
    "overallScore": 50
  },
  "coreCompetencies": [
    "High-rise construction",
    "Steel fabrication"
  ],
  "digitalMaturity": "Medium",
  "safetyRating": "Good",
  "marketPosition": "Established regional contractor with growth potential",
  "businessInsights": [
    "Strong asset base supports large project bids",
    "Equipment diversity enables multiple service lines"
  ],
  "competitivePositioning": "Strong Competitor",
  "swotSummary": {
    "strengths": ["Strong assets", "Experienced team"],
    "weaknesses": ["Moderate debt"],
    "opportunities": ["Green building"],
    "threats": ["Economic uncertainty"]
  },
  "executiveSummary": "1-2 sentence overall assessment"
}
```

## Key Points

1. **Data Completeness Check**: The prompt includes `DATA COMPLETENESS: 0/7 fields have data. ⚠️ MINIMAL DATA - Use conservative scoring (40-60 range)`

2. **Multiple Warnings**: The prompt has 3 separate warnings about conservative scoring for minimal data

3. **Example Scores**: The JSON example shows scores of 50 (neutral) instead of 85+ to avoid biasing the AI

4. **System Prompt**: Reinforces the conservative scoring rules

5. **Temperature**: Set to 0.3 (low) for more consistent, less creative responses

## Why It Might Still Score High

Even with these warnings, the AI might still score high because:
- LLMs can sometimes ignore explicit instructions
- The example JSON structure might bias it
- The AI might be "filling in" missing data with assumptions

## To See Actual Prompt in Action

Check the server console logs when you click "Analyze" - it will show:
- `Company data being analyzed: { name: 'Test', hasDescription: false, ... }`
- The actual prompt being sent (if you add more logging)
