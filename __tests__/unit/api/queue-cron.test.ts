import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { GET, POST } from "@/app/api/queue/cron/route";
import { db } from "@/lib/db";
import { makeRequest, readJson } from "@/__tests__/helpers/request";
import { makeChain, type Chain } from "@/__tests__/helpers/drizzleMock";

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

const mockedSelect = db.select as unknown as Mock;
const mockedUpdate = db.update as unknown as Mock;
const mockedDelete = db.delete as unknown as Mock;

/**
 * Wire the three db calls the cron route makes, in order:
 * update (reset stuck) → select (stats) → delete (cleanup).
 */
function setupDb({
  stuck = [] as Array<{ id: string }>,
  statuses = [] as Array<{ status: string }>,
  cleaned = [] as Array<{ id: string }>,
} = {}): { updateChain: Chain; deleteChain: Chain } {
  const updateChain = makeChain(() => stuck);
  const deleteChain = makeChain(() => cleaned);
  mockedUpdate.mockImplementation(() => updateChain);
  mockedSelect.mockImplementation(() => makeChain(() => statuses));
  mockedDelete.mockImplementation(() => deleteChain);
  return { updateChain, deleteChain };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => "" })));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GET /api/queue/cron", () => {
  it("requires the Bearer secret in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "prod-secret");
    setupDb();

    const unauthorized = await readJson(
      await GET(makeRequest("/api/queue/cron")),
    );
    expect(unauthorized.status).toBe(401);

    const authorized = await readJson(
      await GET(
        makeRequest("/api/queue/cron", {
          headers: { authorization: "Bearer prod-secret" },
        }),
      ),
    );
    expect(authorized.status).toBe(200);
  });

  it("does not require auth outside production", async () => {
    setupDb();
    const { status, body } = await readJson(
      await GET(makeRequest("/api/queue/cron")),
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      stuckJobsReset: 0,
      pendingJobs: 0,
      processingJobs: 0,
      workerTriggered: false,
      message: "Queue is healthy",
    });
  });

  it("resets stuck jobs and reports the count", async () => {
    setupDb({ stuck: [{ id: "j1" }, { id: "j2" }] });

    const { body } = await readJson(await GET(makeRequest("/api/queue/cron")));

    expect(body).toMatchObject({
      stuckJobsReset: 2,
      message: "Reset 2 stuck jobs",
    });
  });

  it("triggers the worker with the secret header when jobs are pending", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    setupDb({
      statuses: [
        { status: "pending" },
        { status: "pending" },
        { status: "processing" },
      ],
    });
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => "" }));
    vi.stubGlobal("fetch", fetchMock);

    const { body } = await readJson(await GET(makeRequest("/api/queue/cron")));

    expect(body).toMatchObject({
      pendingJobs: 2,
      processingJobs: 1,
      workerTriggered: true,
      message: "Processing 2 pending jobs",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain("/api/queue/worker");
    expect((init.headers as Record<string, string>)["x-queue-secret"]).toBe(
      "cron-secret",
    );
  });

  it("reports workerTriggered=false when the trigger fetch fails", async () => {
    setupDb({ statuses: [{ status: "pending" }] });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection refused");
      }),
    );

    const { status, body } = await readJson(
      await GET(makeRequest("/api/queue/cron")),
    );

    expect(status).toBe(200); // cron still succeeds
    expect(body.workerTriggered).toBe(false);
  });

  it("cleans up old completed/failed jobs", async () => {
    const { deleteChain } = setupDb({ cleaned: [{ id: "old-1" }] });

    const { status } = await readJson(await GET(makeRequest("/api/queue/cron")));

    expect(status).toBe(200);
    expect(mockedDelete).toHaveBeenCalledTimes(1);
    expect(deleteChain.where).toHaveBeenCalledTimes(1);
  });

  it("returns 500 when the reset query fails", async () => {
    mockedUpdate.mockImplementation(() => {
      throw new Error("db down");
    });

    const { status, body } = await readJson(
      await GET(makeRequest("/api/queue/cron")),
    );

    expect(status).toBe(500);
    expect(body).toMatchObject({ success: false, error: "db down" });
  });
});

describe("POST /api/queue/cron", () => {
  it("behaves like GET (manual trigger)", async () => {
    setupDb();
    const { status, body } = await readJson(
      await POST(makeRequest("/api/queue/cron", { method: "POST" })),
    );
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });
});
