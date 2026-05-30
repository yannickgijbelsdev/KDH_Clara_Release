# 🔧 Hoe je het andere Emergent-project (media-group-web) fixt

## 🎯 Wat is er aan de hand?

Clara probeert artikelen te pushen naar `https://media-group-web.preview.emergentagent.com/api/clara-feature/*`, maar **al die endpoints geven 404**. De root van de site werkt wel (`/` → 200), dus de frontend draait. Het probleem is dat het **backend de Clara-feature endpoints niet (meer) heeft**.

Mogelijke oorzaken:
- De code is gerollback naar een versie van vóór de Clara-integratie.
- Bij een rebuild zijn de `/api/clara-feature/*` routes per ongeluk verwijderd.
- De FastAPI router voor Clara is uit `server.py` gesloopt.

## ✅ Wat je moet doen

**Open je andere Emergent-project** (`media-group-web`), start een nieuwe chat, en plak de **complete prompt hieronder** als allereerste bericht.

De prompt bevat al jouw **bestaande integration token** (`b9059dc8498f13170a3d0c69dc3739c49356d1319892d961`). Dat betekent: zodra het project opnieuw deploy't en zelf-registreert bij Clara, blijft de bestaande integratie gewoon **connected** — je hoeft niets opnieuw goed te keuren.

> 💡 **Tip**: je kan voortaan deze prompt ook in Clara opvragen via de nieuwe knop **"Prompt"** op de integration-rij (Koodh Media Group → Clara Custom → tab "Feature Integrations").

---

## 📋 De prompt (kopieer alles vanaf hier)

---

# Clara Integration — News / Blog

You are building a **News / Blog** integration for the Koodh Clara platform.
Clara will be the master editor for this feature; this project just exposes a
small REST contract so Clara can push content into it.

> **Important**: this is a RESTORE. The integration already exists in Clara
> with the token below. Do NOT generate a new token. Just (re)build the
> endpoints and the auto-registration call.

## 🔐 Authentication

Add to `backend/.env`:

```
CLARA_FEATURE_SECRET=<choose-a-long-random-string-and-tell-the-Clara-admin-so-they-can-store-it-on-their-side>
CLARA_INTEGRATION_TOKEN=b9059dc8498f13170a3d0c69dc3739c49356d1319892d961
CLARA_INTEGRATION_CALLBACK=https://api-turbo.preview.emergentagent.com/api/clara-custom/integrations/register
SITE_PUBLIC_URL=https://media-group-web.preview.emergentagent.com
```

All endpoints below (except `/health`) require:

```
Authorization: Bearer ${CLARA_FEATURE_SECRET}
```

Create a FastAPI dependency `verify_clara_secret` that compares the
`Authorization: Bearer ...` header to `CLARA_FEATURE_SECRET` and raises 401 on
mismatch.

## 📡 Endpoints to implement (under `/api/clara-feature/...`)

| Method | Path | Auth |
|---|---|---|
| `GET`    | `/api/clara-feature/health` | public |
| `GET`    | `/api/clara-feature/news` | Bearer token |
| `POST`   | `/api/clara-feature/news/by-clara-id/{clara_content_id}` | Bearer token |
| `DELETE` | `/api/clara-feature/news/by-clara-id/{clara_content_id}` | Bearer token |

### `GET /api/clara-feature/health`

Returns `{"status": "ok", "service": "media-group-web", "mongo": "connected"}` within 500ms. No auth.

### `GET /api/clara-feature/news`

Returns the list of news/blog articles currently stored on this site. Used by
Clara's "Import" feature so admins can pull existing content into Clara's
content library. Format:

```json
[
  {
    "id": "uuid-from-this-site",
    "clara_content_id": "uuid-from-clara-if-imported-via-clara",
    "title": "...",
    "slug": "...",
    "excerpt": "...",
    "body_html": "...",
    "featured_image_url": "...",
    "author_name": "...",
    "category": "...",
    "tags": ["..."],
    "status": "published",
    "published_at": "2026-05-29T10:00:00Z",
    "created_at": "...",
    "updated_at": "..."
  }
]
```

### `POST /api/clara-feature/news/by-clara-id/{clara_content_id}`

