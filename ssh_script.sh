#!/bin/bash
# SSH automation script for server deployment
SERVER="root@213.139.229.44"
PASSWORD="t!Vt3bNWtkaq"

expect << EOF
spawn ssh -o StrictHostKeyChecking=no $SERVER "$1"
expect {
    "password:" { send "$PASSWORD\r"; interact }
    "yes/no" { send "yes\r"; exp_continue }
    timeout { exit 1 }
}
EOF
