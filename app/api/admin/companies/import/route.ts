import { NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { apiResponse, checkSuperadminRole } from "@/lib/api";
import {
  AuthError,
  handleApiError,
  requireAuth,
  validateBody,
} from "@/lib/api/validation";
import { db } from "@/lib/db";
import {
  companies,
  companyCapabilities,
  companyCapabilitiesRef,
} from "@/lib/db/schema/app";
import {
  enqueueBatch,
  type EnqueueJobOptions,
} from "@/lib/services/queueService";

const csvImportRowSchema = z.object({
  companyName: z.string().min(1),
  companiesHouseNumber: z.string().optional().nullable(),
  contactEmail: z.string().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  postcode: z.string().optional().nullable(),
  fullAddress: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  websiteUrl: z.string().optional().nullable(),
  keyCapabilities: z.string().optional().nullable(),
  certifications: z.string().optional().nullable(),
  sicCodes: z.string().optional().nullable(),
});

const requestSchema = z.object({
  rows: z.array(csvImportRowSchema).min(1).max(5000),
  options: z
    .object({
      duplicateMode: z.enum(["skip", "update"]).default("skip"),
      enqueueJobs: z.boolean().default(false),
      fullRegeneration: z.boolean().default(true),
      chunkSize: z.number().int().min(25).max(500).default(150),
    })
    .default({
      duplicateMode: "skip",
      enqueueJobs: false,
      fullRegeneration: true,
      chunkSize: 150,
    }),
});

type CsvImportRow = z.infer<typeof csvImportRowSchema>;

type ImportRowResult = {
  rowIndex: number;
  companyName: string;
  companyId?: string;
  status: "imported" | "updated" | "skipped" | "error";
  message?: string;
};

const ADMIN_COMPANY_FIELD_MAP: Record<
  string,
  keyof typeof companies.$inferInsert
> = {
  company_name: "companyName",
  companies_house_number: "companiesHouseNumber",
  website_url: "websiteUrl",
  contact_email: "contactEmail",
  contact_phone: "contactPhone",
  contact_person: "contactPerson",
  key_capabilities: "keyCapabilities",
  certifications: "certifications",
  past_projects: "pastProjects",
  is_system_company: "isSystemCompany",
  user_id: "userId",
  status: "status",
  postcode: "postcode",
  address: "address",
  description: "description",
};

function mapAdminCompanyPayload(
  payload: Record<string, unknown>,
): Partial<typeof companies.$inferInsert> {
  const mapped: Partial<typeof companies.$inferInsert> = {};
  for (const [key, value] of Object.entries(payload)) {
    const targetKey = (ADMIN_COMPANY_FIELD_MAP[key] ??
      (key as keyof typeof companies.$inferInsert)) as keyof typeof companies.$inferInsert;
    mapped[targetKey] = value as never;
  }
  return mapped;
}

function cleanString(value?: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function buildDescription(row: CsvImportRow): string | null {
  const description = cleanString(row.description);
  const sicCodes = cleanString(row.sicCodes);
  if (!description && !sicCodes) return null;
  if (description && sicCodes) return `${description}\n\nSIC Codes: ${sicCodes}`;
  return description ?? `SIC Codes: ${sicCodes}`;
}

function parseCapabilities(capabilities: string | null): string[] {
  if (!capabilities) return [];
  return capabilities
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

function matchCapabilityId(
  capability: string,
  capabilityByExactName: Map<string, string>,
  fallbackCapabilities: Array<{ id: string; nameLower: string }>,
): string | null {
  const normalized = capability.trim().toLowerCase();
  if (!normalized) return null;

  const exact = capabilityByExactName.get(normalized);
  if (exact) return exact;

  const partial = fallbackCapabilities.find(
    (candidate) =>
      candidate.nameLower.includes(normalized) ||
      normalized.includes(candidate.nameLower),
  );
  if (partial) return partial.id;

  const words = normalized.split(/\s+/);
  const wordMatch = fallbackCapabilities.find((candidate) =>
    words.every((word) => candidate.nameLower.includes(word)),
  );

  return wordMatch?.id ?? null;
}

async function replaceCompanyCapabilities(
  companyId: string,
  capabilityIds: string[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(companyCapabilities)
      .where(eq(companyCapabilities.companyId, companyId));

    if (capabilityIds.length === 0) return;

    await tx.insert(companyCapabilities).values(
      capabilityIds.map((capabilityId) => ({
        companyId,
        capabilityId,
      })),
    );
  });
}

function buildCompanyPayload(row: CsvImportRow): Record<string, unknown> {
  return {
    companyName: row.companyName.trim(),
    companiesHouseNumber: cleanString(row.companiesHouseNumber),
    contactEmail: cleanString(row.contactEmail),
    contactPhone: cleanString(row.contactPhone),
    postcode: cleanString(row.postcode),
    address: cleanString(row.fullAddress),
    description: buildDescription(row),
    websiteUrl: cleanString(row.websiteUrl),
    keyCapabilities: cleanString(row.keyCapabilities),
    certifications: cleanString(row.certifications),
    userId: null,
    isSystemCompany: true,
    status: "active",
  };
}

function pickUpdateFields(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const updateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== null && value !== undefined) {
      updateData[key] = value;
    }
  }
  return updateData;
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    const body = await validateBody(request, requestSchema);
    const duplicateMode = body.options.duplicateMode;
    const shouldQueueJobs = body.options.enqueueJobs;
    const fullRegeneration = body.options.fullRegeneration;
    const chunkSize = body.options.chunkSize;

    const capabilityRows = await db
      .select({
        id: companyCapabilitiesRef.id,
        name: companyCapabilitiesRef.name,
      })
      .from(companyCapabilitiesRef)
      .where(eq(companyCapabilitiesRef.isActive, true));

    const capabilityByExactName = new Map<string, string>();
    const fallbackCapabilities = capabilityRows.map((capability) => {
      const nameLower = capability.name.toLowerCase().trim();
      capabilityByExactName.set(nameLower, capability.id);
      return {
        id: capability.id,
        nameLower,
      };
    });

    const results: ImportRowResult[] = [];
    const jobsToQueue: EnqueueJobOptions[] = [];
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (let offset = 0; offset < body.rows.length; offset += chunkSize) {
      const chunk = body.rows.slice(offset, offset + chunkSize);
      const chunkCompanyNames = Array.from(
        new Set(chunk.map((row) => row.companyName.trim()).filter(Boolean)),
      );

      const existingCompanies = chunkCompanyNames.length
        ? await db
            .select({
              id: companies.id,
              companyName: companies.companyName,
            })
            .from(companies)
            .where(
              and(
                eq(companies.isSystemCompany, true),
                inArray(companies.companyName, chunkCompanyNames),
              ),
            )
        : [];

      const existingByName = new Map(
        existingCompanies.map((company) => [company.companyName, company.id]),
      );

      for (let index = 0; index < chunk.length; index++) {
        const row = chunk[index];
        const rowIndex = offset + index;
        const companyName = row.companyName.trim();
        const payload = buildCompanyPayload(row);

        if (!companyName) {
          failed++;
          results.push({
            rowIndex,
            companyName: row.companyName,
            status: "error",
            message: "Missing company name",
          });
          continue;
        }

        try {
          let companyId = existingByName.get(companyName);
          const wasExisting = !!companyId;
          let status: ImportRowResult["status"] = "imported";

          if (!companyId) {
            const inserted = await db
              .insert(companies)
              .values(
                mapAdminCompanyPayload(payload) as typeof companies.$inferInsert,
              )
              .returning({ id: companies.id });
            companyId = inserted[0]?.id;
            if (!companyId) throw new Error("Failed to create company");
            existingByName.set(companyName, companyId);
            imported++;
          } else if (duplicateMode === "update") {
            const updatePayload = pickUpdateFields(payload);
            if (Object.keys(updatePayload).length > 0) {
              await db
                .update(companies)
                .set(mapAdminCompanyPayload(updatePayload))
                .where(eq(companies.id, companyId));
            }
            updated++;
            status = "updated";
          } else {
            skipped++;
            status = "skipped";
          }

          const matchedCapabilityIds: string[] = [];
          if (row.keyCapabilities && status !== "skipped") {
            const parsedCapabilities = parseCapabilities(row.keyCapabilities);
            const seenCapabilityIds = new Set<string>();

            for (const capabilityToken of parsedCapabilities) {
              const capabilityId = matchCapabilityId(
                capabilityToken,
                capabilityByExactName,
                fallbackCapabilities,
              );
              if (capabilityId && !seenCapabilityIds.has(capabilityId)) {
                seenCapabilityIds.add(capabilityId);
                matchedCapabilityIds.push(capabilityId);
              }
            }
          }

          if (status !== "skipped") {
            await replaceCompanyCapabilities(companyId, matchedCapabilityIds);
          }

          if (shouldQueueJobs) {
            if (wasExisting && status === "skipped") {
              jobsToQueue.push({
                jobType: "company_taxonomy",
                entityType: "company",
                entityId: companyId,
                priority: 3,
                metadata: fullRegeneration
                  ? { fullRegeneration: true }
                  : undefined,
              });
            } else if (wasExisting && status === "updated") {
              jobsToQueue.push({
                jobType: "company_summary",
                entityType: "company",
                entityId: companyId,
                priority: 3,
                metadata: fullRegeneration
                  ? { fullRegeneration: true }
                  : undefined,
              });
              jobsToQueue.push({
                jobType: "company_taxonomy",
                entityType: "company",
                entityId: companyId,
                priority: 3,
                metadata: fullRegeneration
                  ? { fullRegeneration: true }
                  : undefined,
              });
            } else if (!wasExisting) {
              jobsToQueue.push({
                jobType: "company_summary",
                entityType: "company",
                entityId: companyId,
                priority: 3,
              });
              jobsToQueue.push({
                jobType: "company_taxonomy",
                entityType: "company",
                entityId: companyId,
                priority: 3,
              });
            }
          }

          results.push({
            rowIndex,
            companyName,
            companyId,
            status,
          });
        } catch (error) {
          failed++;
          results.push({
            rowIndex,
            companyName,
            status: "error",
            message: error instanceof Error ? error.message : "Unknown import error",
          });
        }
      }
    }

    let batchId: string | null = null;
    let queuedJobs = 0;
    if (jobsToQueue.length > 0) {
      const queued = await enqueueBatch(
        jobsToQueue,
        "admin_company_csv_import",
        user.id,
      );
      batchId = queued.batchId;
      queuedJobs = queued.jobIds.length;
    }

    return apiResponse({
      totalRows: body.rows.length,
      imported,
      updated,
      skipped,
      failed,
      queuedJobs,
      batchId,
      results,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
