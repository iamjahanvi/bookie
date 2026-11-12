#!/bin/sh
# Stamp asset URLs with a fresh version so phones never mix old and new files.
V=$(date +%s)
sed -i -E "s#(styles\.css|app\.js)\?v=[^\"]*#\1?v=$V#g" index.html
echo "assets stamped v=$V"
