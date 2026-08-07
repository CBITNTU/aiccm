import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ukCompaniesHouseAdapter } from "@/lib/companies/registry/adapters/ukCompaniesHouse";

/**
 * Fixtures are trimmed from the live Companies House company pages, keeping the
 * `<h1>` and the definition lists that carry the fields we parse. The nesting is
 * reproduced verbatim: the registered-office `<dd>` has no class of its own (the
 * classes sit on an inner `<span id="roa-address">`), while the status `<dd>` does
 * carry `class="text data"`. A label-anchored regex therefore skips the address
 * and matches the status instead — the bug this suite pins down.
 */
function pageHtml(opts: {
  name: string;
  address: string | null;
  status: string;
  type: string;
}) {
  return `<!DOCTYPE html><html><head><title>GOV.UK</title></head><body>
  <h1 class="heading-xlarge" style="display: inline;">${opts.name}</h1>
  <p id="company-number">Company number <strong>10842280</strong></p>
  <div class="govuk-tabs__panel">
    <dl>
      <dt>Registered office address</dt>
      <dd style="margin-top: 5px; margin-bottom: 10px">
        ${
          opts.address === null
            ? ""
            : `<span class="text data" id="roa-address">
          ${opts.address}
        </span>`
        }
      </dd>
    </dl>
    <div class="grid-row">
      <dl class="column-two-thirds">
        <dt>Company status</dt>
        <dd class="text data" id="company-status">
          ${opts.status}
        </dd>
      </dl>
    </div>
    <div class="grid-row">
      <dl class="column-two-thirds">
        <dt>Company type</dt>
        <dd id="company-type" style="margin-top: 5px; margin-bottom: 10px">
          <span class="text data" id="company-type-value">
            ${opts.type}
          </span>
        </dd>
      </dl>
    </div>
  </div>
</body></html>`;
}

const YAPILY = pageHtml({
  name: "YAPILY LTD",
  address: "66 Paul Street, London, England, EC2A 4NA",
  status: "Active",
  type: "Private limited Company",
});

const WEEKMOOR = pageHtml({
  name: "WEEKMOOR LTD",
  address:
    "1st Floor Healthaid House, Marlborough Hill, Harrow, Middlesex, England, HA1 1UD",
  status: "Dissolved",
  type: "Private limited Company",
});

function mockFetch(body: string, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  });
}

const lookup = ukCompaniesHouseAdapter.lookup!;

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch(YAPILY));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ukCompaniesHouseAdapter.normalizeNumber", () => {
  it("left-pads short numeric company numbers to 8 digits", () => {
    expect(ukCompaniesHouseAdapter.normalizeNumber("842280")).toBe("00842280");
    expect(ukCompaniesHouseAdapter.normalizeNumber("445790")).toBe("00445790");
  });

  it("passes through an already-8-digit number", () => {
    expect(ukCompaniesHouseAdapter.normalizeNumber("10842280")).toBe("10842280");
  });

  it("accepts and upper-cases letter-prefixed numbers", () => {
    expect(ukCompaniesHouseAdapter.normalizeNumber("sc123456")).toBe("SC123456");
    expect(ukCompaniesHouseAdapter.normalizeNumber("OC303525")).toBe("OC303525");
    expect(ukCompaniesHouseAdapter.normalizeNumber("NI 123456")).toBe("NI123456");
  });

  it("rejects malformed input", () => {
    expect(ukCompaniesHouseAdapter.normalizeNumber("")).toBeNull();
    expect(ukCompaniesHouseAdapter.normalizeNumber("123456789")).toBeNull();
    expect(ukCompaniesHouseAdapter.normalizeNumber("ZZ123456")).toBeNull();
    expect(ukCompaniesHouseAdapter.normalizeNumber("SC12345")).toBeNull();
  });
});

describe("ukCompaniesHouseAdapter.lookup", () => {
  it("parses the registered office address, not the company status", async () => {
    const result = await lookup("10842280");

    expect(result.found).toBe(true);
    expect(result.data).toEqual({
      companyName: "YAPILY LTD",
      registeredAddress: "66 Paul Street, London, England, EC2A 4NA",
      companyStatus: "Active",
      companyType: "Private limited Company",
    });
  });

  it("does not leak a dissolved status into the address", async () => {
    vi.stubGlobal("fetch", mockFetch(WEEKMOOR));

    const result = await lookup("12452151");

    expect(result.data?.registeredAddress).toBe(
      "1st Floor Healthaid House, Marlborough Hill, Harrow, Middlesex, England, HA1 1UD",
    );
    expect(result.data?.companyStatus).toBe("Dissolved");
  });

  it("requests the company page for the number it is given", async () => {
    const fetchMock = mockFetch(YAPILY);
    vi.stubGlobal("fetch", fetchMock);

    await lookup("SC117119");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://find-and-update.company-information.service.gov.uk/company/SC117119",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it("joins a multi-line address into a single comma-separated string", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        pageHtml({
          name: "MULTILINE LTD",
          address: "1 Example Street<br>Exampleton<br>EX1 2YZ",
          status: "Active",
          type: "Private limited Company",
        }),
      ),
    );

    const result = await lookup("10842280");

    expect(result.data?.registeredAddress).toBe(
      "1 Example Street, Exampleton, EX1 2YZ",
    );
  });

  it("falls back to the registered-office <dd> when the inner span id is gone", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(YAPILY.replace('id="roa-address"', 'id="renamed-by-govuk"')),
    );

    const result = await lookup("10842280");

    expect(result.found).toBe(true);
    expect(result.data?.registeredAddress).toBe(
      "66 Paul Street, London, England, EC2A 4NA",
    );
  });

  it("fails rather than returning an empty address when it cannot be parsed", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(pageHtml({ name: "NO ADDRESS LTD", address: null, status: "Active", type: "Private limited Company" })),
    );

    const result = await lookup("10842280");

    expect(result.found).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.error).toMatch(/could not parse/i);
  });

  it("never falls back to the page title for the company name", async () => {
    // The Companies House <title> is the literal string "GOV.UK"; a fallback onto
    // it would silently register every company under that name.
    vi.stubGlobal("fetch", mockFetch(YAPILY.replace("heading-xlarge", "renamed")));

    const result = await lookup("10842280");

    expect(result.found).toBe(false);
    expect(result.data).toBeUndefined();
  });

  it("reports a 404 as not found", async () => {
    vi.stubGlobal("fetch", mockFetch("<h1>This page cannot be found</h1>", 404));

    const result = await lookup("99999999");

    expect(result.found).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it("surfaces an upstream error status", async () => {
    vi.stubGlobal("fetch", mockFetch("", 503));

    const result = await lookup("10842280");

    expect(result.found).toBe(false);
    expect(result.error).toContain("503");
  });

  it("returns a connection error instead of throwing when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ETIMEDOUT")));

    const result = await lookup("10842280");

    expect(result.found).toBe(false);
    expect(result.error).toMatch(/failed to connect/i);
  });
});
