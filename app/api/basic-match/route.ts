import { NextRequest } from "next/server";
import { z } from "zod";

import { apiResponse } from "@/lib/api";
import { handleApiError, requireAuth, validateBody } from "@/lib/api/validation";
import {
  basicMatchTendersForCompany,
  basicMatchCompaniesForTender,
  basicMatchTendersForQuery,
} from "@/lib/services/basicMatchingService";

/**
 * POST /api/basic-match
 *
 * Coarse first-pass semantic matcher backed by pgvector. Returns ranked
 * candidates with a similarity score and a band (high/medium/low).
 *
 * Three modes:
 *   { mode: "tenders-for-company", companyId }   — match tenders to a company
 *   { mode: "companies-for-tender", tenderId }   — match companies to a tender
 *   { mode: "tenders-for-query",  query }        — free-text semantic search
 *
 * All modes accept optional { limit, minScore, status, highThreshold, mediumThreshold }.
 */

const baseSchema = {
  limit: z.number().int().min(1).max(500).optional(),
  minScore: z.number().min(0).max(1).optional(),
  status: z.string().max(40).optional(),
  highThreshold: z.number().min(0).max(1).optional(),
  mediumThreshold: z.number().min(0).max(1).optional(),
};

const schema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("tenders-for-company"),
    companyId: z.string().uuid(),
    ...baseSchema,
  }),
  z.object({
    mode: z.literal("companies-for-tender"),
    tenderId: z.string().uuid(),
    ...baseSchema,
  }),
  z.object({
    mode: z.literal("tenders-for-query"),
    query: z.string().min(1).max(2000),
    ...baseSchema,
  }),
]);

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const input = await validateBody(request, schema);
    const t0 = Date.now();

    if (input.mode === "tenders-for-company") {
      const { mode: _mode, companyId, ...opts } = input;
      const results = await basicMatchTendersForCompany(companyId, opts);
      return apiResponse({
        mode: input.mode,
        elapsedMs: Date.now() - t0,
        count: results.length,
        results,
      });
    }

    if (input.mode === "companies-for-tender") {
      const { mode: _mode, tenderId, ...opts } = input;
      const results = await basicMatchCompaniesForTender(tenderId, opts);
      return apiResponse({
        mode: input.mode,
        elapsedMs: Date.now() - t0,
        count: results.length,
        results,
      });
    }

    const { mode: _mode, query, ...opts } = input;
    const results = await basicMatchTendersForQuery(query, opts);
    return apiResponse({
      mode: input.mode,
      elapsedMs: Date.now() - t0,
      count: results.length,
      results,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
