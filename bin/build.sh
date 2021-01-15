#!/bin/bash

set -Eeuo pipefail

rm -rf ./dist/*
touch ./dist/.gitkeep
swc ./src -d ./dist
