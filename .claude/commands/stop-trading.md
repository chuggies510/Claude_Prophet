---
allowed-tools: Bash, mcp__prophet__get_managed_positions, mcp__prophet__get_options_positions, mcp__prophet__log_activity
description: Stop the trading backend and log session end
thinking: true
---

# Stop Trading

## Step 1: Log Session End

Log the session ending with log_activity:
- type: "DECISION"
- action: "Session ended by user"
- reasoning: "User requested stop-trading"

## Step 2: Check Open Positions

Get current positions with get_managed_positions and get_options_positions.

If positions exist, warn user:
"You have X open positions. These will remain open but won't be monitored. Consider closing them first."

## Step 3: Stop Go Backend

```bash
if [ -f trading_bot.pid ]; then
    PID=$(cat trading_bot.pid)
    kill $PID 2>/dev/null
    # Wait up to 5 seconds for graceful shutdown
    for i in 1 2 3 4 5 6 7 8 9 10; do
        if ! kill -0 $PID 2>/dev/null; then break; fi
        sleep 0.5
    done
    rm -f trading_bot.pid
    echo "Trading bot stopped"
else
    # Try to find and kill by port
    PID=$(lsof -Pi :4534 -sTCP:LISTEN -t 2>/dev/null)
    if [ -n "$PID" ]; then
        kill $PID 2>/dev/null
        sleep 1
        echo "Trading bot stopped (found by port)"
    else
        echo "Trading bot was not running"
    fi
fi
```

## Step 4: Confirm Stopped

```bash
sleep 1
lsof -Pi :4534 -sTCP:LISTEN -t 2>/dev/null && echo "WARNING: Bot still running" || echo "Confirmed: Bot stopped"
```

Report final status to user.
