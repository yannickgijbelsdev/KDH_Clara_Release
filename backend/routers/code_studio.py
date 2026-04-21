"""Clara Code Studio — Low-code web builder.

Manages sites, pages, templates, components, and publishing.
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from database import db
from services.auth import get_current_user

logger = logging.getLogger(__name__)

code_studio_router = APIRouter(prefix="/code-studio", tags=["Code Studio"])


# ── Models ──

class CreateSiteBody(BaseModel):
    name: str
    slug: str
    custom_domain: Optional[str] = None
    template_id: Optional[str] = None


class UpdateSiteBody(BaseModel):
    name: Optional[str] = None
    custom_domain: Optional[str] = None
    favicon_url: Optional[str] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    custom_css: Optional[str] = None
    custom_js: Optional[str] = None
    published: Optional[bool] = None


class SavePageBody(BaseModel):
    title: Optional[str] = None
    slug: Optional[str] = None
    sections: Optional[list] = None
    custom_css: Optional[str] = None
    custom_html_head: Optional[str] = None
    is_published: Optional[bool] = None


# ── Built-in Templates ──

HERO_SECTION = {
    "id": "hero", "type": "hero", "order": 0,
    "props": {
        "headline": "Build something amazing",
        "subheadline": "Create stunning websites with Clara Code Studio. No coding required.",
        "cta_text": "Get Started",
        "cta_url": "#",
        "bg_style": "gradient",
        "bg_gradient": "from-zinc-900 to-zinc-800",
        "text_color": "white",
        "layout": "center",
    }
}

FEATURES_SECTION = {
    "id": "features", "type": "features", "order": 1,
    "props": {
        "headline": "Everything you need",
        "subheadline": "Powerful features to build your dream website",
        "columns": 3,
        "features": [
            {"icon": "zap", "title": "Lightning Fast", "description": "Optimized for speed and performance"},
            {"icon": "shield", "title": "Secure by Default", "description": "Enterprise-grade security built in"},
            {"icon": "layout", "title": "Responsive Design", "description": "Looks great on every device"},
        ],
    }
}

PRICING_SECTION = {
    "id": "pricing", "type": "pricing", "order": 2,
    "props": {
        "headline": "Simple pricing",
        "subheadline": "No hidden fees. No surprises.",
        "plans": [
            {"name": "Starter", "price": "9", "period": "month", "features": ["5 pages", "Custom domain", "SSL included"], "cta": "Start Free", "highlighted": False},
            {"name": "Pro", "price": "29", "period": "month", "features": ["Unlimited pages", "Priority support", "Analytics", "Custom code"], "cta": "Get Pro", "highlighted": True},
            {"name": "Enterprise", "price": "99", "period": "month", "features": ["Everything in Pro", "SLA", "Dedicated support", "White label"], "cta": "Contact Us", "highlighted": False},
        ],
    }
}

TESTIMONIALS_SECTION = {
    "id": "testimonials", "type": "testimonials", "order": 3,
    "props": {
        "headline": "Loved by creators",
        "items": [
            {"name": "Sarah Chen", "role": "Founder, Designlab", "quote": "The easiest website builder I've ever used. Beautiful results in minutes.", "avatar": ""},
            {"name": "Marcus Johnson", "role": "CTO, TechFlow", "quote": "We switched from WordPress and never looked back. Clara Code Studio is incredible.", "avatar": ""},
            {"name": "Emma van Berg", "role": "Freelancer", "quote": "My clients love the sites I build with this. Fast, modern, and gorgeous.", "avatar": ""},
        ],
    }
}

CTA_SECTION = {
    "id": "cta", "type": "cta", "order": 4,
    "props": {
        "headline": "Ready to get started?",
        "subheadline": "Join thousands of creators building with Clara Code Studio.",
        "cta_text": "Start Building",
        "cta_url": "#",
        "bg_style": "gradient",
        "bg_gradient": "from-[#dd0c51] to-[#7c1ac8]",
    }
}

FOOTER_SECTION = {
    "id": "footer", "type": "footer", "order": 5,
    "props": {
        "company_name": "Your Company",
        "tagline": "Building the future, one website at a time.",
        "links": [
            {"label": "Home", "url": "#"},
            {"label": "Features", "url": "#features"},
            {"label": "Pricing", "url": "#pricing"},
            {"label": "Contact", "url": "#contact"},
        ],
        "copyright": "2026 Your Company. All rights reserved.",
    }
}

GALLERY_SECTION = {
    "id": "gallery", "type": "gallery", "order": 2,
    "props": {
        "headline": "Our Work",
        "subheadline": "A selection of our recent projects",
        "columns": 3,
        "images": [
            {"url": "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&h=400&fit=crop", "alt": "Project 1", "caption": "Web Design"},
            {"url": "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=600&h=400&fit=crop", "alt": "Project 2", "caption": "Development"},
            {"url": "https://images.unsplash.com/photo-1551650975-87deedd944c3?w=600&h=400&fit=crop", "alt": "Project 3", "caption": "Mobile App"},
        ],
    }
}

CONTACT_SECTION = {
    "id": "contact", "type": "contact", "order": 4,
    "props": {
        "headline": "Get in touch",
        "subheadline": "We'd love to hear from you",
        "fields": ["name", "email", "message"],
        "submit_text": "Send Message",
    }
}

NAVBAR_SECTION = {
    "id": "navbar", "type": "navbar", "order": -1,
    "props": {
        "brand": "YourBrand",
        "links": [
            {"label": "Home", "url": "#"},
            {"label": "Features", "url": "#features"},
            {"label": "Pricing", "url": "#pricing"},
            {"label": "Contact", "url": "#contact"},
        ],
        "cta_text": "Get Started",
        "cta_url": "#",
        "sticky": True,
        "style": "transparent",
    }
}

LOGOS_SECTION = {
    "id": "logos", "type": "logos", "order": 1,
    "props": {
        "headline": "Backed by the best",
        "logos": ["Lightspeed", "NEA", "Menlo Ventures", "Brex", "SVB", "Coatue"],
    }
}

IMAGE_TEXT_SECTION = {
    "id": "image_text", "type": "image_text", "order": 2,
    "props": {
        "headline": "Your investments on auto-pilot",
        "subheadline": "Investments shaped by your emotion, goals, and values.",
        "bullets": ["Personal AI advisor", "Adaptive portfolio", "Free investment matching"],
        "image_url": "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=600&h=400&fit=crop",
        "image_position": "right",
        "bg_color": "bg-lime-300",
        "text_color": "dark",
    }
}

TEMPLATES = {
    "fintech": {
        "id": "fintech",
        "name": "Fintech / AI Product",
        "description": "Bold dark hero with product image, logo bar, and modern cards",
        "category": "business",
        "thumbnail": "https://images.unsplash.com/photo-1563986768609-322da13575f2?w=400&h=260&fit=crop",
        "sections": [
            {**NAVBAR_SECTION, "props": {**NAVBAR_SECTION["props"], "brand": "Pointo", "links": [{"label": "Products", "url": "#"}, {"label": "Resources", "url": "#"}, {"label": "Pricing", "url": "#pricing"}], "cta_text": "Sign up", "style": "dark"}},
            {**HERO_SECTION, "id": "hero", "props": {
                "headline": "Let AI handle your money game",
                "subheadline": "Automated investing that adapts to your lifestyle.",
                "cta_text": "Get started",
                "cta_url": "#",
                "bg_style": "solid",
                "bg_gradient": "from-zinc-950 to-zinc-900",
                "text_color": "white",
                "layout": "left",
                "badge": "Over 1k thriving customers",
                "hero_image": "https://images.unsplash.com/photo-1563986768609-322da13575f2?w=500&h=600&fit=crop",
            }},
            LOGOS_SECTION,
            {**FEATURES_SECTION, "props": {
                "headline": "Crafts a portfolio that fits you perfectly",
                "subheadline": "Investments shaped by your emotion, goals, and values",
                "columns": 3,
                "features": [
                    {"icon": "wallet", "title": "Spending", "description": "Tracks all your spending to keep your finances healthy", "image_url": "https://images.unsplash.com/photo-1554244933-d876deb6b2ff?w=400&h=300&fit=crop"},
                    {"icon": "target", "title": "Goals", "description": "Your portfolio seamlessly shapes itself around your goals", "image_url": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=300&fit=crop"},
                    {"icon": "leaf", "title": "Values", "description": "Whether it's carbon-neutral companies or social impact", "image_url": "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=400&h=300&fit=crop"},
                ],
            }},
            IMAGE_TEXT_SECTION,
            {**IMAGE_TEXT_SECTION, "id": "image_text_2", "props": {
                "headline": "Free investment matching",
                "subheadline": "We'll match 1% of your spending every month as an investing bonus account.",
                "bullets": [],
                "image_url": "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&h=400&fit=crop",
                "image_position": "left",
                "bg_color": "bg-white",
                "text_color": "dark",
                "cta_text": "Explore our product",
                "cta_url": "#",
            }},
            {**TESTIMONIALS_SECTION, "props": {
                "headline": "Ace is fuelling futures",
                "items": [
                    {"name": "Anton", "role": "Startup Founder", "quote": "The best investment tool I've ever used. My portfolio grew 40% in the first year.", "avatar": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop"},
                    {"name": "Emmy", "role": "Freelance Designer", "quote": "I love how it adapts to my spending habits. Investing on autopilot is a game changer.", "avatar": "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=200&h=200&fit=crop"},
                ],
            }},
            {**CTA_SECTION, "props": {"headline": "Pointo your finances", "subheadline": "Free for 14 days. No credit card required.", "cta_text": "Get Started", "cta_url": "#", "bg_style": "solid", "bg_gradient": "from-zinc-950 to-zinc-900"}},
            {**FOOTER_SECTION, "props": {**FOOTER_SECTION["props"], "company_name": "Pointo", "tagline": "Smart investing for everyone."}},
        ],
    },
    "saas_landing": {
        "id": "saas_landing",
        "name": "SaaS Landing Page",
        "description": "Modern landing page for software products",
        "category": "business",
        "thumbnail": "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=260&fit=crop",
        "sections": [NAVBAR_SECTION, HERO_SECTION, FEATURES_SECTION, PRICING_SECTION, TESTIMONIALS_SECTION, CTA_SECTION, FOOTER_SECTION],
    },
    "portfolio": {
        "id": "portfolio",
        "name": "Creative Portfolio",
        "description": "Showcase your work beautifully",
        "category": "creative",
        "thumbnail": "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=400&h=260&fit=crop",
        "sections": [
            NAVBAR_SECTION,
            {**HERO_SECTION, "props": {**HERO_SECTION["props"], "headline": "Hi, I'm a designer", "subheadline": "I create beautiful digital experiences that make people smile.", "layout": "left"}},
            GALLERY_SECTION,
            TESTIMONIALS_SECTION,
            CONTACT_SECTION,
            FOOTER_SECTION,
        ],
    },
    "agency": {
        "id": "agency",
        "name": "Digital Agency",
        "description": "Professional agency website",
        "category": "business",
        "thumbnail": "https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&h=260&fit=crop",
        "sections": [
            NAVBAR_SECTION,
            {**HERO_SECTION, "props": {**HERO_SECTION["props"], "headline": "We build digital products", "subheadline": "Award-winning agency creating brands, websites, and experiences.", "bg_gradient": "from-violet-950 to-indigo-900"}},
            FEATURES_SECTION,
            GALLERY_SECTION,
            TESTIMONIALS_SECTION,
            CTA_SECTION,
            FOOTER_SECTION,
        ],
    },
    "restaurant": {
        "id": "restaurant",
        "name": "Restaurant & Cafe",
        "description": "Elegant restaurant website",
        "category": "food",
        "thumbnail": "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=260&fit=crop",
        "sections": [
            NAVBAR_SECTION,
            {**HERO_SECTION, "props": {**HERO_SECTION["props"], "headline": "Fine Dining Experience", "subheadline": "Exquisite cuisine in a stunning setting. Reserve your table today.", "cta_text": "Reserve a Table", "bg_gradient": "from-amber-950 to-stone-900"}},
            FEATURES_SECTION,
            GALLERY_SECTION,
            CONTACT_SECTION,
            FOOTER_SECTION,
        ],
    },
    "startup": {
        "id": "startup",
        "name": "Startup Launch",
        "description": "Minimal launch page for startups",
        "category": "business",
        "thumbnail": "https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=400&h=260&fit=crop",
        "sections": [
            NAVBAR_SECTION,
            {**HERO_SECTION, "props": {**HERO_SECTION["props"], "headline": "The future of work", "subheadline": "AI-powered tools that help teams ship 10x faster.", "bg_gradient": "from-slate-950 to-blue-950"}},
            FEATURES_SECTION,
            PRICING_SECTION,
            CTA_SECTION,
            FOOTER_SECTION,
        ],
    },
    "blank": {
        "id": "blank",
        "name": "Blank Canvas",
        "description": "Start from scratch",
        "category": "other",
        "thumbnail": "",
        "sections": [NAVBAR_SECTION, FOOTER_SECTION],
    },
}

COMPONENT_LIBRARY = [
    {"type": "navbar", "label": "Navigation Bar", "icon": "menu", "category": "layout"},
    {"type": "hero", "label": "Hero Section", "icon": "layout", "category": "layout"},
    {"type": "features", "label": "Features Grid", "icon": "grid", "category": "content"},
    {"type": "pricing", "label": "Pricing Table", "icon": "credit-card", "category": "content"},
    {"type": "testimonials", "label": "Testimonials", "icon": "message-circle", "category": "social"},
    {"type": "gallery", "label": "Image Gallery", "icon": "image", "category": "media"},
    {"type": "contact", "label": "Contact Form", "icon": "mail", "category": "forms"},
    {"type": "cta", "label": "Call to Action", "icon": "megaphone", "category": "content"},
    {"type": "logos", "label": "Logo Bar", "icon": "award", "category": "content"},
    {"type": "image_text", "label": "Image + Text", "icon": "columns", "category": "content"},
    {"type": "footer", "label": "Footer", "icon": "minus", "category": "layout"},
    {"type": "text", "label": "Text Block", "icon": "type", "category": "content"},
    {"type": "image", "label": "Image", "icon": "image", "category": "media"},
    {"type": "video", "label": "Video Embed", "icon": "play", "category": "media"},
    {"type": "divider", "label": "Divider", "icon": "minus", "category": "layout"},
    {"type": "spacer", "label": "Spacer", "icon": "move-vertical", "category": "layout"},
    {"type": "html", "label": "Custom HTML", "icon": "code", "category": "advanced"},
]


def _now():
    return datetime.now(timezone.utc).isoformat()


def _new_id():
    return str(uuid.uuid4())


# ── API Endpoints ──

@code_studio_router.get("/templates")
async def list_templates():
    return list(TEMPLATES.values())


@code_studio_router.get("/components")
async def list_components():
    return COMPONENT_LIBRARY


@code_studio_router.get("/sites")
async def list_sites(current_user: dict = Depends(get_current_user)):
    main_site_id = current_user.get("main_site_id")
    query = {"main_site_id": main_site_id} if main_site_id else {"created_by": current_user["id"]}
    sites = []
    async for doc in db.code_studio_sites.find(query, {"_id": 0}):
        sites.append(doc)
    return sites


@code_studio_router.post("/sites")
async def create_site(body: CreateSiteBody, current_user: dict = Depends(get_current_user)):
    existing = await db.code_studio_sites.find_one({"slug": body.slug})
    if existing:
        raise HTTPException(400, "A site with this slug already exists")

    template = TEMPLATES.get(body.template_id, TEMPLATES["blank"])
    page_id = _new_id()
    site_id = _new_id()

    site = {
        "id": site_id,
        "name": body.name,
        "slug": body.slug,
        "custom_domain": body.custom_domain or "",
        "favicon_url": "",
        "meta_title": body.name,
        "meta_description": "",
        "custom_css": "",
        "custom_js": "",
        "published": False,
        "main_site_id": current_user.get("main_site_id", ""),
        "created_by": current_user["id"],
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.code_studio_sites.insert_one(site)

    page = {
        "id": page_id,
        "site_id": site_id,
        "title": "Home",
        "slug": "index",
        "sections": template["sections"],
        "custom_css": "",
        "custom_html_head": "",
        "is_published": True,
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.code_studio_pages.insert_one(page)

    return {"id": site_id, "page_id": page_id, "name": body.name, "slug": body.slug}


@code_studio_router.get("/sites/{site_id}")
async def get_site(site_id: str, current_user: dict = Depends(get_current_user)):
    site = await db.code_studio_sites.find_one({"id": site_id}, {"_id": 0})
    if not site:
        raise HTTPException(404, "Site not found")
    return site


@code_studio_router.put("/sites/{site_id}")
async def update_site(site_id: str, body: UpdateSiteBody, current_user: dict = Depends(get_current_user)):
    update = {k: v for k, v in body.dict(exclude_unset=True).items()}
    update["updated_at"] = _now()
    await db.code_studio_sites.update_one({"id": site_id}, {"$set": update})
    return {"status": "ok"}


@code_studio_router.delete("/sites/{site_id}")
async def delete_site(site_id: str, current_user: dict = Depends(get_current_user)):
    await db.code_studio_sites.delete_one({"id": site_id})
    await db.code_studio_pages.delete_many({"site_id": site_id})
    return {"status": "ok"}


@code_studio_router.get("/sites/{site_id}/pages")
async def list_pages(site_id: str, current_user: dict = Depends(get_current_user)):
    pages = []
    async for doc in db.code_studio_pages.find({"site_id": site_id}, {"_id": 0}):
        pages.append(doc)
    return pages


@code_studio_router.get("/sites/{site_id}/pages/{page_id}")
async def get_page(site_id: str, page_id: str, current_user: dict = Depends(get_current_user)):
    page = await db.code_studio_pages.find_one({"id": page_id, "site_id": site_id}, {"_id": 0})
    if not page:
        raise HTTPException(404, "Page not found")
    return page


@code_studio_router.put("/sites/{site_id}/pages/{page_id}")
async def update_page(site_id: str, page_id: str, body: SavePageBody, current_user: dict = Depends(get_current_user)):
    update = {k: v for k, v in body.dict(exclude_unset=True).items()}
    update["updated_at"] = _now()
    await db.code_studio_pages.update_one({"id": page_id, "site_id": site_id}, {"$set": update})
    return {"status": "ok"}


@code_studio_router.post("/sites/{site_id}/pages")
async def create_page(site_id: str, body: SavePageBody, current_user: dict = Depends(get_current_user)):
    page_id = _new_id()
    page = {
        "id": page_id,
        "site_id": site_id,
        "title": body.title or "New Page",
        "slug": body.slug or page_id[:8],
        "sections": body.sections or [],
        "custom_css": body.custom_css or "",
        "custom_html_head": body.custom_html_head or "",
        "is_published": body.is_published or False,
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.code_studio_pages.insert_one(page)
    return {"id": page_id}


@code_studio_router.get("/sites/{site_id}/dns")
async def get_dns_info(site_id: str, current_user: dict = Depends(get_current_user)):
    site = await db.code_studio_sites.find_one({"id": site_id}, {"_id": 0})
    if not site:
        raise HTTPException(404, "Site not found")
    clara_domain = f"{site['slug']}.clara.koodh.com"
    records = [
        {"type": "CNAME", "name": site.get("custom_domain", ""), "value": clara_domain, "ttl": 3600},
    ]
    if site.get("custom_domain"):
        records.append({"type": "TXT", "name": site["custom_domain"], "value": f"clara-verify={site['id'][:12]}", "ttl": 3600})
    return {
        "clara_url": f"https://{clara_domain}",
        "custom_domain": site.get("custom_domain", ""),
        "dns_records": records,
        "verified": False,
    }


@code_studio_router.post("/sites/{site_id}/publish")
async def publish_site(site_id: str, current_user: dict = Depends(get_current_user)):
    await db.code_studio_sites.update_one({"id": site_id}, {"$set": {"published": True, "published_at": _now(), "updated_at": _now()}})
    return {"status": "published"}
