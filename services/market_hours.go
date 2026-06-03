package services

import (
	"errors"
	"time"
)

// MarketHoursService provides market hours validation and timing information
type MarketHoursService struct {
	location *time.Location
}

// HolidayType represents the type of market holiday
type HolidayType string

const (
	HolidayClosed     HolidayType = "closed"
	HolidayEarlyClose HolidayType = "early_close"
)

// MarketStatus represents the current market status
type MarketStatus string

const (
	MarketOpen       MarketStatus = "OPEN"
	MarketPreMarket  MarketStatus = "PRE_MARKET"
	MarketAfterHours MarketStatus = "AFTER_HOURS"
	MarketClosed     MarketStatus = "CLOSED"
)

// US market holidays for 2025 and 2026
var marketHolidays = map[string]HolidayType{
	// 2025
	"2025-01-01": HolidayClosed,     // New Year's Day
	"2025-01-20": HolidayClosed,     // MLK Day
	"2025-02-17": HolidayClosed,     // Presidents Day
	"2025-04-18": HolidayClosed,     // Good Friday
	"2025-05-26": HolidayClosed,     // Memorial Day
	"2025-06-19": HolidayClosed,     // Juneteenth
	"2025-07-04": HolidayClosed,     // Independence Day
	"2025-09-01": HolidayClosed,     // Labor Day
	"2025-11-27": HolidayClosed,     // Thanksgiving
	"2025-11-28": HolidayEarlyClose, // Day after Thanksgiving (1 PM close)
	"2025-12-24": HolidayEarlyClose, // Christmas Eve (1 PM close)
	"2025-12-25": HolidayClosed,     // Christmas
	// 2026
	"2026-01-01": HolidayClosed,     // New Year's Day
	"2026-01-19": HolidayClosed,     // MLK Day
	"2026-02-16": HolidayClosed,     // Presidents Day
	"2026-04-03": HolidayClosed,     // Good Friday
	"2026-05-25": HolidayClosed,     // Memorial Day
	"2026-06-19": HolidayClosed,     // Juneteenth
	"2026-07-03": HolidayClosed,     // Independence Day (observed)
	"2026-09-07": HolidayClosed,     // Labor Day
	"2026-11-26": HolidayClosed,     // Thanksgiving
	"2026-11-27": HolidayEarlyClose, // Day after Thanksgiving (1 PM close)
	"2026-12-24": HolidayEarlyClose, // Christmas Eve (1 PM close)
	"2026-12-25": HolidayClosed,     // Christmas
}

// NewMarketHoursService creates a new market hours service
func NewMarketHoursService() (*MarketHoursService, error) {
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		return nil, err
	}
	return &MarketHoursService{location: loc}, nil
}

// GetMarketStatus returns the current market status and related information
func (s *MarketHoursService) GetMarketStatus() (MarketStatus, error) {
	now := time.Now().In(s.location)
	return s.GetMarketStatusAt(now), nil
}

// GetMarketStatusAt returns the market status at a specific time
func (s *MarketHoursService) GetMarketStatusAt(t time.Time) MarketStatus {
	t = t.In(s.location)
	dateStr := t.Format("2006-01-02")

	// Check if it's a holiday
	if holidayType, isHoliday := marketHolidays[dateStr]; isHoliday {
		if holidayType == HolidayClosed {
			return MarketClosed
		}
		// Early close day - check time
		if holidayType == HolidayEarlyClose {
			return s.getStatusForTime(t, 780) // 1:00 PM close
		}
	}

	// Check if it's a weekend
	weekday := t.Weekday()
	if weekday == time.Saturday || weekday == time.Sunday {
		return MarketClosed
	}

	return s.getStatusForTime(t, 960) // 4:00 PM close
}

// getStatusForTime returns the market status based on time of day
func (s *MarketHoursService) getStatusForTime(t time.Time, closeMinutes int) MarketStatus {
	minutes := t.Hour()*60 + t.Minute()

	if minutes >= 570 && minutes < closeMinutes { // 9:30 AM to close
		return MarketOpen
	} else if minutes >= 240 && minutes < 570 { // 4:00 AM to 9:30 AM
		return MarketPreMarket
	} else if minutes >= closeMinutes && minutes < 1200 { // close to 8:00 PM
		return MarketAfterHours
	}
	return MarketClosed
}

