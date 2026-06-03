# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Prophet Trader is an AI-powered autonomous options trading system that integrates Claude Code agents with a Go backend and Alpaca Markets API via MCP (Model Context Protocol).

**Architecture:**
```
Claude Code <---> MCP Server (Node.js) <---> Go Backend (Port 4534) <---> Alpaca API
                       ↓
                 Vector DB (SQLite + 384-dim embeddings for trade memory)
```

## Build and Run Commands

```bash
# Build Go backend
go build -o prophet_bot ./cmd/bot

# Run Go backend (requires env vars from .env)
./prophet_bot

# Install Node dependencies (first time only)
npm install

# Run autonomous trading session (starts backend + Claude agent)
./autonomous_trading.sh

# Stop trading bot
kill $(cat trading_bot.pid)
```

**Startup Sequence:**
1. Go backend must be running on port 4534 before MCP tools work
2. MCP server starts automatically via Claude Code's `.mcp.json` config
3. Check health: `curl http://localhost:4534/health`

## Environment Variables

Required in `.env`:
```bash
ALPACA_API_KEY=xxx       # Alpaca API key (public key)
ALPACA_SECRET_KEY=xxx    # Alpaca secret key
ALPACA_BASE_URL=         # Leave empty for paper trading (default: paper-api.alpaca.markets)
GEMINI_API_KEY=xxx       # For AI news summarization (optional)
```

## Code Architecture

### Go Backend (Port 4534)

| Layer | Location | Purpose |
|-------|----------|---------|
| Entry | `cmd/bot/main.go` | Server setup, route registration, background goroutines |
| Controllers | `controllers/` | HTTP handlers (order, position, news, intelligence, activity) |
| Services | `services/` | Business logic (Alpaca API, options, news, Gemini, position manager, technical analysis) |
| Database | `database/storage.go` | SQLite via GORM (positions, orders, bars, embeddings) |
| Interfaces | `interfaces/` | Type definitions for trading and options (80+ types) |
| Config | `config/config.go` | Environment variable loading |

### MCP Server (`mcp-server.js`)

Exposes 40+ tools to Claude Code agents via Model Context Protocol:

| Category | Key Tools |
|----------|-----------|
| Trading | `place_options_order`, `place_managed_position`, `cancel_order`, `close_managed_position` |
| Data | `get_account`, `get_options_positions`, `get_options_chain`, `get_quote`, `get_historical_bars` |
| Intelligence | `get_quick_market_intelligence`, `analyze_stocks`, `get_cleaned_news` |
| Vector search | `find_similar_setups`, `store_trade_setup`, `get_trade_stats` |
| Logging | `log_decision`, `log_activity`, `get_activity_log` |
| Utility | `wait`, `get_datetime` |

### Vector DB (`vectorDB.js`)

Uses local embedding model (Xenova/all-MiniLM-L6-v2) for trade similarity search:
- 384-dimensional embeddings stored in SQLite with sqlite-vec extension
- No API costs for embeddings
- Query: `find_similar_setups("SPY gap up scalp")` returns similar historical trades

### AI Agents (`.claude/agents/`)

| File | Agent Name | Purpose |
|------|------------|---------|
| `ceo-agent.md` | paragon-trading-ceo | Capital allocation, portfolio risk, strategic oversight |
| `strategy-agent.md` | stratagem-options-scalper | Short-term directional options trades |
| `consultant-agent.md` | daedalus-intelligence-director | Adversarial thinking, pressure-testing decisions |
| `engineer-agent.md` | forge-go-engineer | Go infrastructure development |

## Key Patterns

**Adding MCP Tools:**
1. Add HTTP endpoint in appropriate controller (`controllers/`)
2. Add route in `setupRouter()` in `cmd/bot/main.go`
3. Add tool handler in `mcp-server.js` (both `ListToolsRequestSchema` and `CallToolRequestSchema`)

**Request Flow:**
```
MCP Tool Call → axios → /api/v1/... → Controller → Service → Alpaca API
```

**Background Goroutines (started in main.go):**
- Position monitor: Every 5 minutes, saves position snapshots
- Data cleanup: Daily, removes data older than 90 days
- Managed position monitor: Watches for stop-loss/take-profit triggers

## Data Locations

| Path | Contents |
|------|----------|
| `activity_logs/` | Daily trading journals (JSON) |
| `decisive_actions/` | Individual trade decision logs (JSON, embedded for vector search) |
| `data/prophet_trader.db` | SQLite database (positions, orders, bars, trade_embeddings, trade_vectors) |
| `news_summaries/` | AI-generated news summaries |

## Trading System Notes

- Options-only system (calls and puts, no stock trading)
- Multi-timeframe: LEAPS (60-90+ DTE) + Scalping (0-5 DTE)
- Managed positions have auto stop-loss/take-profit via `place_managed_position`
- Paper trading by default (`ALPACA_BASE_URL` empty)
- Use limit orders for options (never market orders)
