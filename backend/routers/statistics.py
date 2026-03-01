"""Statistics router - Content publishing analytics per main site (network admin only)."""
import uuid
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import StreamingResponse
from database import db
from services.auth import get_current_user
from services.timezone_utils import now_brussels, BRUSSELS_TZ

statistics_router = APIRouter(prefix="/statistics", tags=["statistics"])


def require_network_admin(current_user: dict):
    if not current_user.get('is_network_admin'):
        raise HTTPException(status_code=403, detail="Network admin only")


async def resolve_site_team_ids(main_site_id: str) -> list:
    """Get all child site team_ids for a main site."""
    sites = await db.sites.find(
        {"main_site_id": main_site_id},
        {"_id": 0, "team_id": 1}
    ).to_list(500)
    team_ids = [s["team_id"] for s in sites if s.get("team_id")]
    return team_ids


async def get_content_query(main_site_id: str) -> dict:
    """Build query to find all content items for a main site."""
    return {"main_site_id": main_site_id, "deleted_at": {"$exists": False}}


@statistics_router.get("/{main_site_id}/overview")
async def get_overview(
    main_site_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get overview statistics for a main site."""
    require_network_admin(current_user)

    main_site = await db.main_sites.find_one({"id": main_site_id}, {"_id": 0})
    if not main_site:
        raise HTTPException(status_code=404, detail="Main site not found")

    content_query = await get_content_query(main_site_id)

    # Total content items
    total_items = await db.content_items.count_documents(content_query)

    # By approval status
    approved = await db.content_items.count_documents({**content_query, "approval_status": "approved"})
    pending = await db.content_items.count_documents({**content_query, "approval_status": "pending"})
    rejected = await db.content_items.count_documents({**content_query, "approval_status": "rejected"})

    # Get all content IDs for this main site
    content_ids = []
    async for item in db.content_items.find(content_query, {"_id": 0, "id": 1}):
        content_ids.append(item["id"])

    # Publish stats from content_item_publishes
    publish_query = {"content_item_id": {"$in": content_ids}} if content_ids else {"content_item_id": "__none__"}
    total_published = await db.content_item_publishes.count_documents({**publish_query, "sync_status": "synced"})
    total_scheduled = await db.content_item_publishes.count_documents({**publish_query, "sync_status": "scheduled"})
    total_failed = await db.content_item_publishes.count_documents({**publish_query, "sync_status": "failed"})

    # WordPress sites for this main site
    wp_sites = await db.wordpress_sites.find(
        {"main_site_id": main_site_id}, {"_id": 0, "id": 1, "name": 1}
    ).to_list(100)

    # Per-site publish counts
    site_stats = []
    for wp_site in wp_sites:
        synced = await db.content_item_publishes.count_documents({
            **publish_query, "wordpress_site_id": wp_site["id"], "sync_status": "synced"
        })
        scheduled = await db.content_item_publishes.count_documents({
            **publish_query, "wordpress_site_id": wp_site["id"], "sync_status": "scheduled"
        })
        site_stats.append({
            "site_id": wp_site["id"],
            "site_name": wp_site["name"],
            "published": synced,
            "scheduled": scheduled,
        })

    # Category breakdown
    cat_pipeline = [
        {"$match": {**content_query, "category_name": {"$exists": True, "$ne": None}}},
        {"$group": {"_id": "$category_name", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 15},
    ]
    categories = await db.content_items.aggregate(cat_pipeline).to_list(15)
    category_stats = [{"name": c["_id"], "count": c["count"]} for c in categories]

    return {
        "main_site_name": main_site.get("name", ""),
        "total_content_items": total_items,
        "approval": {"approved": approved, "pending": pending, "rejected": rejected},
        "publishing": {"published": total_published, "scheduled": total_scheduled, "failed": total_failed},
        "wordpress_sites": site_stats,
        "categories": category_stats,
    }


@statistics_router.get("/{main_site_id}/monthly")
async def get_monthly_stats(
    main_site_id: str,
    months: int = Query(default=12, ge=1, le=36),
    current_user: dict = Depends(get_current_user)
):
    """Get monthly content creation and publishing stats for charts."""
    require_network_admin(current_user)

    content_query = await get_content_query(main_site_id)

    # Get all content items with created_at dates
    items = await db.content_items.find(
        content_query, {"_id": 0, "id": 1, "created_at": 1, "created_by": 1, "approval_status": 1}
    ).to_list(10000)

    # Get all content IDs
    content_ids = [item["id"] for item in items]

    # Get all publishes
    publishes = []
    if content_ids:
        publishes = await db.content_item_publishes.find(
            {"content_item_id": {"$in": content_ids}},
            {"_id": 0, "created_at": 1, "sync_status": 1, "wp_status": 1, "wordpress_site_id": 1}
        ).to_list(10000)

    # Build monthly data
    now = now_brussels()
    monthly_data = []

    # Generate proper calendar months
    for i in range(months - 1, -1, -1):
        year = now.year
        month = now.month - i
        while month <= 0:
            month += 12
            year -= 1
        month_key = f"{year}-{month:02d}"
        month_label = datetime(year, month, 1).strftime("%b %Y")

        # Count content created this month
        created_count = 0
        for item in items:
            try:
                dt = datetime.fromisoformat(item["created_at"].replace("Z", "+00:00"))
                if dt.year == year and dt.month == month:
                    created_count += 1
            except (ValueError, AttributeError):
                pass

        # Count publishes this month
        published_count = 0
        scheduled_count = 0
        for pub in publishes:
            try:
                dt = datetime.fromisoformat(pub["created_at"].replace("Z", "+00:00"))
                if dt.year == year and dt.month == month:
                    if pub.get("sync_status") == "synced":
                        published_count += 1
                    elif pub.get("sync_status") == "scheduled":
                        scheduled_count += 1
            except (ValueError, AttributeError):
                pass

        monthly_data.append({
            "month": month_key,
            "label": month_label,
            "created": created_count,
            "published": published_count,
            "scheduled": scheduled_count,
            "total_output": published_count + scheduled_count,
        })

    return {"months": monthly_data}


@statistics_router.get("/{main_site_id}/top-authors")
async def get_top_authors(
    main_site_id: str,
    limit: int = Query(default=10, ge=1, le=50),
    current_user: dict = Depends(get_current_user)
):
    """Get top content creators for a main site."""
    require_network_admin(current_user)

    content_query = await get_content_query(main_site_id)

    # Aggregate by created_by
    pipeline = [
        {"$match": content_query},
        {"$group": {
            "_id": "$created_by",
            "total_items": {"$sum": 1},
            "approved": {"$sum": {"$cond": [{"$eq": ["$approval_status", "approved"]}, 1, 0]}},
            "pending": {"$sum": {"$cond": [{"$eq": ["$approval_status", "pending"]}, 1, 0]}},
            "rejected": {"$sum": {"$cond": [{"$eq": ["$approval_status", "rejected"]}, 1, 0]}},
        }},
        {"$sort": {"total_items": -1}},
        {"$limit": limit},
    ]
    author_stats = await db.content_items.aggregate(pipeline).to_list(limit)

    # Enrich with user names
    authors = []
    for stat in author_stats:
        user_id = stat["_id"]
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "name": 1, "email": 1, "avatar": 1})
        
        # Count published articles for this author
        author_content_ids = []
        async for item in db.content_items.find(
            {**content_query, "created_by": user_id}, {"_id": 0, "id": 1}
        ):
            author_content_ids.append(item["id"])

        published_count = 0
        if author_content_ids:
            published_count = await db.content_item_publishes.count_documents({
                "content_item_id": {"$in": author_content_ids},
                "sync_status": "synced"
            })

        authors.append({
            "user_id": user_id,
            "name": user.get("name", "Unknown") if user else "Unknown",
            "email": user.get("email", "") if user else "",
            "avatar": user.get("avatar") if user else None,
            "total_items": stat["total_items"],
            "approved": stat["approved"],
            "pending": stat["pending"],
            "rejected": stat["rejected"],
            "published_to_wp": published_count,
        })

    return {"authors": authors}


@statistics_router.get("/{main_site_id}/weekly-activity")
async def get_weekly_activity(
    main_site_id: str,
    weeks: int = Query(default=8, ge=1, le=52),
    current_user: dict = Depends(get_current_user)
):
    """Get weekly content activity for heatmap/activity chart."""
    require_network_admin(current_user)

    content_query = await get_content_query(main_site_id)
    items = await db.content_items.find(
        content_query, {"_id": 0, "created_at": 1}
    ).to_list(10000)

    now = now_brussels()
    weekly_data = []

    for i in range(weeks - 1, -1, -1):
        week_end = now - timedelta(weeks=i)
        week_start = week_end - timedelta(days=7)
        week_label = week_start.strftime("%d %b")

        count = 0
        for item in items:
            try:
                dt = datetime.fromisoformat(item["created_at"].replace("Z", "+00:00"))
                if week_start <= dt.astimezone(BRUSSELS_TZ) <= week_end:
                    count += 1
            except (ValueError, AttributeError):
                pass

        weekly_data.append({
            "week": week_label,
            "items_created": count,
        })

    return {"weeks": weekly_data}


@statistics_router.get("/{main_site_id}/per-site-monthly")
async def get_per_site_monthly(
    main_site_id: str,
    months: int = Query(default=12, ge=1, le=36),
    current_user: dict = Depends(get_current_user)
):
    """Get monthly publishing breakdown per WordPress site for stacked chart."""
    require_network_admin(current_user)

    content_query = await get_content_query(main_site_id)
    content_ids = []
    async for item in db.content_items.find(content_query, {"_id": 0, "id": 1}):
        content_ids.append(item["id"])

    wp_sites = await db.wordpress_sites.find(
        {"main_site_id": main_site_id}, {"_id": 0, "id": 1, "name": 1}
    ).to_list(100)

    publishes = []
    if content_ids:
        publishes = await db.content_item_publishes.find(
            {"content_item_id": {"$in": content_ids}},
            {"_id": 0, "created_at": 1, "wordpress_site_id": 1, "sync_status": 1}
        ).to_list(10000)

    now = now_brussels()
    monthly_data = []

    for i in range(months - 1, -1, -1):
        year = now.year
        month = now.month - i
        while month <= 0:
            month += 12
            year -= 1
        month_label = datetime(year, month, 1).strftime("%b %Y")

        entry = {"month": f"{year}-{month:02d}", "label": month_label}
        for wp_site in wp_sites:
            count = 0
            for pub in publishes:
                if pub.get("wordpress_site_id") != wp_site["id"]:
                    continue
                if pub.get("sync_status") not in ("synced", "scheduled"):
                    continue
                try:
                    dt = datetime.fromisoformat(pub["created_at"].replace("Z", "+00:00"))
                    if dt.year == year and dt.month == month:
                        count += 1
                except (ValueError, AttributeError):
                    pass
            entry[wp_site["name"]] = count

        monthly_data.append(entry)

    return {
        "months": monthly_data,
        "site_names": [s["name"] for s in wp_sites],
    }


@statistics_router.get("/{main_site_id}/export-pdf")
async def export_pdf(
    main_site_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Generate and download a PDF report for a main site's content statistics."""
    require_network_admin(current_user)

    from services.pdf_report import generate_statistics_pdf

    # Gather all data (reuse existing logic)
    overview_data = await get_overview(main_site_id, current_user)
    monthly_data = await get_monthly_stats(main_site_id, months=12, current_user=current_user)
    authors_data = await get_top_authors(main_site_id, limit=10, current_user=current_user)
    per_site_data = await get_per_site_monthly(main_site_id, months=12, current_user=current_user)
    weekly_data = await get_weekly_activity(main_site_id, weeks=12, current_user=current_user)

    pdf_buffer = generate_statistics_pdf(
        overview=overview_data,
        monthly=monthly_data,
        authors_data=authors_data,
        per_site=per_site_data,
        weekly_activity=weekly_data,
    )

    site_name = overview_data.get('main_site_name', 'statistics').replace(' ', '_')
    date_str = datetime.now().strftime('%Y-%m-%d')
    filename = f"{site_name}-report-{date_str}.pdf"

    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
