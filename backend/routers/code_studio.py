"""Clara Code Studio — Low-code web builder.

Manages sites, pages, templates, components, and publishing.
"""
import uuid
import re
import logging
import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel

from database import db
from services.auth import get_current_user
from services.object_storage import upload_file, get_object

logger = logging.getLogger(__name__)

code_studio_router = APIRouter(prefix="/code-studio", tags=["Code Studio"])


# ── Models ──

class CreateSiteBody(BaseModel):
    name: str
    slug: str
    custom_domain: Optional[str] = None
    template_id: Optional[str] = None
    linked_main_site_id: Optional[str] = None


class UpdateSiteBody(BaseModel):
    name: Optional[str] = None
    custom_domain: Optional[str] = None
    favicon_url: Optional[str] = None
    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    custom_css: Optional[str] = None
    custom_js: Optional[str] = None
    published: Optional[bool] = None
    linked_main_site_id: Optional[str] = None


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
    "creative_studio": {
        "id": "creative_studio",
        "name": "Creative Studio",
        "description": "Bold typography + floating icons, for agencies, studios and artists",
        "category": "creative",
        "thumbnail": "https://images.unsplash.com/photo-1558655146-9f40138edfeb?w=400&h=260&fit=crop",
        "pages": [
            {
                "title": "Home",
                "slug": "index",
                "sections": [
                    {**NAVBAR_SECTION, "props": {**NAVBAR_SECTION["props"], "brand": "Pallet Ross", "style": "light",
                        "links": [
                            {"label": "Get Started", "url": "#/start"},
                            {"label": "Create Strategy", "url": "#/strategy"},
                            {"label": "Pricing", "url": "#/pricing"},
                            {"label": "Contact", "url": "#/contact"},
                            {"label": "Solution", "url": "#/solution"},
                            {"label": "E-Commerce", "url": "#/commerce"},
                        ],
                        "cta_text": "Sign in"}},
                    {"id": "hero", "type": "hero", "order": 0, "props": {
                        "headline": "Our vision for any art technology.",
                        "subheadline": "Every piece of art tells a story. Echoes of expression, characters, drawings — it all begins with a bold idea.",
                        "cta_text": "Get started",
                        "cta_url": "#/start",
                        "layout": "left",
                        "bg_mode": "solid",
                        "section_bg_color": "#f4f4f5",
                        "heading_color": "#18181b",
                        "text_color": "#52525b",
                        "accent_color": "#18181b",
                        "heading_size": "80px",
                        "padding_top": "100px",
                        "padding_bottom": "140px",
                        "animation": "fade_up",
                    }},
                    {"id": "gallery", "type": "gallery", "order": 1, "props": {
                        "headline": "Our work",
                        "subheadline": "A selection of projects from business to personal",
                        "columns": 3,
                        "section_bg_color": "#ffffff",
                        "heading_color": "#18181b",
                        "text_color": "#71717a",
                        "padding_top": "80px",
                        "padding_bottom": "80px",
                        "animation": "fade_up",
                        "images": [
                            {"url": "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=600&h=700&fit=crop", "alt": "Staff", "caption": "STAFF NO OR ONCE MORE"},
                            {"url": "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&h=700&fit=crop", "alt": "Knit", "caption": "A knit by le FLEUR"},
                            {"url": "https://images.unsplash.com/photo-1578632749014-ca77efd052eb?w=600&h=700&fit=crop", "alt": "Green Knight", "caption": "THE GREEN KNIGHT"},
                            {"url": "https://images.unsplash.com/photo-1488831404244-66b2e34b9c67?w=600&h=700&fit=crop", "alt": "All Good Things", "caption": "ALL GOOD THINGS"},
                            {"url": "https://images.unsplash.com/photo-1490349368154-73de9c9bc37c?w=600&h=700&fit=crop", "alt": "Limmer 90", "caption": "LIMMER 90"},
                            {"url": "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=600&h=700&fit=crop", "alt": "Fluffy Worm", "caption": "FLUFFY WORM"},
                        ],
                    }},
                    {"id": "features", "type": "features", "order": 2, "props": {
                        "headline": "What we do",
                        "subheadline": "Our craft, in one place",
                        "columns": 3,
                        "section_bg_color": "#f4f4f5",
                        "heading_color": "#18181b",
                        "text_color": "#71717a",
                        "padding_top": "80px",
                        "padding_bottom": "80px",
                        "animation": "fade_up",
                        "features": [
                            {"title": "Brand Identity", "description": "Logo systems, visual language and guidelines."},
                            {"title": "Art Direction", "description": "Campaign concepts and creative vision for any medium."},
                            {"title": "Digital Craft", "description": "Websites, apps and motion that feel like art."},
                        ],
                    }},
                    {"id": "cta", "type": "cta", "order": 3, "props": {
                        "headline": "Let's make something unforgettable.",
                        "subheadline": "Every great piece of art starts with a conversation.",
                        "cta_text": "Start a project",
                        "cta_url": "#/contact",
                        "bg_mode": "solid",
                        "section_bg_color": "#18181b",
                        "heading_color": "#ffffff",
                        "text_color": "#a1a1aa",
                        "accent_color": "#fafafa",
                        "animation": "zoom_in",
                    }},
                    {**FOOTER_SECTION, "props": {**FOOTER_SECTION["props"], "company_name": "Pallet Ross",
                        "links": [{"label": "Work", "url": "#/"}, {"label": "Contact", "url": "#/contact"}, {"label": "Instagram", "url": "#"}, {"label": "Behance", "url": "#"}]}},
                ],
            },
            {
                "title": "Work",
                "slug": "work",
                "sections": [
                    {**NAVBAR_SECTION, "props": {**NAVBAR_SECTION["props"], "brand": "Pallet Ross", "style": "light"}},
                    {"id": "gallery", "type": "gallery", "order": 0, "props": {
                        "headline": "Selected work",
                        "subheadline": "Business · Personal · Explorations",
                        "columns": 3,
                        "section_bg_color": "#ffffff",
                        "heading_color": "#18181b",
                        "text_color": "#71717a",
                        "padding_top": "100px",
                        "padding_bottom": "100px",
                        "animation": "fade_up",
                        "images": [
                            {"url": "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=600&h=700&fit=crop", "caption": "Brand · 2024"},
                            {"url": "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&h=700&fit=crop", "caption": "Campaign · 2024"},
                            {"url": "https://images.unsplash.com/photo-1578632749014-ca77efd052eb?w=600&h=700&fit=crop", "caption": "Poster · 2023"},
                        ],
                    }},
                    {**FOOTER_SECTION, "props": {**FOOTER_SECTION["props"], "company_name": "Pallet Ross"}},
                ],
            },
            {
                "title": "Contact",
                "slug": "contact",
                "sections": [
                    {**NAVBAR_SECTION, "props": {**NAVBAR_SECTION["props"], "brand": "Pallet Ross", "style": "light"}},
                    {**CONTACT_SECTION, "props": {**CONTACT_SECTION["props"], "headline": "Let's talk.",
                        "subheadline": "Tell us about your project — we answer within 24 hours.",
                        "section_bg_color": "#f4f4f5", "heading_color": "#18181b", "text_color": "#52525b",
                        "accent_color": "#18181b", "padding_top": "100px", "padding_bottom": "100px",
                        "animation": "fade_up"}},
                    {**FOOTER_SECTION, "props": {**FOOTER_SECTION["props"], "company_name": "Pallet Ross"}},
                ],
            },
        ],
    },
    "radio_site": {
        "id": "radio_site",
        "name": "Radio site",
        "description": "Radio station website — live player, shows, DJs, news and community. Dark theme with purple & green accents.",
        "category": "media",
        "thumbnail": "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=400&h=260&fit=crop",
        "pages": [
            {
                "title": "Home",
                "slug": "index",
                "sections": [
                    {**NAVBAR_SECTION, "props": {**NAVBAR_SECTION["props"], "brand": "Your Radio", "style": "dark",
                        "bg_color": "#111618",
                        "text_color": "#ffffff",
                        "cta_text": "Luister live",
                        "cta_url": "#/player",
                        "links": [
                            {"label": "Home", "url": "#/"},
                            {"label": "Shows", "url": "#/shows"},
                            {"label": "Dj's", "url": "#/djs"},
                            {"label": "Nieuws", "url": "#/nieuws"},
                            {"label": "Contact", "url": "#/contact"},
                        ]}},
                    {"id": "hero", "type": "hero", "order": 0, "props": {
                        "headline": "altijd dichtbij",
                        "subheadline": "De stem van jouw regio — 24/7 muziek, nieuws, shows en community.",
                        "cta_text": "Luister live",
                        "cta_url": "#/player",
                        "badge": "NU ON AIR",
                        "layout": "center",
                        "bg_mode": "gradient",
                        "gradient_from": "#5e2470",
                        "gradient_to": "#111618",
                        "gradient_direction": "to bottom right",
                        "hero_image": "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=900&h=700&fit=crop",
                        "heading_color": "#ffffff",
                        "text_color": "#e5d7eb",
                        "accent_color": "#9bc451",
                        "heading_size": "72px",
                        "padding_top": "140px",
                        "padding_bottom": "140px",
                        "animation": "fade_up",
                    }},
                    {"id": "features", "type": "features", "order": 1, "props": {
                        "headline": "de shows",
                        "subheadline": "Elke dag een nieuw programma, een nieuwe vibe",
                        "columns": 3,
                        "section_bg_color": "#111618",
                        "heading_color": "#ffffff",
                        "text_color": "#a1a1aa",
                        "accent_color": "#9bc451",
                        "padding_top": "100px",
                        "padding_bottom": "100px",
                        "animation": "fade_up",
                        "features": [
                            {"icon": "sunrise", "title": "De Ochtendshow", "description": "Maandag t/m vrijdag · 06:00 - 10:00"},
                            {"icon": "coffee", "title": "Koffie & Klets", "description": "Maandag t/m vrijdag · 10:00 - 13:00"},
                            {"icon": "music", "title": "Middagmix", "description": "Maandag t/m vrijdag · 13:00 - 16:00"},
                            {"icon": "radio", "title": "Spits FM", "description": "Maandag t/m vrijdag · 16:00 - 19:00"},
                            {"icon": "moon", "title": "Avondprogramma", "description": "Maandag t/m vrijdag · 19:00 - 22:00"},
                            {"icon": "disc", "title": "Nachtradio", "description": "Elke nacht · 22:00 - 06:00"},
                        ],
                    }},
                    {"id": "image_text", "type": "image_text", "order": 2, "props": {
                        "headline": "social club",
                        "subheadline": "De community achter het station — fans, artiesten, en vrienden van het huis.",
                        "bullets": [
                            "Wekelijkse meet & greets met je favoriete DJs",
                            "Exclusieve tickets voor lokale concerten",
                            "Contests, prijzen & backstage content",
                        ],
                        "image_url": "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=700&h=600&fit=crop",
                        "image_position": "right",
                        "section_bg_color": "#ffffff",
                        "heading_color": "#111618",
                        "text_color": "#52525b",
                        "accent_color": "#5e2470",
                        "padding_top": "100px",
                        "padding_bottom": "100px",
                        "animation": "fade_up",
                    }},
                    {"id": "gallery", "type": "gallery", "order": 3, "props": {
                        "headline": "onze dj's",
                        "subheadline": "Het team achter de microfoon",
                        "columns": 4,
                        "section_bg_color": "#f4f4f5",
                        "heading_color": "#111618",
                        "text_color": "#71717a",
                        "padding_top": "100px",
                        "padding_bottom": "100px",
                        "animation": "fade_up",
                        "images": [
                            {"url": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&h=500&fit=crop", "alt": "DJ 1", "caption": "DJ Name"},
                            {"url": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=500&h=500&fit=crop", "alt": "DJ 2", "caption": "DJ Name"},
                            {"url": "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=500&h=500&fit=crop", "alt": "DJ 3", "caption": "DJ Name"},
                            {"url": "https://images.unsplash.com/photo-1489424731084-a5d8b219a5bb?w=500&h=500&fit=crop", "alt": "DJ 4", "caption": "DJ Name"},
                            {"url": "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=500&h=500&fit=crop", "alt": "DJ 5", "caption": "DJ Name"},
                            {"url": "https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=500&h=500&fit=crop", "alt": "DJ 6", "caption": "DJ Name"},
                            {"url": "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=500&h=500&fit=crop", "alt": "DJ 7", "caption": "DJ Name"},
                            {"url": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=500&h=500&fit=crop", "alt": "DJ 8", "caption": "DJ Name"},
                        ],
                    }},
                    {"id": "cta", "type": "cta", "order": 4, "props": {
                        "headline": "Meedoen met de radio?",
                        "subheadline": "Muziekwens, dedicatie of nieuws delen? Stuur een berichtje naar de studio.",
                        "cta_text": "Contacteer de studio",
                        "cta_url": "#/contact",
                        "bg_mode": "gradient",
                        "gradient_from": "#5e2470",
                        "gradient_to": "#9bc451",
                        "gradient_direction": "to right",
                        "heading_color": "#ffffff",
                        "text_color": "#f3e8ff",
                        "accent_color": "#ffffff",
                        "padding_top": "100px",
                        "padding_bottom": "100px",
                        "animation": "zoom_in",
                    }},
                    {**FOOTER_SECTION, "props": {**FOOTER_SECTION["props"],
                        "company_name": "Your Radio",
                        "tagline": "altijd dichtbij",
                        "bg_color": "#111618",
                        "text_color": "#ffffff",
                        "links": [
                            {"label": "Home", "url": "#/"},
                            {"label": "Shows", "url": "#/shows"},
                            {"label": "Dj's", "url": "#/djs"},
                            {"label": "Nieuws", "url": "#/nieuws"},
                            {"label": "Contact", "url": "#/contact"},
                            {"label": "Privacy", "url": "#/privacy"},
                        ],
                        "copyright": "2026 Your Radio. Alle rechten voorbehouden.",
                    }},
                ],
            },
            {
                "title": "Shows",
                "slug": "shows",
                "sections": [
                    {**NAVBAR_SECTION, "props": {**NAVBAR_SECTION["props"], "brand": "Your Radio", "style": "dark",
                        "bg_color": "#111618", "text_color": "#ffffff"}},
                    {"id": "hero", "type": "hero", "order": 0, "props": {
                        "headline": "De programmatie",
                        "subheadline": "Een volle week vol muziek, nieuws en verhalen.",
                        "layout": "center",
                        "bg_mode": "solid",
                        "section_bg_color": "#111618",
                        "heading_color": "#ffffff",
                        "text_color": "#e5d7eb",
                        "accent_color": "#9bc451",
                        "heading_size": "56px",
                        "padding_top": "100px",
                        "padding_bottom": "60px",
                        "animation": "fade_up",
                    }},
                    {"id": "features", "type": "features", "order": 1, "props": {
                        "headline": "Vaste shows",
                        "subheadline": "Iedere dag live vanuit de studio",
                        "columns": 2,
                        "section_bg_color": "#ffffff",
                        "heading_color": "#111618",
                        "text_color": "#52525b",
                        "accent_color": "#5e2470",
                        "padding_top": "80px",
                        "padding_bottom": "80px",
                        "animation": "fade_up",
                        "features": [
                            {"icon": "sunrise", "title": "De Ochtendshow", "description": "Wakker worden met energie, hits en de beste nieuwsflashen — maandag tot vrijdag 06:00 - 10:00"},
                            {"icon": "coffee", "title": "Koffie & Klets", "description": "De leukste gasten en warme gesprekken — maandag tot vrijdag 10:00 - 13:00"},
                            {"icon": "music", "title": "Middagmix", "description": "Non-stop muziek voor tijdens de middag — maandag tot vrijdag 13:00 - 16:00"},
                            {"icon": "radio", "title": "Spits FM", "description": "De ideale soundtrack voor je rit naar huis — maandag tot vrijdag 16:00 - 19:00"},
                        ],
                    }},
                    {**FOOTER_SECTION, "props": {**FOOTER_SECTION["props"],
                        "company_name": "Your Radio", "bg_color": "#111618", "text_color": "#ffffff"}},
                ],
            },
            {
                "title": "Contact",
                "slug": "contact",
                "sections": [
                    {**NAVBAR_SECTION, "props": {**NAVBAR_SECTION["props"], "brand": "Your Radio", "style": "dark",
                        "bg_color": "#111618", "text_color": "#ffffff"}},
                    {**CONTACT_SECTION, "props": {**CONTACT_SECTION["props"],
                        "headline": "Contact de studio",
                        "subheadline": "Muziekwens, opmerking of idee? Laat van je horen.",
                        "section_bg_color": "#111618",
                        "heading_color": "#ffffff",
                        "text_color": "#e5d7eb",
                        "accent_color": "#9bc451",
                        "padding_top": "100px",
                        "padding_bottom": "100px",
                        "animation": "fade_up"}},
                    {**FOOTER_SECTION, "props": {**FOOTER_SECTION["props"],
                        "company_name": "Your Radio", "bg_color": "#111618", "text_color": "#ffffff"}},
                ],
            },
        ],
    },
    "fresh_market": {
        "id": "fresh_market",
        "name": "Fresh Market",
        "description": "Bright, vibrant e-commerce for organic produce, juice bars & food stores",
        "category": "ecommerce",
        "thumbnail": "https://images.unsplash.com/photo-1610348725531-843dff563e2c?w=400&h=260&fit=crop",
        "pages": [
            {
                "title": "Home",
                "slug": "index",
                "sections": [
                    {**NAVBAR_SECTION, "props": {**NAVBAR_SECTION["props"], "brand": "Freshly", "links": [
                        {"label": "Shop", "url": "#/shop"},
                        {"label": "About", "url": "#/about"},
                        {"label": "Recipes", "url": "#/recipes"},
                        {"label": "Contact", "url": "#/contact"},
                    ], "cta_text": "Order now", "style": "light"}},
                    {"id": "hero", "type": "hero", "order": 0, "props": {
                        "headline": "Fresh fruits, delivered daily.",
                        "subheadline": "Hand-picked, locally-sourced organic produce — from farm to your table in under 24 hours.",
                        "cta_text": "Shop the market",
                        "cta_url": "#/shop",
                        "badge": "Always organic · Always fresh",
                        "hero_image": "https://images.unsplash.com/photo-1610348725531-843dff563e2c?w=700&h=700&fit=crop",
                        "layout": "left",
                        "bg_mode": "gradient",
                        "gradient_from": "#d9f99d",
                        "gradient_to": "#fde68a",
                        "gradient_direction": "to bottom right",
                        "heading_color": "#14532d",
                        "text_color": "#3f6212",
                        "accent_color": "#65a30d",
                        "heading_size": "56px",
                    }},
                    {"id": "categories", "type": "features", "order": 1, "props": {
                        "headline": "Shop by category",
                        "subheadline": "Everything you need for a healthy kitchen",
                        "columns": 4,
                        "heading_color": "#14532d",
                        "text_color": "#4d7c0f",
                        "section_bg_color": "#ffffff",
                        "padding_top": "80px",
                        "padding_bottom": "80px",
                        "features": [
                            {"title": "Fresh Fruits", "description": "Seasonal · Organic", "image_url": "https://images.unsplash.com/photo-1619566636858-adf3ef46400b?w=400&h=400&fit=crop"},
                            {"title": "Green Veggies", "description": "Locally farmed", "image_url": "https://images.unsplash.com/photo-1557844352-761f2565b576?w=400&h=400&fit=crop"},
                            {"title": "Cold Pressed Juice", "description": "Made daily", "image_url": "https://images.unsplash.com/photo-1622597467836-f3285f2131b8?w=400&h=400&fit=crop"},
                            {"title": "Healthy Snacks", "description": "Guilt-free", "image_url": "https://images.unsplash.com/photo-1606787366850-de6330128bfc?w=400&h=400&fit=crop"},
                        ],
                    }},
                    {"id": "image_text_1", "type": "image_text", "order": 2, "props": {
                        "headline": "Farm-to-table in 24 hours",
                        "subheadline": "We partner with local farmers to bring you produce that's never more than a day old.",
                        "bullets": ["100% organic certified", "Same-day harvest to doorstep", "Zero waste packaging"],
                        "image_url": "https://images.unsplash.com/photo-1506617420156-8e4536971650?w=700&h=500&fit=crop",
                        "image_position": "right",
                        "cta_text": "Meet our farmers",
                        "cta_url": "#/about",
                        "bg_color": "bg-lime-100",
                        "section_bg_color": "#ecfccb",
                        "heading_color": "#14532d",
                        "text_color": "#4d7c0f",
                        "accent_color": "#65a30d",
                    }},
                    {"id": "gallery", "type": "gallery", "order": 3, "props": {
                        "headline": "This week's picks",
                        "subheadline": "Hand-selected just for you",
                        "columns": 3,
                        "heading_color": "#14532d",
                        "text_color": "#4d7c0f",
                        "section_bg_color": "#ffffff",
                        "padding_top": "80px",
                        "padding_bottom": "80px",
                        "images": [
                            {"url": "https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=600&h=600&fit=crop", "alt": "Avocados", "caption": "Avocados · €3.50"},
                            {"url": "https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=600&h=600&fit=crop", "alt": "Strawberries", "caption": "Strawberries · €4.20"},
                            {"url": "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=600&h=600&fit=crop", "alt": "Peaches", "caption": "Peaches · €3.80"},
                        ],
                    }},
                    {"id": "testimonials", "type": "testimonials", "order": 4, "props": {
                        "headline": "Loved by foodies everywhere",
                        "section_bg_color": "#fef3c7",
                        "heading_color": "#7c2d12",
                        "text_color": "#9a3412",
                        "padding_top": "80px",
                        "padding_bottom": "80px",
                        "items": [
                            {"name": "Sophie L.", "role": "Home chef", "quote": "The strawberries tasted like actual strawberries — I'd forgotten what that was like."},
                            {"name": "Tom V.", "role": "Restaurant owner", "quote": "We source 80% of our produce from Freshly. Consistent, beautiful, fresh."},
                        ],
                    }},
                    {"id": "cta", "type": "cta", "order": 5, "props": {
                        "headline": "Try your first box free",
                        "subheadline": "No subscription, no strings. Just a box of fresh goodness.",
                        "cta_text": "Claim your free box",
                        "cta_url": "#/shop",
                        "bg_mode": "gradient",
                        "gradient_from": "#65a30d",
                        "gradient_to": "#84cc16",
                        "gradient_direction": "to right",
                        "accent_color": "#fef3c7",
                        "heading_color": "#ffffff",
                        "text_color": "#ecfccb",
                    }},
                    {**FOOTER_SECTION, "props": {**FOOTER_SECTION["props"], "company_name": "Freshly", "section_bg_color": "#14532d",
                        "links": [{"label": "Shop", "url": "#/shop"}, {"label": "About", "url": "#/about"}, {"label": "Contact", "url": "#/contact"}, {"label": "FAQ", "url": "#"}]}},
                ],
            },
            {
                "title": "Shop",
                "slug": "shop",
                "sections": [
                    {**NAVBAR_SECTION, "props": {**NAVBAR_SECTION["props"], "brand": "Freshly", "links": [
                        {"label": "Home", "url": "#/"}, {"label": "About", "url": "#/about"}, {"label": "Contact", "url": "#/contact"},
                    ], "cta_text": "Cart (0)", "style": "light"}},
                    {"id": "hero", "type": "hero", "order": 0, "props": {
                        "headline": "Shop the market",
                        "subheadline": "All products · Fresh this week",
                        "layout": "center",
                        "bg_mode": "solid", "section_bg_color": "#ecfccb",
                        "heading_color": "#14532d", "text_color": "#4d7c0f",
                        "padding_top": "100px", "padding_bottom": "80px",
                    }},
                    {"id": "products", "type": "gallery", "order": 1, "props": {
                        "headline": "Fresh Produce",
                        "subheadline": "Pick what you love",
                        "columns": 4,
                        "section_bg_color": "#ffffff",
                        "heading_color": "#14532d", "text_color": "#65a30d",
                        "images": [
                            {"url": "https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=500&h=500&fit=crop", "alt": "Avocados", "caption": "Avocados · €3.50"},
                            {"url": "https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=500&h=500&fit=crop", "alt": "Strawberries", "caption": "Strawberries · €4.20"},
                            {"url": "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=500&h=500&fit=crop", "alt": "Peaches", "caption": "Peaches · €3.80"},
                            {"url": "https://images.unsplash.com/photo-1619566636858-adf3ef46400b?w=500&h=500&fit=crop", "alt": "Citrus mix", "caption": "Citrus · €5.10"},
                            {"url": "https://images.unsplash.com/photo-1557844352-761f2565b576?w=500&h=500&fit=crop", "alt": "Greens", "caption": "Kale bundle · €2.90"},
                            {"url": "https://images.unsplash.com/photo-1546470427-e26264be0b0d?w=500&h=500&fit=crop", "alt": "Tomatoes", "caption": "Tomatoes · €3.20"},
                        ],
                    }},
                    {**FOOTER_SECTION, "props": {**FOOTER_SECTION["props"], "company_name": "Freshly", "section_bg_color": "#14532d"}},
                ],
            },
            {
                "title": "About",
                "slug": "about",
                "sections": [
                    {**NAVBAR_SECTION, "props": {**NAVBAR_SECTION["props"], "brand": "Freshly", "style": "light",
                        "links": [{"label": "Home", "url": "#/"}, {"label": "Shop", "url": "#/shop"}, {"label": "Contact", "url": "#/contact"}]}},
                    {"id": "hero", "type": "hero", "order": 0, "props": {
                        "headline": "Small farms, big flavours",
                        "subheadline": "We started Freshly because we were tired of tasteless supermarket produce. Five years and 200+ farmer partners later, we're still obsessed.",
                        "layout": "left",
                        "hero_image": "https://images.unsplash.com/photo-1542838132-92c53300491e?w=700&h=700&fit=crop",
                        "bg_mode": "solid", "section_bg_color": "#fef3c7",
                        "heading_color": "#7c2d12", "text_color": "#9a3412",
                    }},
                    {"id": "features", "type": "features", "order": 1, "props": {
                        "headline": "Our values",
                        "columns": 3,
                        "section_bg_color": "#ffffff", "heading_color": "#14532d", "text_color": "#4d7c0f",
                        "features": [
                            {"title": "Local first", "description": "We source from farms within 100km whenever possible."},
                            {"title": "Zero waste", "description": "Compostable packaging and donated surplus."},
                            {"title": "Fair pay", "description": "Our farmers earn 3x the market average."},
                        ],
                    }},
                    {**FOOTER_SECTION, "props": {**FOOTER_SECTION["props"], "company_name": "Freshly", "section_bg_color": "#14532d"}},
                ],
            },
            {
                "title": "Contact",
                "slug": "contact",
                "sections": [
                    {**NAVBAR_SECTION, "props": {**NAVBAR_SECTION["props"], "brand": "Freshly", "style": "light",
                        "links": [{"label": "Home", "url": "#/"}, {"label": "Shop", "url": "#/shop"}, {"label": "About", "url": "#/about"}]}},
                    {**CONTACT_SECTION, "props": {**CONTACT_SECTION["props"], "headline": "Questions? Want to partner?",
                        "subheadline": "Drop us a note — we answer within 24 hours.",
                        "section_bg_color": "#ecfccb", "heading_color": "#14532d", "text_color": "#4d7c0f",
                        "accent_color": "#65a30d", "padding_top": "100px", "padding_bottom": "100px"}},
                    {**FOOTER_SECTION, "props": {**FOOTER_SECTION["props"], "company_name": "Freshly", "section_bg_color": "#14532d"}},
                ],
            },
        ],
    },
    "modern_ecommerce": {
        "id": "modern_ecommerce",
        "name": "Modern E-commerce",
        "description": "Clean, minimal product store with pastel accents",
        "category": "ecommerce",
        "thumbnail": "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=400&h=260&fit=crop",
        "pages": [
            {
                "title": "Home",
                "slug": "index",
                "sections": [
                    {**NAVBAR_SECTION, "props": {**NAVBAR_SECTION["props"], "brand": "Atelier", "style": "light",
                        "links": [{"label": "Shop", "url": "#/shop"}, {"label": "Collections", "url": "#/collections"}, {"label": "Journal", "url": "#/journal"}, {"label": "Contact", "url": "#/contact"}],
                        "cta_text": "Cart"}},
                    {"id": "hero", "type": "hero", "order": 0, "props": {
                        "headline": "Considered objects for everyday living.",
                        "subheadline": "Timeless pieces made slowly, in small batches, by makers we know by name.",
                        "cta_text": "Explore the collection", "cta_url": "#/shop",
                        "hero_image": "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800&h=800&fit=crop",
                        "layout": "left",
                        "bg_mode": "solid", "section_bg_color": "#f5f5f4",
                        "heading_color": "#1c1917", "text_color": "#57534e",
                        "accent_color": "#78716c", "heading_size": "64px",
                    }},
                    {"id": "features", "type": "features", "order": 1, "props": {
                        "headline": "Featured",
                        "columns": 3,
                        "section_bg_color": "#ffffff",
                        "heading_color": "#1c1917", "text_color": "#78716c",
                        "padding_top": "100px", "padding_bottom": "100px",
                        "features": [
                            {"title": "Linen Throw", "description": "€89", "image_url": "https://images.unsplash.com/photo-1567016376408-0226e4d0c1ea?w=500&h=600&fit=crop"},
                            {"title": "Ceramic Vase", "description": "€65", "image_url": "https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=500&h=600&fit=crop"},
                            {"title": "Wool Pillow", "description": "€45", "image_url": "https://images.unsplash.com/photo-1540574163026-643ea20ade25?w=500&h=600&fit=crop"},
                        ],
                    }},
                    {"id": "image_text_1", "type": "image_text", "order": 2, "props": {
                        "headline": "Made to last decades, not seasons",
                        "subheadline": "Every piece in our collection is designed to outlive trends — and most of us.",
                        "bullets": ["Hand-finished", "Lifetime repair guarantee", "Ethically sourced"],
                        "image_url": "https://images.unsplash.com/photo-1556228578-dd6e8ea1a95e?w=700&h=500&fit=crop",
                        "image_position": "left",
                        "cta_text": "Our philosophy", "cta_url": "#/about",
                        "section_bg_color": "#fafaf9", "heading_color": "#1c1917", "text_color": "#57534e",
                        "accent_color": "#78716c",
                    }},
                    {**CTA_SECTION, "props": {"headline": "Join the studio", "subheadline": "Early access, behind-the-scenes, and 10% off your first order.",
                        "cta_text": "Subscribe", "bg_mode": "solid", "section_bg_color": "#1c1917",
                        "heading_color": "#ffffff", "text_color": "#d6d3d1", "accent_color": "#f5f5f4"}},
                    {**FOOTER_SECTION, "props": {**FOOTER_SECTION["props"], "company_name": "Atelier"}},
                ],
            },
            {
                "title": "Shop",
                "slug": "shop",
                "sections": [
                    {**NAVBAR_SECTION, "props": {**NAVBAR_SECTION["props"], "brand": "Atelier", "style": "light"}},
                    {"id": "products", "type": "gallery", "order": 0, "props": {
                        "headline": "All products", "subheadline": "Shop the full collection",
                        "columns": 4, "section_bg_color": "#ffffff",
                        "padding_top": "100px", "padding_bottom": "100px",
                        "heading_color": "#1c1917", "text_color": "#78716c",
                        "images": [
                            {"url": "https://images.unsplash.com/photo-1567016376408-0226e4d0c1ea?w=500&h=600&fit=crop", "caption": "Linen Throw · €89"},
                            {"url": "https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=500&h=600&fit=crop", "caption": "Ceramic Vase · €65"},
                            {"url": "https://images.unsplash.com/photo-1540574163026-643ea20ade25?w=500&h=600&fit=crop", "caption": "Wool Pillow · €45"},
                            {"url": "https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=500&h=600&fit=crop", "caption": "Oak Stool · €180"},
                        ],
                    }},
                    {**FOOTER_SECTION, "props": {**FOOTER_SECTION["props"], "company_name": "Atelier"}},
                ],
            },
            {
                "title": "Journal",
                "slug": "journal",
                "sections": [
                    {**NAVBAR_SECTION, "props": {**NAVBAR_SECTION["props"], "brand": "Atelier", "style": "light"}},
                    {"id": "feed", "type": "news_feed", "order": 0, "props": {
                        "headline": "From the studio", "subheadline": "Stories, interviews, and slow-made inspiration",
                        "columns": 3, "max_items": 9,
                        "section_bg_color": "#fafaf9", "heading_color": "#1c1917", "text_color": "#78716c",
                        "accent_color": "#78716c", "padding_top": "100px", "padding_bottom": "100px",
                    }},
                    {**FOOTER_SECTION, "props": {**FOOTER_SECTION["props"], "company_name": "Atelier"}},
                ],
            },
            {
                "title": "Contact",
                "slug": "contact",
                "sections": [
                    {**NAVBAR_SECTION, "props": {**NAVBAR_SECTION["props"], "brand": "Atelier", "style": "light"}},
                    {**CONTACT_SECTION, "props": {**CONTACT_SECTION["props"], "headline": "Say hello",
                        "subheadline": "Studio visits by appointment. Email us anytime.",
                        "section_bg_color": "#f5f5f4", "heading_color": "#1c1917", "text_color": "#57534e",
                        "accent_color": "#1c1917", "padding_top": "100px", "padding_bottom": "100px"}},
                    {**FOOTER_SECTION, "props": {**FOOTER_SECTION["props"], "company_name": "Atelier"}},
                ],
            },
        ],
    },
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
        "pages": [
            {"title": "Home", "slug": "index", "sections": [NAVBAR_SECTION, HERO_SECTION, FEATURES_SECTION, PRICING_SECTION, TESTIMONIALS_SECTION, CTA_SECTION, FOOTER_SECTION]},
            {"title": "Pricing", "slug": "pricing", "sections": [NAVBAR_SECTION, PRICING_SECTION, TESTIMONIALS_SECTION, FOOTER_SECTION]},
            {"title": "Contact", "slug": "contact", "sections": [NAVBAR_SECTION, CONTACT_SECTION, FOOTER_SECTION]},
        ],
    },
    "portfolio": {
        "id": "portfolio",
        "name": "Creative Portfolio",
        "description": "Showcase your work beautifully",
        "category": "creative",
        "thumbnail": "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=400&h=260&fit=crop",
        "pages": [
            {"title": "Home", "slug": "index", "sections": [
                NAVBAR_SECTION,
                {**HERO_SECTION, "props": {**HERO_SECTION["props"], "headline": "Hi, I'm a designer", "subheadline": "I create beautiful digital experiences that make people smile.", "layout": "left"}},
                GALLERY_SECTION,
                TESTIMONIALS_SECTION,
                FOOTER_SECTION,
            ]},
            {"title": "Work", "slug": "work", "sections": [NAVBAR_SECTION, GALLERY_SECTION, FOOTER_SECTION]},
            {"title": "Contact", "slug": "contact", "sections": [NAVBAR_SECTION, CONTACT_SECTION, FOOTER_SECTION]},
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
    {"type": "news_feed", "label": "News / Blog Feed", "icon": "newspaper", "category": "content"},
]


def _now():
    return datetime.now(timezone.utc).isoformat()


def _new_id():
    return str(uuid.uuid4())


def _default_news_feed_section():
    return {
        "id": "news_feed_auto",
        "type": "news_feed",
        "order": 99,
        "props": {
            "headline": "Latest news",
            "subheadline": "Fresh from our content library",
            "columns": 3,
            "max_items": 6,
            "section_bg_color": "#ffffff",
            "heading_color": "#18181b",
            "text_color": "#71717a",
            "accent_color": "#dd0c51",
            "padding_top": "80px",
            "padding_bottom": "80px",
        },
    }


def _get_template_pages(template):
    """Normalize a template to a list of page dicts.

    Supports both new-style templates with `pages` and legacy templates with a single `sections` list.
    Injects a default News Feed section into the home page of every template (just before the footer)
    unless one is already present.
    """
    if template.get("pages"):
        pages = [dict(p, sections=list(p.get("sections") or [])) for p in template["pages"]]
    else:
        pages = [{"title": "Home", "slug": "index", "sections": list(template.get("sections", []))}]

    # Inject News Feed into the home page (first page) if it doesn't already have one
    if pages:
        home = pages[0]
        section_types = [s.get("type") for s in home["sections"]]
        if "news_feed" not in section_types:
            # Find footer index; insert before it. If no footer, append at end.
            footer_idx = next((i for i, s in enumerate(home["sections"]) if s.get("type") == "footer"), None)
            nf_section = _default_news_feed_section()
            if footer_idx is not None:
                home["sections"] = home["sections"][:footer_idx] + [nf_section] + home["sections"][footer_idx:]
            else:
                home["sections"].append(nf_section)
    return pages


def _serialize_template(template):
    """Public view of a template (used by the list endpoint)."""
    pages = _get_template_pages(template)
    return {
        "id": template["id"],
        "name": template["name"],
        "description": template.get("description", ""),
        "category": template.get("category", "other"),
        "thumbnail": template.get("thumbnail", ""),
        "page_count": len(pages),
        "page_titles": [p.get("title", "Untitled") for p in pages],
    }


# ── API Endpoints ──

@code_studio_router.get("/templates")
async def list_templates():
    return [_serialize_template(t) for t in TEMPLATES.values()]


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
        "linked_main_site_id": body.linked_main_site_id or "",
        "main_site_id": current_user.get("main_site_id", ""),
        "created_by": current_user["id"],
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.code_studio_sites.insert_one(site)

    # Create all pages from the template
    template_pages = _get_template_pages(template)
    home_page_id = None
    for idx, p_def in enumerate(template_pages):
        page_id = _new_id()
        if idx == 0:
            home_page_id = page_id
        page_slug = p_def.get("slug") or (f"page-{idx}" if idx > 0 else "index")

        # Inject linked_main_site_id onto any news_feed sections so the feed auto-populates
        sections_with_link = []
        for s in p_def.get("sections", []):
            s_copy = dict(s)
            if s_copy.get("type") == "news_feed" and body.linked_main_site_id:
                s_copy["props"] = {**(s_copy.get("props") or {}), "main_site_id": body.linked_main_site_id}
            sections_with_link.append(s_copy)

        page = {
            "id": page_id,
            "site_id": site_id,
            "title": p_def.get("title") or f"Page {idx + 1}",
            "slug": page_slug,
            "sections": sections_with_link,
            "custom_css": "",
            "custom_html_head": "",
            "is_published": True,
            "is_home": idx == 0,
            "order": idx,
            "created_at": _now(),
            "updated_at": _now(),
        }
        await db.code_studio_pages.insert_one(page)

    return {"id": site_id, "page_id": home_page_id, "name": body.name, "slug": body.slug, "pages_created": len(template_pages)}


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


@code_studio_router.delete("/sites/{site_id}/pages/{page_id}")
async def delete_page(site_id: str, page_id: str, current_user: dict = Depends(get_current_user)):
    count = await db.code_studio_pages.count_documents({"site_id": site_id})
    if count <= 1:
        raise HTTPException(400, "Cannot delete the last page")
    await db.code_studio_pages.delete_one({"id": page_id, "site_id": site_id})
    return {"status": "ok"}


@code_studio_router.get("/sites/{site_id}/dns")
async def get_dns_info(site_id: str, current_user: dict = Depends(get_current_user)):
    site = await db.code_studio_sites.find_one({"id": site_id}, {"_id": 0})
    if not site:
        raise HTTPException(404, "Site not found")
    clara_domain = f"{site['slug']}.clara.koodh.com"
    records = [
        {"type": "CNAME", "name": site.get("custom_domain", "") or "(your domain)", "value": clara_domain, "ttl": 3600},
    ]
    if site.get("custom_domain"):
        records.append({"type": "TXT", "name": f"_clara-verify.{site['custom_domain']}", "value": f"clara-verify={site['id'][:12]}", "ttl": 3600})
    return {
        "clara_url": f"https://{clara_domain}",
        "custom_domain": site.get("custom_domain", ""),
        "domain_verified": site.get("domain_verified", False),
        "dns_records": records,
        "verified": site.get("domain_verified", False),
    }


class SetCustomDomainBody(BaseModel):
    custom_domain: str


@code_studio_router.post("/sites/{site_id}/custom-domain")
async def set_custom_domain(site_id: str, body: SetCustomDomainBody, current_user: dict = Depends(get_current_user)):
    site = await db.code_studio_sites.find_one({"id": site_id}, {"_id": 0})
    if not site:
        raise HTTPException(404, "Site not found")
    domain = (body.custom_domain or "").strip().lower().replace("https://", "").replace("http://", "").rstrip("/")
    if domain and not re.match(r"^[a-z0-9]([a-z0-9\-\.]*[a-z0-9])?\.[a-z]{2,}$", domain):
        raise HTTPException(400, "Invalid domain format")
    # Unique check across code studio + main sites
    if domain:
        conflict_cs = await db.code_studio_sites.find_one({"custom_domain": domain, "id": {"$ne": site_id}})
        if conflict_cs:
            raise HTTPException(400, "Domain already linked to another Code Studio site")
    await db.code_studio_sites.update_one(
        {"id": site_id},
        {"$set": {"custom_domain": domain, "domain_verified": False, "updated_at": _now()}}
    )
    return {"status": "ok", "custom_domain": domain}


@code_studio_router.post("/sites/{site_id}/custom-domain/verify")
async def verify_custom_domain(site_id: str, current_user: dict = Depends(get_current_user)):
    site = await db.code_studio_sites.find_one({"id": site_id}, {"_id": 0})
    if not site:
        raise HTTPException(404, "Site not found")
    domain = site.get("custom_domain")
    if not domain:
        raise HTTPException(400, "No custom domain set")

    import dns.resolver  # type: ignore
    clara_domain = f"{site['slug']}.clara.koodh.com"
    expected_txt = f"clara-verify={site['id'][:12]}"

    cname_ok = False
    cname_target = None
    try:
        answers = dns.resolver.resolve(domain, "CNAME")
        for rdata in answers:
            target = str(rdata.target).rstrip(".").lower()
            cname_target = target
            if "koodh.com" in target or target == clara_domain.lower():
                cname_ok = True
                break
    except Exception:
        # Fallback: try A records for Cloudflare-proxied apex domains
        try:
            a_answers = dns.resolver.resolve(domain, "A")
            ips = [str(r) for r in a_answers]
            cf_ranges = ("104.", "172.64.", "172.65.", "172.66.", "172.67.", "162.158.", "173.245.",
                         "141.101.", "108.162.", "190.93.", "188.114.", "197.234.240.", "198.41.",
                         "103.21.244.", "103.22.200.", "103.31.4.")
            if any(ip.startswith(r) for ip in ips for r in cf_ranges):
                cname_ok = True
                cname_target = ",".join(ips[:3]) + " (Cloudflare)"
        except Exception:
            pass

    txt_ok = False
    txt_error = None
    try:
        txt_answers = dns.resolver.resolve(f"_clara-verify.{domain}", "TXT")
        for rdata in txt_answers:
            values = [s.decode("utf-8", errors="ignore") if isinstance(s, bytes) else str(s) for s in rdata.strings]
            joined = " ".join(values)
            if expected_txt in joined:
                txt_ok = True
                break
    except Exception as e:
        txt_error = str(e)

    verified = cname_ok and txt_ok
    await db.code_studio_sites.update_one(
        {"id": site_id},
        {"$set": {"domain_verified": verified, "updated_at": _now()}}
    )
    return {
        "verified": verified,
        "cname_ok": cname_ok,
        "cname_target": cname_target,
        "txt_ok": txt_ok,
        "expected_txt": expected_txt,
        "txt_error": txt_error,
        "expected_cname_target": clara_domain,
    }


@code_studio_router.post("/sites/{site_id}/publish")
async def publish_site(site_id: str, current_user: dict = Depends(get_current_user)):
    await db.code_studio_sites.update_one({"id": site_id}, {"$set": {"published": True, "published_at": _now(), "updated_at": _now()}})
    return {"status": "published"}


ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"}
MAX_SIZE = 10 * 1024 * 1024  # 10 MB


@code_studio_router.post("/upload")
async def upload_image(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, f"File type not allowed: {file.content_type}")
    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(400, "File too large (max 10 MB)")
    result = upload_file(data, file.filename, file.content_type, folder="code-studio")
    doc = {
        "id": result["file_id"],
        "storage_path": result["storage_path"],
        "original_filename": result["original_filename"],
        "content_type": result["content_type"],
        "size": result["size"],
        "uploaded_by": current_user["id"],
        "created_at": _now(),
        "is_deleted": False,
    }
    await db.code_studio_files.insert_one(doc)
    serve_url = f"/api/code-studio/files/{result['file_id']}"
    return {"id": result["file_id"], "url": serve_url, "filename": file.filename, "size": result["size"]}


@code_studio_router.get("/files/{file_id}")
async def serve_file(file_id: str):
    record = await db.code_studio_files.find_one({"id": file_id, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(404, "File not found")
    data, content_type = get_object(record["storage_path"])
    return Response(content=data, media_type=record.get("content_type", content_type))


class AiCreateSiteBody(BaseModel):
    name: str
    slug: str
    pages: list
    linked_main_site_id: Optional[str] = None


@code_studio_router.post("/sites-from-ai")
async def create_site_from_ai(body: AiCreateSiteBody, current_user: dict = Depends(get_current_user)):
    """Create a Code Studio site from AI-generated pages (bypasses templates)."""
    existing = await db.code_studio_sites.find_one({"slug": body.slug})
    if existing:
        raise HTTPException(400, "A site with this slug already exists")
    site_id = _new_id()
    site = {
        "id": site_id,
        "name": body.name,
        "slug": body.slug,
        "custom_domain": "",
        "favicon_url": "",
        "meta_title": body.name,
        "meta_description": "",
        "custom_css": "",
        "custom_js": "",
        "published": False,
        "linked_main_site_id": body.linked_main_site_id or "",
        "main_site_id": current_user.get("main_site_id", ""),
        "created_by": current_user["id"],
        "created_at": _now(),
        "updated_at": _now(),
    }
    await db.code_studio_sites.insert_one(site)

    home_page_id = None
    for idx, p_def in enumerate(body.pages):
        page_id = _new_id()
        if idx == 0:
            home_page_id = page_id
        page_slug = p_def.get("slug") or (f"page-{idx}" if idx > 0 else "index")
        # Inject content library link onto news_feed sections
        sections = []
        for s in p_def.get("sections", []):
            s_copy = dict(s)
            if s_copy.get("type") == "news_feed" and body.linked_main_site_id:
                s_copy["props"] = {**(s_copy.get("props") or {}), "main_site_id": body.linked_main_site_id}
            sections.append(s_copy)

        await db.code_studio_pages.insert_one({
            "id": page_id,
            "site_id": site_id,
            "title": p_def.get("title") or f"Page {idx + 1}",
            "slug": page_slug,
            "sections": sections,
            "custom_css": "",
            "custom_html_head": "",
            "is_published": True,
            "is_home": idx == 0,
            "order": idx,
            "created_at": _now(),
            "updated_at": _now(),
        })

    return {"id": site_id, "page_id": home_page_id, "slug": body.slug, "pages_created": len(body.pages)}





class AiGenerateBody(BaseModel):
    prompt: str


AI_SITE_SYSTEM_PROMPT = """You are a world-class web designer generating multi-page websites for a drag-and-drop builder called Code Studio.

You output ONLY valid JSON — no markdown, no code fences, no commentary. Just a raw JSON object.

The JSON schema is:
{
  "name": "<Short site name, 2-4 words>",
  "theme": {"accent_color": "<hex>", "heading_color": "<hex>", "text_color": "<hex>", "section_bg_color": "<hex>"},
  "pages": [ { "title": "<Page title>", "slug": "<url-slug or 'index' for home>", "sections": [ <section objects> ] } ]
}

Each section object: {"id": "<unique>", "type": "<type>", "order": <int>, "props": { ... }}

Allowed section types and their props:
- navbar: { brand, style: "light"|"dark", links: [{label, url}], cta_text }
- hero: { headline, subheadline, cta_text, cta_url, badge?, hero_image? (Unsplash URL), layout: "left"|"center", bg_mode: "solid"|"gradient", gradient_from?, gradient_to?, gradient_direction?, section_bg_color?, heading_color, text_color, accent_color, heading_size (like "64px"), padding_top? }
- features: { headline, subheadline, columns: 2|3|4, features: [{title, description, image_url?}], section_bg_color, heading_color, text_color, accent_color }
- image_text: { headline, subheadline, bullets: [string], image_url (Unsplash), image_position: "left"|"right", cta_text, cta_url, section_bg_color, heading_color, text_color, accent_color }
- pricing: { headline, subheadline, plans: [{name, price, period, features: [string], cta, highlighted?}], section_bg_color, heading_color, text_color, accent_color }
- testimonials: { headline, items: [{name, role?, quote, avatar?}], section_bg_color, heading_color, text_color }
- gallery: { headline, subheadline, columns: 2|3|4, images: [{url (Unsplash), alt, caption}] }
- cta: { headline, subheadline, cta_text, cta_url, bg_mode: "gradient"|"solid", gradient_from, gradient_to, gradient_direction, heading_color, text_color, accent_color }
- contact: { headline, subheadline, fields: ["name","email","message"], submit_text, section_bg_color, heading_color, text_color, accent_color }
- news_feed: { headline, subheadline, columns, max_items, section_bg_color, heading_color, text_color, accent_color }
- footer: { company_name, links: [{label, url}], copyright }

DESIGN RULES:
- Every page starts with a navbar and ends with a footer.
- Home page: navbar + hero + 1-3 content sections + optional news_feed + cta + footer.
- Use real Unsplash URLs: https://images.unsplash.com/photo-XXXXXXXXX?w=700&h=700&fit=crop
- Cohesive color palette (hex values) matching the industry.
- Animations on content sections: "animation" prop = "fade_up" | "fade_in" | "slide_left" | "slide_right" | "zoom_in".
- Return 3-5 pages: Home + contextually relevant pages (About, Services, Contact, Shop, Work, Menu, Pricing, etc.).
- Section IDs unique, orders sequential starting from 0 per page.

OUTPUT ONLY THE RAW JSON OBJECT."""


@code_studio_router.post("/ai-generate")
async def ai_generate_site(body: AiGenerateBody, current_user: dict = Depends(get_current_user)):
    """Generate a multi-page site structure from a natural-language prompt via Claude Sonnet 4.5."""
    emergent_key = os.environ.get("EMERGENT_LLM_KEY")
    if not emergent_key:
        raise HTTPException(503, "AI generation is not configured (EMERGENT_LLM_KEY missing).")
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except ImportError:
        raise HTTPException(503, "AI generation requires emergentintegrations.")

    session_id = f"cs-ai-{current_user['id']}-{uuid.uuid4().hex[:8]}"
    chat = LlmChat(
        api_key=emergent_key,
        session_id=session_id,
        system_message=AI_SITE_SYSTEM_PROMPT,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    try:
        reply = await chat.send_message(UserMessage(text=body.prompt[:4000]))
    except Exception as e:
        logger.exception("AI generate failed")
        raise HTTPException(502, f"LLM error: {str(e)[:160]}")

    text = str(reply).strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)

    import json as _json
    try:
        result = _json.loads(text)
    except Exception:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if not m:
            raise HTTPException(502, "AI response was not valid JSON")
        try:
            result = _json.loads(m.group(0))
        except Exception as e:
            raise HTTPException(502, f"Could not parse AI output: {e}")

    pages = result.get("pages") or []
    if not pages:
        raise HTTPException(502, "AI did not return any pages")
    for idx, p in enumerate(pages):
        p.setdefault("title", f"Page {idx + 1}")
        p.setdefault("slug", "index" if idx == 0 else f"page-{idx}")
        for s_idx, s in enumerate(p.get("sections", []) or []):
            s.setdefault("id", f"{s.get('type', 'section')}-{idx}-{s_idx}-{uuid.uuid4().hex[:6]}")
            s.setdefault("order", s_idx)
            s.setdefault("props", {})

    return {
        "name": result.get("name", "AI Website"),
        "theme": result.get("theme", {}),
        "pages": pages,
    }


class CsPublishBody(BaseModel):
    site_id: str
    featured_image_url: Optional[str] = None


@code_studio_router.post("/content/{content_id}/publish")
async def publish_content_to_cs_site(content_id: str, body: CsPublishBody, current_user: dict = Depends(get_current_user)):
    """Publish a content item to a Code Studio site with optional featured image.

    Creates/updates an entry in content_item_publishes so the Content Library list
    shows the site name next to the published content.
    """
    content = await db.content_items.find_one({"id": content_id}, {"_id": 0})
    if not content:
        raise HTTPException(404, "Content not found")
    site = await db.code_studio_sites.find_one({"id": body.site_id}, {"_id": 0})
    if not site:
        raise HTTPException(404, "Code Studio site not found")

    # Mark content as ready (published)
    await db.content_items.update_one(
        {"id": content_id},
        {"$set": {"status": "ready", "updated_at": _now()}}
    )

    # Upsert publish status entry
    existing = await db.content_item_publishes.find_one({
        "content_item_id": content_id,
        "wordpress_site_id": body.site_id,
    })
    if existing:
        await db.content_item_publishes.update_one(
            {"id": existing["id"]},
            {"$set": {
                "sync_status": "synced",
                "target_type": "code_studio",
                "wordpress_site_name": site["name"],
                "last_synced_at": _now(),
                "updated_at": _now(),
            }}
        )
    else:
        await db.content_item_publishes.insert_one({
            "id": _new_id(),
            "content_item_id": content_id,
            "wordpress_site_id": body.site_id,
            "wordpress_site_name": site["name"],
            "target_type": "code_studio",
            "wp_status": "publish",
            "sync_status": "synced",
            "last_synced_at": _now(),
            "created_at": _now(),
            "updated_at": _now(),
        })

    # Featured image (optional) — upsert site-specific entry
    if body.featured_image_url:
        fi_existing = await db.content_item_featured_images.find_one({
            "content_item_id": content_id,
            "wordpress_site_id": body.site_id,
        })
        fi_doc = {
            "content_item_id": content_id,
            "wordpress_site_id": body.site_id,
            "wordpress_site_name": site["name"],
            "target_type": "code_studio",
            "s3_url": body.featured_image_url,
            "file_storage_key": body.featured_image_url,
            "file_name": body.featured_image_url.rsplit("/", 1)[-1][:120],
            "mime_type": "image/jpeg",
            "size": 0,
            "sync_status": "synced",
            "updated_at": _now(),
        }
        if fi_existing:
            await db.content_item_featured_images.update_one({"id": fi_existing["id"]}, {"$set": fi_doc})
        else:
            fi_doc.update({"id": _new_id(), "created_at": _now()})
            await db.content_item_featured_images.insert_one(fi_doc)

        # Also set content-level featured_image_url so the news feed can easily find it
        if not content.get("featured_image_url"):
            await db.content_items.update_one(
                {"id": content_id},
                {"$set": {"featured_image_url": body.featured_image_url}}
            )

    return {"status": "ok", "site_name": site["name"]}



async def get_content_feed(main_site_id: str, limit: int = 20):
    """Fetch published content items for the news feed section. Public endpoint."""
    items = []
    cursor = db.content_items.find(
        {
            "main_site_id": main_site_id,
            "is_deleted": {"$ne": True},
            "status": {"$in": ["ready", "published"]},
        },
        {"_id": 0, "id": 1, "title": 1, "slug": 1, "excerpt": 1, "featured_image_url": 1, "category": 1, "status": 1, "created_at": 1, "author_name": 1, "body": 1},
    ).sort("created_at", -1).limit(limit)
    async for doc in cursor:
        # Fall back to first 160 chars of body as excerpt if missing
        if not doc.get("excerpt") and doc.get("body"):
            text = re.sub(r"<[^>]+>", "", doc.get("body") or "")
            doc["excerpt"] = text.strip()[:180]
        doc.pop("body", None)
        items.append(doc)
    return items
