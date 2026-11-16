#!/usr/bin/env bash
# Difflux build script
# Installs dependencies, runs tests, and globally installs the package
# so that the `difflux` command is available system-wide.

set -euo pipefail

echo "Installing npm dependencies..."
npm install

echo "Running test suite..."
npm test

echo "Globally installing difflux..."
npm install -g .

echo "Build complete. Run 'difflux' to verify."
