# Taxonomy seed data (optional)

To load **Competency**, **Market**, and **Standards** taxonomies from your CSV files:

1. Copy the CSV files here:
   - `Competency Taxonomy(in).csv`
   - `Market list(Market list v2).csv`
   - `standard taxonomy(in).csv`

2. Run migrations (if not already applied):
   ```bash
   npm run supabase:db-push
   ```

3. Run the seed script with paths to the CSVs (or omit to use files in this folder):
   ```bash
   node scripts/seed-taxonomies-from-csv.mjs
   ```
   Or with explicit paths (e.g. from Downloads):
   ```bash
   node scripts/seed-taxonomies-from-csv.mjs \
     "/path/to/Competency Taxonomy(in).csv" \
     "/path/to/Market list(Market list v2).csv" \
     "/path/to/standard taxonomy(in).csv"
   ```

Requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
