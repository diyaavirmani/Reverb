#!/usr/bin/env sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
env_file="$repo_root/n8n/.env"

if [ ! -f "$env_file" ]; then
  echo "Missing n8n/.env. Create it from n8n/.env.example and add local values." >&2
  exit 1
fi

cd "$repo_root"
docker compose --env-file "$env_file" up -d n8n
echo "n8n is starting at ${WEBHOOK_URL:-http://localhost:5678/}"
