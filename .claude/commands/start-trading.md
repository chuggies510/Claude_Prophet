---
allowed-tools: Bash, Read, TodoWrite, mcp__prophet__get_account, mcp__prophet__get_datetime, mcp__prophet__get_session_status, mcp__prophet__get_positions, mcp__prophet__get_options_positions, mcp__prophet__get_managed_positions, mcp__prophet__get_quick_market_intelligence, mcp__prophet__analyze_stocks, mcp__prophet__get_quote, mcp__prophet__get_options_chain, mcp__prophet__place_options_order, mcp__prophet__place_managed_position, mcp__prophet__close_managed_position, mcp__prophet__log_activity, mcp__prophet__log_decision, mcp__prophet__find_similar_setups, mcp__prophet__store_trade_setup, mcp__prophet__get_trade_stats, mcp__prophet__search_news, mcp__prophet__get_marketwatch_topstories, mcp__prophet__wait
description: Start autonomous trading session following TRADING_RULES.md
argument-hint: [optional: specific focus like "scalps only" or "conservative"]
thinking: true
---

# Start Autonomous Trading

## Step 1: Ensure Backend Running

Check if Go trading bot is running on port 4534:
```bash
lsof -Pi :4534 -sTCP:LISTEN -t
```

If NOT running, start it (Go binary loads .env automatically):
```bash
nohup ./prophet_bot > trading_bot.log 2>&1 &
echo $! > trading_bot.pid
sleep 3
```

Verify with health check:
```bash
curl -s http://localhost:4534/health
```

If health check fails, clean up stale PID file:
```bash
if ! curl -s http://localhost:4534/health | grep -q "healthy"; then
    rm -f trading_bot.pid
    echo "ERROR: Bot failed to start. Check trading_bot.log"
fi
```

## Step 2: Initialize Session Tracking

Create todo list for trading session:
- Get account status and positions
- Analyze market intelligence
- Execute trading strategy per TRADING_RULES.md
- Monitor positions using get_session_status
- End-of-day review before market close
- Log session end at market close

## Step 3: Load Trading Rules

Read TRADING_RULES.md to understand all trading rules and constraints.

## Step 4: Get Market Context

1. Check datetime and market status with get_datetime
2. **VALIDATE MARKET HOURS:**
   - If market is CLOSED, inform user and exit
   - If is_early_close_day is true, note that market closes at 1:00 PM ET
   - If minutes_until_close < 30, warn user and ask to confirm (limited trading time)
   - If can_trade is false, do not proceed with new entries
3. Get account status with get_account
4. Get current positions with get_positions and get_options_positions
5. Get market intelligence with get_quick_market_intelligence

## Step 5: Begin Autonomous Trading Loop

**SESSION MANAGEMENT:**
- Before each wait cycle, call get_session_status
- Use recommended_wait_seconds from session status for wait duration
- If should_stop is true, proceed to Step 6 immediately
- If minutes_until_close < 30, switch to position review mode (no new entries)

**MONITORING INTERVALS (from get_session_status):**
- Scalp positions (DTE < 7): 5-10 minute intervals
- Swing positions (DTE >= 7): 30-60 minute intervals
- No positions: 15 minute intervals
- Market closing soon: 2 minute intervals

**TRADING RULES:**
Follow TRADING_RULES.md exactly. Key rules:
- Options-only trading (calls and puts)
- Maximum 15% of portfolio per position
- Maximum 10 positions simultaneously
- Use limit orders ONLY
- Log all decisions with log_decision
- Check positions 2-3x per day (open, midday, close)
- Stop trading if daily loss hits -5%

**AUTOMATIC SESSION END:**
Session ends automatically when get_session_status returns should_stop=true (market closed or < 5 min remaining).

If $ARGUMENTS provided, adjust strategy accordingly (e.g., "scalps only", "conservative").

## Step 6: End-of-Day Handling

When get_session_status returns should_stop=true OR minutes_until_close < 5:

1. Log session ending with log_activity (type: "SESSION_END")
2. Get final positions with get_options_positions
3. For each position with DTE < 3:
   - Warn: "Position X expires in Y days - consider closing"
4. Report session summary:
   - Starting portfolio value (from session start)
   - Ending portfolio value
   - Trades executed
   - Positions held overnight
5. Stop the trading loop - session complete
