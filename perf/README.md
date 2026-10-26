# perf harness

Measurement scripts for the home page's 3D, run against Windows Chrome over CDP from WSL.
Start a browser with `./launch.sh <port> <name> [--use-adapter-luid=0,86604]` (the Intel UHD 770),
serve the page from a local folder, then run a script with `PAGE=http://127.0.0.1:<port>/index.html`.
