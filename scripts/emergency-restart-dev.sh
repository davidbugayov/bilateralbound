#!/bin/bash
# Emergency restart script — restarts the dev service without affecting prod.
# Kills only the PIDs belonging to emdrbilateral-dev, then restarts via systemd.

# Get PIDs of the dev service's node process(es)
DEV_PIDS=$(systemctl show emdrbilateral-dev --property=MainPID --value)

if [ -n "$DEV_PIDS" ] && [ "$DEV_PIDS" != "0" ]; then
  echo "Killing dev service PID: $DEV_PIDS"
  kill -9 "$DEV_PIDS" 2>/dev/null || true
fi

# Also kill any child node processes spawned by the dev service
for pid in $(pgrep -P "$DEV_PIDS" 2>/dev/null); do
  kill -9 "$pid" 2>/dev/null || true
done

# Wait a bit
sleep 3

# Now restart service
systemctl restart emdrbilateral-dev

# Wait for service to start
sleep 5

# Check if it's running
systemctl status emdrbilateral-dev
