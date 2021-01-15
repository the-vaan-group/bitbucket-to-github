#!/bin/bash

set -Eeuo pipefail

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

docker-compose up -d --no-recreate --build tasks \
  && docker-compose exec tasks ./docker-entrypoint.sh /bin/bash
