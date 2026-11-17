#!/bin/sh
# Starts the Outlier server with the bundled Node.js. Press Ctrl+C to stop it.
# Admin commands work too, for example:  ./start-linux.sh reset-password dana
cd "$(dirname "$0")" || exit 1
NODE=./runtime/linux-x64/bin/node
if [ ! -x "$NODE" ]; then
  if [ -f "$NODE" ]; then chmod +x "$NODE"; else NODE=node; fi
fi
exec "$NODE" src/server.mjs "$@"
