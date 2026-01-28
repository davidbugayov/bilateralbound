#!/bin/bash
# Emergency restart script - kills stuck processes and restarts service

# Force kill npm processes
pkill -9 npm

# Force kill node processes
pkill -9 node

# Wait a bit
sleep 3

# Force kill again to be sure
pkill -9 -f "node|npm" || true

# Now restart service
systemctl restart emdrbilateral-dev

# Wait for service to start
sleep 5

# Check if it's running
systemctl status emdrbilateral-dev
