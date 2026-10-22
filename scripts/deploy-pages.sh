#!/usr/bin/env bash
# Publica no Cloudflare Pages (projeto ntn-plataforma). Usa CLOUDFLARE_API_TOKEN do ambiente; nada de segredo no repo.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist && mkdir dist
git ls-files -z --cached --others --exclude-standard | grep -zvE '^(netlify/|netlify\.toml|tests/|docs/|backups/|functions/|scripts/|serial_telemetry\.py|.*\.command|thingy\.sh|proxy\.js|package(-lock)?\.json|README\.md|\.gitignore)' \
  | xargs -0 -I{} cp --parents {} dist/
CLOUDFLARE_ACCOUNT_ID=1c9c7a65b6b8a4a379ddf033997d29bc wrangler pages deploy dist --project-name ntn-plataforma --branch main --commit-dirty=true
