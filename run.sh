#!/usr/bin/env bash
set -euo pipefail

if [ ! -f .env ]; then
  echo ".env not found. Setting up first run."
  cp .env.example .env
  read -rsp "Paste your Anthropic API key (input hidden): " key
  echo
  if [ -z "$key" ]; then
    echo "No key provided. Edit .env manually before running again."
    exit 1
  fi
  python3 -c "
import sys
p = '.env'
content = open(p).read()
content = content.replace('ANTHROPIC_API_KEY=', 'ANTHROPIC_API_KEY=' + sys.argv[1])
open(p, 'w').write(content)
" "$key"
  echo ".env written."
fi

exec docker compose up
