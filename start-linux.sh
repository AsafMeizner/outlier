#!/bin/sh
# Starts the Outlier server from a source checkout (Node.js 24 or newer on the PATH). Press Ctrl+C to stop it.
# Run "npm run build" first. Admin commands work too, for example:  ./start-linux.sh reset-password dana
# The offline package (npm run bundle) has its own start scripts with Node.js included.
cd "$(dirname "$0")" || exit 1
exec node server/server.ts "$@"
