#!/bin/bash

set -Eeuo pipefail

pnpm install

exec "$@"
