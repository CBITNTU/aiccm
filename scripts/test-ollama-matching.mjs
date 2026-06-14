/**
 * Smoke-test local Ollama for structured JSON (similar to tender matching).
 *
 * Prerequisites:
 *   brew install ollama && ollama serve   # separate terminal
 *   ollama pull qwen2.5:7b
 *
 * Usage:
 *   node scripts/test-ollama-matching.mjs
 *   MATCHING_MODEL=ollama/qwen2.5:3b node scripts/test-ollama-matching.mjs
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const baseRaw =
  process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434";
const apiBase = baseRaw.endsWith("/v1")
  ? baseRaw
  : `${baseRaw.replace(/\/$/, "")}/v1`;
const model =
  process.env.MATCHING_MODEL?.replace(/^ollama\//, "")?.trim() ||
  "qwen2.5:7b";

const system = `You evaluate company-tender fit. Respond with JSON only:
{
  "capabilityScore": number 0-100,
  "experienceScore": number 0-100,
  "locationScore": number 0-100,
  "certificationScore": number 0-100,
  "matchReasons": string[],
  "improvementSuggestions": string[],
  "aiAnalysis": string,
  "scoreExplanations": {
    "capability": string,
    "experience": string,
    "location": string,
    "certification": string
  }
}`;

const user = `Company: Acme Construction Ltd
Capabilities: Commercial fit-out, M&E, project management
Location: Nottingham NG1

Tender: NHS ward refurbishment — mechanical and electrical works
Buyer: NHS Trust
Location: Derby`;

async function main() {
  console.log(`Ollama API: ${apiBase}`);
  console.log(`Model: ${model}\n`);

  const health = await fetch(`${apiBase.replace(/\/v1$/, "")}/api/tags`).catch(
    () => null,
  );
  if (!health?.ok) {
    console.error(
      "Cannot reach Ollama. Install: brew install ollama\nThen run: ollama serve\nAnd: ollama pull qwen2.5:7b",
    );
    process.exit(1);
  }

  const tags = await health.json();
  const names = (tags.models ?? []).map((m) => m.name);
  if (!names.some((n) => n === model || n.startsWith(`${model}:`))) {
    console.warn(
      `Warning: "${model}" not in ollama list. Run: ollama pull ${model}`,
    );
    console.warn("Installed:", names.slice(0, 8).join(", ") || "(none)");
  }

  const started = Date.now();
  const res = await fetch(`${apiBase}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    console.error("Ollama error:", res.status, await res.text());
    process.exit(1);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "";
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`Done in ${elapsed}s\n`);
  try {
    const parsed = JSON.parse(content);
    console.log(JSON.stringify(parsed, null, 2));
    console.log(
      `\nScores: capability=${parsed.capabilityScore} experience=${parsed.experienceScore} location=${parsed.locationScore} certification=${parsed.certificationScore}`,
    );
  } catch {
    console.log("Raw response (not valid JSON):\n", content);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
