"""Helper functions for the application."""
from datetime import datetime, timedelta
from typing import List, Optional

from database import db


def parse_rrule(rrule_string: str, start_date: str, weeks_ahead: int = 8) -> List[str]:
    """Parse RRULE string and generate dates for the next N weeks.
    Supports: FREQ=DAILY, FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU
    """
    dates = []
    start = datetime.strptime(start_date, '%Y-%m-%d')
    end_date = start + timedelta(weeks=weeks_ahead)
    
    if not rrule_string or rrule_string.lower() == 'none':
        return [start_date]
    
    parts = dict(item.split('=') for item in rrule_string.split(';') if '=' in item)
    freq = parts.get('FREQ', 'WEEKLY')
    
    if freq == 'DAILY':
        current = start
        while current <= end_date:
            dates.append(current.strftime('%Y-%m-%d'))
            current += timedelta(days=1)
    elif freq == 'WEEKLY':
        byday = parts.get('BYDAY', 'MO,TU,WE,TH,FR,SA,SU').split(',')
        day_map = {'MO': 0, 'TU': 1, 'WE': 2, 'TH': 3, 'FR': 4, 'SA': 5, 'SU': 6}
        target_days = [day_map.get(d.strip(), 0) for d in byday]
        
        current = start
        while current <= end_date:
            if current.weekday() in target_days:
                dates.append(current.strftime('%Y-%m-%d'))
            current += timedelta(days=1)
    
    return dates


def generate_dates_from_recurrence(
    recurrence_type: str,
    start_date: str,
    end_date: Optional[str],
    interval_weeks: int,
    days_of_week: List[int],
    weeks_ahead: int = 12
) -> List[str]:
    """
    Generate occurrence dates based on enhanced recurrence settings.
    
    Args:
        recurrence_type: 'none' or 'weekly'
        start_date: Start date in YYYY-MM-DD format
        end_date: Optional end date in YYYY-MM-DD format
        interval_weeks: Generate every N weeks (1, 2, etc.)
        days_of_week: List of weekday indices (0=Mon, 1=Tue, ..., 6=Sun)
        weeks_ahead: Default weeks to generate if no end_date
    
    Returns:
        List of date strings in YYYY-MM-DD format
    """
    dates = []
    start = datetime.strptime(start_date, '%Y-%m-%d')
    
    if recurrence_type == 'none' or not days_of_week:
        return [start_date]
    
    if end_date:
        end = datetime.strptime(end_date, '%Y-%m-%d')
    else:
        end = start + timedelta(weeks=weeks_ahead)
    
    current = start
    last_week_start = start - timedelta(days=start.weekday())
    
    while current <= end:
        current_week_start = current - timedelta(days=current.weekday())
        weeks_since_start = (current_week_start - last_week_start).days // 7
        
        if weeks_since_start % interval_weeks == 0:
            if current.weekday() in days_of_week and current >= start:
                dates.append(current.strftime('%Y-%m-%d'))
        
        current += timedelta(days=1)
    
    return dates


async def get_content_with_publish_statuses(content_id: str, team_id: str = None, main_site_id: str = None) -> dict:
    """Get content item with all publish statuses and featured images."""
    # Build query that supports both team_id and main_site_id
    query = {"id": content_id}
    if main_site_id:
        query["main_site_id"] = main_site_id
    elif team_id:
        query["team_id"] = team_id
    
    content = await db.content_items.find_one(query, {"_id": 0})
    
    # If not found with specific filter, try finding by id alone (for backwards compat)
    if not content:
        content = await db.content_items.find_one({"id": content_id}, {"_id": 0})
    
    if not content:
        return None
    
    # Add category info
    if content.get("category_id"):
        category = await db.categories.find_one({"id": content["category_id"]}, {"_id": 0})
        if category:
            content["category"] = category
    
    # Add creator name
    if content.get("created_by"):
        creator = await db.users.find_one({"id": content["created_by"]}, {"_id": 0, "name": 1})
        if creator:
            content["created_by_name"] = creator.get("name", "Unknown")
    
    # Add approver name
    if content.get("approved_by"):
        approver = await db.users.find_one({"id": content["approved_by"]}, {"_id": 0, "name": 1})
        if approver:
            content["approved_by_name"] = approver.get("name", "Unknown")
    
    publish_statuses = await db.content_item_publishes.find(
        {"content_item_id": content_id},
        {"_id": 0}
    ).to_list(100)
    
    for ps in publish_statuses:
        site = await db.wordpress_sites.find_one({"id": ps["wordpress_site_id"]}, {"_id": 0})
        ps["wordpress_site_name"] = site["name"] if site else "Unknown"
        
        featured_image = await db.content_item_featured_images.find_one(
            {"content_item_id": content_id, "wordpress_site_id": ps["wordpress_site_id"]},
            {"_id": 0}
        )
        if featured_image:
            featured_image["wordpress_site_name"] = ps["wordpress_site_name"]
        ps["featured_image"] = featured_image
    
    content["publish_statuses"] = publish_statuses
    return content
