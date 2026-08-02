#!/usr/bin/env sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
env_file="$repo_root/n8n/.env"

cd "$repo_root"

if [ -f "$env_file" ]; then
  docker compose --env-file "$env_file" down
else
  docker compose down
fi
