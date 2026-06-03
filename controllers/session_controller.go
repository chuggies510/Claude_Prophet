package controllers

import (
	"context"
	"math"
	"net/http"
	"prophet-trader/interfaces"
	"prophet-trader/services"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
)

// SessionController handles trading session status
type SessionController struct {
	tradingService     interfaces.TradingService
	marketHoursService *services.MarketHoursService
	logger             *logrus.Logger
}

// NewSessionController creates a new session controller
func NewSessionController(trading interfaces.TradingService) (*SessionController, error) {
	logger := logrus.New()
	logger.SetFormatter(&logrus.TextFormatter{
		FullTimestamp: true,
	})

	marketHours, err := services.NewMarketHoursService()
	if err != nil {
		return nil, err
	}

	return &SessionController{
		tradingService:     trading,
		marketHoursService: marketHours,
		logger:             logger,
	}, nil
}

// SessionStatusResponse represents the session status response
type SessionStatusResponse struct {
	MarketStatus           string           `json:"market_status"`
	MinutesUntilClose      int              `json:"minutes_until_close"`
	IsEarlyCloseDay        bool             `json:"is_early_close_day"`
	MarketCloseTime        string           `json:"market_close_time"`
	ShouldContinue         bool             `json:"should_continue"`
	ShouldStop             bool             `json:"should_stop"`
	RecommendedWaitSeconds int              `json:"recommended_wait_seconds"`
	WaitReason             string           `json:"wait_reason"`
	PositionsSummary       PositionsSummary `json:"positions_summary"`
}

// PositionsSummary summarizes the current positions for interval calculation
type PositionsSummary struct {
	Total  int `json:"total"`
	Scalps int `json:"scalps"`  // DTE < 7
	Swings int `json:"swings"`  // DTE >= 7
	MinDTE int `json:"min_dte"`
	MaxDTE int `json:"max_dte"`
}

// HandleGetSessionStatus returns the current trading session status
func (sc *SessionController) HandleGetSessionStatus(c *gin.Context) {
	status := sc.GetSessionStatus(c.Request.Context())
	c.JSON(http.StatusOK, status)
}

// GetSessionStatus calculates the current session status
func (sc *SessionController) GetSessionStatus(ctx context.Context) SessionStatusResponse {
	// Get market status
	marketStatus, _ := sc.marketHoursService.GetMarketStatus()
	minutesUntilClose := sc.marketHoursService.GetMinutesUntilClose()
	isEarlyClose := sc.marketHoursService.IsEarlyCloseDay()
	closeTime := sc.marketHoursService.GetMarketCloseTime()

	// Get positions and calculate summary
	positions, err := sc.tradingService.ListOptionsPositions(ctx)
	summary := sc.calculatePositionsSummary(positions, err)

	// Calculate recommended wait interval
	waitSeconds, waitReason := sc.calculateRecommendedWait(summary, minutesUntilClose)

	// Determine if trading should continue
	shouldContinue := marketStatus == services.MarketOpen && minutesUntilClose > 5
	shouldStop := marketStatus != services.MarketOpen || minutesUntilClose <= 0

	return SessionStatusResponse{
		MarketStatus:           string(marketStatus),
		MinutesUntilClose:      minutesUntilClose,
		IsEarlyCloseDay:        isEarlyClose,
		MarketCloseTime:        closeTime,
		ShouldContinue:         shouldContinue,
		ShouldStop:             shouldStop,
		RecommendedWaitSeconds: waitSeconds,
		WaitReason:             waitReason,
		PositionsSummary:       summary,
	}
}

// calculatePositionsSummary analyzes positions to determine DTE distribution
func (sc *SessionController) calculatePositionsSummary(positions []*interfaces.OptionsPosition, err error) PositionsSummary {
	if err != nil || len(positions) == 0 {
		return PositionsSummary{
			Total:  0,
			Scalps: 0,
			Swings: 0,
			MinDTE: 0,
			MaxDTE: 0,
		}
	}

	now := time.Now()
	minDTE := math.MaxInt32
	maxDTE := 0
	scalps := 0
	swings := 0

	for _, pos := range positions {
		// Calculate DTE from expiration
		dte := int(pos.Expiration.Sub(now).Hours() / 24)
		if dte < 0 {
			dte = 0
		}

		if dte < minDTE {
			minDTE = dte
		}
		if dte > maxDTE {
			maxDTE = dte
		}

		if dte < 7 {
			scalps++
		} else {
			swings++
		}
	}

	if minDTE == math.MaxInt32 {
		minDTE = 0
	}

	return PositionsSummary{
		Total:  len(positions),
		Scalps: scalps,
		Swings: swings,
		MinDTE: minDTE,
		MaxDTE: maxDTE,
	}
}

// calculateRecommendedWait determines the wait interval based on positions
func (sc *SessionController) calculateRecommendedWait(summary PositionsSummary, minutesUntilClose int) (int, string) {
	// If market closing soon, check more frequently
	if minutesUntilClose > 0 && minutesUntilClose <= 30 {
		return 120, "Market closing soon - checking every 2 minutes"
	}

	// No positions - moderate interval
	if summary.Total == 0 {
		return 900, "No open positions - checking every 15 minutes"
	}

	// Has scalp positions (DTE < 7) - short interval
	if summary.Scalps > 0 {
		return 300, "Scalp position (DTE < 7) requires frequent monitoring - checking every 5 minutes"
	}

	// Only swing positions (DTE >= 7) - longer interval
	return 1800, "Swing positions only (DTE >= 7) - checking every 30 minutes"
}