**Upsert** an article keyed on `clara_content_id`:
- If a document with this `clara_content_id` exists → replace it.
- Otherwise → insert it. Auto-generate `id` and `slug` if missing.

Request body matches the schema above.

### `DELETE /api/clara-feature/news/by-clara-id/{clara_content_id}`

Hard delete the article matched on `clara_content_id`. Return 204 even if not found (idempotent).

## 📂 Schema (Pydantic models in `backend/models/`)

```python
class NewsArticle(BaseModel):
    title: str
    slug: str | None = None
    excerpt: str | None = None
    body_html: str | None = None
    featured_image_url: str | None = None
    author_name: str | None = None
    category: str | None = None
    tags: list[str] = []
    status: Literal["draft", "published", "archived"] = "published"
    published_at: str | None = None
    clara_content_id: str | None = None  # UUID from Clara, used for upsert
```

Store in MongoDB collection `news_articles`. **Never** return `_id` (use `{"_id": 0}` projection).

## 🌐 Public site rendering

Also expose (no auth) for the public website:
- `GET /api/public/news` — only `status=published`, sorted by `published_at DESC`.
- `GET /api/public/news/{slug}` — 404 if not published.

The React frontend at `/nieuws` should fetch from these public endpoints.

## 🚀 Auto-registration (mandatory)

At FastAPI startup, this project must POST to Clara so it knows the project is
back online. Put this in `backend/server.py`:

```python
import os, httpx
from fastapi import FastAPI

app = FastAPI()

@app.on_event("startup")
async def register_clara_integration():
    token    = os.getenv("CLARA_INTEGRATION_TOKEN")
    callback = os.getenv("CLARA_INTEGRATION_CALLBACK")
    base_url = os.getenv("SITE_PUBLIC_URL")
    secret   = os.getenv("CLARA_FEATURE_SECRET")
    if not all([token, callback, base_url, secret]):
        print("[clara-integration] skipped: env vars missing")
        return
    payload = {
        "integration_token": token,
        "base_url": base_url,
        "shared_secret": secret,
        "endpoints_map": {
            "health":              "/api/clara-feature/health",
            "list":                "/api/clara-feature/news",
            "upsert_by_clara_id":  "/api/clara-feature/news/by-clara-id/{clara_content_id}",
            "delete_by_clara_id":  "/api/clara-feature/news/by-clara-id/{clara_content_id}",
        },
        "schema_version": 1,
    }
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.post(callback, json=payload)
            print(f"[clara-integration] {r.status_code}: {r.text[:200]}")
    except Exception as e:
        print(f"[clara-integration] skipped: {type(e).__name__}")
```

> Because the `integration_token` already exists in Clara as **connected**,
> re-registering will keep that status — no admin approval needed.

## ✅ Acceptance criteria

- [ ] `curl https://media-group-web.preview.emergentagent.com/api/clara-feature/health` returns 200 with `{"status":"ok"}`.
- [ ] `curl -H "Authorization: Bearer <SECRET>" .../api/clara-feature/news` returns a JSON list (possibly empty).
- [ ] `POST /api/clara-feature/news/by-clara-id/test-123` with a body inserts an article.
- [ ] On backend startup logs you see `[clara-integration] 200: ...`.
- [ ] In Clara → Koodh Media Group → Clara Custom → Feature Integrations, the row stays **connected** (green) and a fresh health check passes.

Build all of this end-to-end. The Clara admin will then click **Import** in
Clara to pull any pre-existing articles back into the Clara content library.

---

## 🆘 Hoe verifieer ik dat het gefixt is (vanuit Clara)

1. Ga naar **Koodh Media Group → Clara Custom → tab "Feature Integrations"**.
2. Klik **"Check"** op de News/Blog rij — moet groen worden (200 OK).
3. Klik **"Diagnose"** — moet zeggen "OK — N item(s) returned" (of "EMPTY RESPONSE" als de DB nog leeg is, dat is óók prima).
4. Open een artikel in Clara Content Library → bewerk → save → wacht ±1s → herlaad het externe artikel op `https://media-group-web.preview.emergentagent.com/nieuws/...` — wijziging moet zichtbaar zijn.
