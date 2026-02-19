"""Timezone utilities for Clara Radio Dashboard.

ALL datetime operations in this application should use Brussels timezone (CET/CEST).
Shows, schedules, and RDS times are all in local Belgian time.

IMPORTANT: Never use timezone.utc directly for display or schedule matching.
Always use the functions in this module.
"""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

# The ONE TRUE timezone for this application
BRUSSELS_TZ = ZoneInfo('Europe/Brussels')

# Dutch weekday names
WEEKDAY_NAMES_NL = {
    0: 'maandag',
    1: 'dinsdag',
    2: 'woensdag',
    3: 'donderdag',
    4: 'vrijdag',
    5: 'zaterdag',
    6: 'zondag'
}


def now_brussels() -> datetime:
    """Get the current time in Brussels timezone.
    
    This is the ONLY function that should be used to get "now" for:
    - Schedule matching
    - Show time comparisons
    - RDS output
    - Any user-facing time display
    """
    return datetime.now(BRUSSELS_TZ)


def today_brussels() -> str:
    """Get today's date in Brussels timezone as YYYY-MM-DD string."""
    return now_brussels().strftime('%Y-%m-%d')


def current_time_brussels() -> str:
    """Get current time in Brussels timezone as HH:MM string."""
    return now_brussels().strftime('%H:%M')


def yesterday_brussels() -> str:
    """Get yesterday's date in Brussels timezone as YYYY-MM-DD string."""
    return (now_brussels() - timedelta(days=1)).strftime('%Y-%m-%d')


def get_weekday_name(date_str: str = None) -> str:
    """Get Dutch weekday name for a date.
    
    Args:
        date_str: Date in YYYY-MM-DD format. If None, uses today.
        
    Returns:
        Dutch weekday name (maandag, dinsdag, etc.)
    """
    if date_str:
        dt = datetime.strptime(date_str, '%Y-%m-%d')
    else:
        dt = now_brussels()
    return WEEKDAY_NAMES_NL[dt.weekday()]


def parse_datetime_brussels(dt_str: str) -> datetime:
    """Parse a datetime string and return it in Brussels timezone.
    
    Handles various formats and ensures the result is always in Brussels TZ.
    """
    # Remove 'Z' suffix and handle various formats
    dt_str = dt_str.replace('Z', '+00:00')
    
    try:
        dt = datetime.fromisoformat(dt_str)
    except ValueError:
        # Try parsing without timezone
        dt_str_clean = dt_str.split('+')[0].split('-')[0] if '+' in dt_str or dt_str.count('-') > 2 else dt_str
        dt = datetime.fromisoformat(dt_str_clean)
    
    # If naive, assume it's already in Brussels time
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=BRUSSELS_TZ)
    else:
        # Convert to Brussels time
        dt = dt.astimezone(BRUSSELS_TZ)
    
    return dt


def format_time_brussels(dt: datetime = None) -> str:
    """Format a datetime as HH:MM in Brussels timezone."""
    if dt is None:
        dt = now_brussels()
    elif dt.tzinfo is None:
        dt = dt.replace(tzinfo=BRUSSELS_TZ)
    else:
        dt = dt.astimezone(BRUSSELS_TZ)
    return dt.strftime('%H:%M')


def format_datetime_brussels(dt: datetime = None) -> str:
    """Format a datetime as ISO string in Brussels timezone."""
    if dt is None:
        dt = now_brussels()
    elif dt.tzinfo is None:
        dt = dt.replace(tzinfo=BRUSSELS_TZ)
    else:
        dt = dt.astimezone(BRUSSELS_TZ)
    return dt.isoformat()


def is_time_between(start_time: str, end_time: str, check_time: str = None) -> bool:
    """Check if a time is between start and end times.
    
    Handles midnight-crossing times (e.g., 22:00 - 02:00).
    
    Args:
        start_time: Start time as HH:MM
        end_time: End time as HH:MM
        check_time: Time to check as HH:MM. If None, uses current Brussels time.
        
    Returns:
        True if check_time is between start and end.
    """
    if check_time is None:
        check_time = current_time_brussels()
    
    if start_time <= end_time:
        # Normal case: show doesn't cross midnight
        return start_time <= check_time <= end_time
    else:
        # Midnight-crossing case: show goes from e.g. 22:00 to 02:00
        return check_time >= start_time or check_time <= end_time


def get_week_dates_brussels() -> tuple:
    """Get the start and end dates of the current week (Monday to Sunday).
    
    Returns:
        Tuple of (monday_date, sunday_date) as YYYY-MM-DD strings.
    """
    today = now_brussels().date()
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    return monday.strftime('%Y-%m-%d'), sunday.strftime('%Y-%m-%d')
