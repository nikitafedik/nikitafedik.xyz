#!/bin/bash
# launch.sh <port> <profile-suffix> [extra chrome flags...]: headless Windows Chrome on the real GPU (D3D11)
# Intel UHD 770: --use-adapter-luid=0,86604   (port 9333 belongs to another session)
PORT=$1; SUF=$2; shift 2
"/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --remote-debugging-port=$PORT --remote-allow-origins=* \
  --user-data-dir="C:\\Users\\nfedik\\AppData\\Local\\Temp\\nf-perf-audit-$SUF" --use-angle=d3d11 --ignore-gpu-blocklist --enable-gpu-rasterization \
  --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --mute-audio --no-first-run "$@" about:blank
