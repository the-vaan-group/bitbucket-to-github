#!/bin/bash

set -Eeuo pipefail

node --max_old_space_size=384 -r esm ./dist/index.js