// IsMarketOpen returns true if the market is currently open for trading
func (s *MarketHoursService) IsMarketOpen() bool {
	status, _ := s.GetMarketStatus()
	return status == MarketOpen
}

// IsEarlyCloseDay returns true if today is an early close day (1 PM close)
func (s *MarketHoursService) IsEarlyCloseDay() bool {
	now := time.Now().In(s.location)
	return s.IsEarlyCloseDayAt(now)
}

// IsEarlyCloseDayAt returns true if the given date is an early close day
func (s *MarketHoursService) IsEarlyCloseDayAt(t time.Time) bool {
	dateStr := t.In(s.location).Format("2006-01-02")
	holidayType, isHoliday := marketHolidays[dateStr]
	return isHoliday && holidayType == HolidayEarlyClose
}

// GetMarketCloseTime returns the market close time for today (13:00 or 16:00)
func (s *MarketHoursService) GetMarketCloseTime() string {
	if s.IsEarlyCloseDay() {
		return "13:00"
	}
	return "16:00"
}

// GetMinutesUntilClose returns the number of minutes until market close
// Returns -1 if market is closed
func (s *MarketHoursService) GetMinutesUntilClose() int {
	now := time.Now().In(s.location)
	return s.GetMinutesUntilCloseAt(now)
}

// GetMinutesUntilCloseAt returns the number of minutes until market close from a given time
func (s *MarketHoursService) GetMinutesUntilCloseAt(t time.Time) int {
	t = t.In(s.location)
	status := s.GetMarketStatusAt(t)

	if status != MarketOpen {
		return -1
	}

	closeMinutes := 960 // 4:00 PM
	if s.IsEarlyCloseDayAt(t) {
		closeMinutes = 780 // 1:00 PM
	}

	currentMinutes := t.Hour()*60 + t.Minute()
	return closeMinutes - currentMinutes
}

// ValidateOrderTiming checks if orders can be placed at the current time
// Returns nil if trading is allowed, error with reason otherwise
func (s *MarketHoursService) ValidateOrderTiming() error {
	now := time.Now().In(s.location)
	dateStr := now.Format("2006-01-02")

	// Check if it's a holiday
	if holidayType, isHoliday := marketHolidays[dateStr]; isHoliday {
		if holidayType == HolidayClosed {
			return errors.New("market is closed today (holiday)")
		}
	}

	// Check if it's a weekend
	weekday := now.Weekday()
	if weekday == time.Saturday || weekday == time.Sunday {
		return errors.New("market is closed (weekend)")
	}

	minutes := now.Hour()*60 + now.Minute()
	closeMinutes := 960 // 4:00 PM
	if s.IsEarlyCloseDay() {
		closeMinutes = 780 // 1:00 PM
	}

	if minutes < 570 { // Before 9:30 AM
		return errors.New("market opens at 9:30 AM ET")
	}

	if minutes >= closeMinutes {
		closeTime := "4:00 PM"
		if s.IsEarlyCloseDay() {
			closeTime = "1:00 PM"
		}
		return errors.New("market closed at " + closeTime + " ET")
	}

	return nil
}

// CanTrade returns true if trading is currently allowed
func (s *MarketHoursService) CanTrade() bool {
	return s.ValidateOrderTiming() == nil
}

// MarketsOpenToday returns true if markets are open (or will be open) today
func (s *MarketHoursService) MarketsOpenToday() bool {
	now := time.Now().In(s.location)
	dateStr := now.Format("2006-01-02")

	// Check if it's a full holiday
	if holidayType, isHoliday := marketHolidays[dateStr]; isHoliday && holidayType == HolidayClosed {
		return false
	}

	// Check if it's a weekend
	weekday := now.Weekday()
	return weekday != time.Saturday && weekday != time.Sunday
}
