#!/usr/bin/env bash
# Pull models on a running inference host (local compose or remote URL).
set -euo pipefail

HOST="${1:-http://127.0.0.1:11434}"
EMBED_MODEL="${EMBED_MODEL:-qwen3-embedding:0.6b}"
CHAT_MODEL="${CHAT_MODEL:-qwen2.5:7b}"
API_KEY="${INFERENCE_API_KEY:-}"

auth=()
if [[ -n "$API_KEY" ]]; then
  auth=(-H "Authorization: Bearer ${API_KEY}")
fi

echo "Waiting for Ollama at ${HOST}…"
for _ in $(seq 1 30); do
  if curl -sf "${auth[@]}" "${HOST}/api/tags" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "Pulling ${EMBED_MODEL}…"
curl -sf "${auth[@]}" -X POST "${HOST}/api/pull" \
  -d "{\"name\":\"${EMBED_MODEL}\"}" >/dev/null

echo "Pulling ${CHAT_MODEL}…"
curl -sf "${auth[@]}" -X POST "${HOST}/api/pull" \
  -d "{\"name\":\"${CHAT_MODEL}\"}" >/dev/null

echo "Done. Models:"
curl -sf "${auth[@]}" "${HOST}/api/tags" | head -c 2000
echo
