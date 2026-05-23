# Prompt voor het externe Emergent-project (Clara Custom-compatibele website)

> **Hoe te gebruiken**: Open je andere Emergent-project (de publieke website, bv. `koodhmediagroup.com`) en plak de prompt hieronder als allereerste boodschap. Vervang `[YOUR_SHARED_SECRET]` door een lange random string die je in Clara Custom als `Authorization` header instelt.

---

## 📋 De prompt (kopieer alles tussen de lijnen)

---

Ik wil dat deze website (frontend + FastAPI backend + MongoDB) volledig op afstand te beheren is via een externe admin-tool genaamd **Clara Custom**. Clara Custom is een ander Emergent-project dat via een API push/pull doet op deze site. Bouw daarom een complete **headless CMS-laag** met de volgende endpoints, datamodellen en gedrag.

### 🔐 Authenticatie

Alle `/api/clara/*` endpoints (behalve `/api/clara/health`) zijn beschermd via een **shared secret** in de header:

```
Authorization: Bearer [YOUR_SHARED_SECRET]
```

Lees het geheim uit `backend/.env` met sleutel `CLARA_API_SECRET`. Sla het **nooit** hard-coded op. Voeg `CLARA_API_SECRET=changeme-long-random-string` toe aan `.env`.

Maak een FastAPI dependency `verify_clara_secret` die de header valideert en 401 teruggeeft bij mismatch. Geen JWT, geen sessies — alleen de gedeelde header.

### 🩺 Health endpoint (publiek, geen auth)

```
GET /api/clara/health
```

Returnt:
```json
{
  "status": "ok",
  "service": "koodh-media-site",
  "version": "1.0.0",
  "timestamp": "2026-05-14T10:00:00Z",
  "mongo": "connected",
  "uptime_seconds": 12345
}
```

Dit is het endpoint dat Clara Custom pingt voor connectivity-monitoring. Het moet binnen <500ms reageren.

### 🎨 Site configuratie (teksten, kleuren, branding)

Sla één document op in collectie `site_config` met `id: "main"`. Velden:

```json
{
  "id": "main",
  "branding": {
    "site_name": "Koodh Media Group",
    "logo_url": "https://...",
    "favicon_url": "https://...",
    "primary_color": "#dd0c51",
    "secondary_color": "#7c1ac8",
    "accent_color": "#f59e0b",
    "background_color": "#ffffff",
    "text_color": "#0f172a",
    "font_family": "Inter"
  },
  "contact": {
    "email": "info@example.com",
    "phone": "+32 ...",
    "address": "...",
    "vat_number": "BE..."
  },
  "social": {
    "facebook": "https://...",
    "instagram": "https://...",
    "linkedin": "https://...",
    "twitter": "https://...",
    "youtube": "https://..."
  },
  "seo": {
    "meta_title": "...",
    "meta_description": "...",
    "og_image_url": "..."
  },
  "texts": {
    "hero_headline": "Welkom bij ...",
    "hero_subheadline": "...",
    "hero_cta_label": "Ontdek meer",
    "hero_cta_url": "/about",
    "about_title": "...",
    "about_body": "...",
    "footer_tagline": "..."
  },
  "feature_flags": {
    "show_news_section": true,
    "show_newsletter_popup": false
  },
  "updated_at": "...",
  "updated_by": "clara-custom"
}
```

**Endpoints:**

| Methode | Pad | Beschrijving |
|---|---|---|
| `GET` | `/api/clara/config` | Volledig config-document |
| `PUT` | `/api/clara/config` | Volledige overschrijving (verwacht hele body) |
| `PATCH` | `/api/clara/config` | Partial update — alleen velden in body worden bijgewerkt (deep merge per sectie: `branding`, `contact`, `social`, `seo`, `texts`, `feature_flags`) |

**Belangrijk:** PUT/PATCH moet `updated_at` automatisch zetten op `datetime.now(timezone.utc).isoformat()`.

**Publiek endpoint** (voor de frontend van deze site, geen auth nodig):
```
GET /api/public/config
```
Returnt hetzelfde object maar gecached (60s in-memory). De React frontend van deze website moet bij elke pagina-load deze config ophalen en gebruiken voor kleuren (CSS variables in `<html>` style) en teksten.

### 📰 Nieuws / Blog content

Sla nieuwsartikelen op in collectie `news_articles`. Schema:

```json
{
  "id": "uuid",
  "slug": "mijn-eerste-artikel",
  "title": "Mijn eerste artikel",
  "excerpt": "Korte intro...",
  "body_html": "<p>Volledige HTML inhoud...</p>",
  "body_markdown": "Optioneel, als Clara markdown stuurt",
  "featured_image_url": "https://...",
  "author_name": "Yannick Gijbels",
  "author_avatar_url": "https://...",
  "category": "Nieuws",
  "tags": ["radio", "media"],
  "status": "published",
  "published_at": "2026-05-14T10:00:00Z",
  "created_at": "...",
  "updated_at": "...",
  "clara_content_id": "uuid-uit-clara-content-library",
  "seo": {
    "meta_title": "...",
    "meta_description": "...",
    "og_image_url": "..."
  }
}
```

`status` is een enum: `draft | published | archived`.

`clara_content_id` is de UUID van het originele artikel in Clara's content library — dit maakt **bidirectionele sync** mogelijk (Clara kan via dit ID later updaten/verwijderen).

**Endpoints (auth vereist via Bearer):**

| Methode | Pad | Beschrijving |
|---|---|---|
| `GET` | `/api/clara/news` | Lijst alle artikelen (query params: `status`, `limit`, `offset`, `clara_content_id`) |
| `POST` | `/api/clara/news` | Maak nieuw artikel — Clara pusht hier vanuit content library |
| `GET` | `/api/clara/news/{id}` | Eén artikel op `id` |
| `PUT` | `/api/clara/news/{id}` | Volledig overschrijven |
| `PATCH` | `/api/clara/news/{id}` | Partial update (bv. alleen status wijzigen) |
| `DELETE` | `/api/clara/news/{id}` | Hard delete |
| `POST` | `/api/clara/news/by-clara-id/{clara_content_id}` | Upsert op basis van Clara's content_id (handig voor sync) |

**Publieke endpoints** (geen auth, voor de website frontend):

| Methode | Pad | Beschrijving |
|---|---|---|
| `GET` | `/api/public/news` | Alleen `status=published`, gesorteerd op `published_at DESC`, default limit 20 |
| `GET` | `/api/public/news/{slug}` | Op slug — voor SEO-vriendelijke URLs |

### 🖼️ Media uploads (optioneel maar aanbevolen)

Voor afbeeldingen die Clara in artikelen of branding wil zetten:

| Methode | Pad | Beschrijving |
|---|---|---|
| `POST` | `/api/clara/media` | Upload via base64 of multipart; returnt `{url, size, mime_type}` |
| `DELETE` | `/api/clara/media/{id}` | Verwijderen |

Gebruik dezelfde Emergent S3 object storage als Clara (zelfde EMERGENT_LLM_KEY werkt voor S3 uploads), of sla lokaal op in `backend/static/uploads/`.

### 🔔 Webhook receiver (optioneel)

```
POST /api/clara/webhook
```

Body:
```json
{
  "event": "content.updated" | "content.deleted" | "config.changed",
  "resource_type": "news" | "config",
  "resource_id": "uuid",
  "payload": { ... }
}
```

Logt elk event in collectie `clara_webhook_log` (id, event, resource_id, payload, received_at). Reageert altijd binnen 200ms met `{"received": true}` — zware verwerking via FastAPI `BackgroundTasks`.

### 📐 Algemene regels

1. **Geen `_id` in responses** — sluit altijd uit met `{"_id": 0}` of pop het manueel.
2. **Alle datums** als ISO 8601 strings in UTC (`datetime.now(timezone.utc).isoformat()`).
3. **Slugs auto-genereren** uit de title als de POST body geen slug bevat (lowercase, streepjes, non-ascii strippen).
4. **Validatie via Pydantic** — maak `SiteConfig`, `NewsArticle`, `NewsArticleCreate`, `NewsArticlePatch` modellen in `backend/models/`.
5. **CORS** — sta de Clara Custom origin toe (lees `CLARA_ORIGIN` uit `.env`, default `*` voor dev).
6. **Logging** — log elke schrijfactie van Clara in `clara_audit_log` (timestamp, action, resource, before/after diff). Endpoint `GET /api/clara/audit-log` om dit op te halen.
7. **OpenAPI** — laat FastAPI auto-docs op `/api/docs` aan blijven; Clara Custom kan dan via "Import OpenAPI" alle endpoints automatisch oppikken.

### 🎬 Frontend integratie (deze website zelf)

In `frontend/src/App.js`:

1. Bij `useEffect` op mount: fetch `/api/public/config` één keer en sla op in een React Context (`SiteConfigContext`).
2. Injecteer kleuren als CSS variables in `<html>` style:
   ```js
   document.documentElement.style.setProperty('--brand-primary', config.branding.primary_color);
   document.documentElement.style.setProperty('--brand-secondary', config.branding.secondary_color);
   ```
3. Toon alle teksten via `config.texts.*` — geen hard-coded copy.
4. Nieuws-sectie haalt `/api/public/news` op en rendert kaarten met `featured_image_url`, `title`, `excerpt`, `published_at`.
5. Detail-pagina op route `/nieuws/:slug` fetcht `/api/public/news/:slug`.

### ✅ Acceptatiecriteria

- [ ] `GET /api/clara/health` werkt zonder auth en returnt status 200 met `mongo: connected`.
- [ ] `PATCH /api/clara/config` met body `{"branding": {"primary_color": "#ff0000"}}` past **alleen** die kleur aan, niet de hele branding sectie.
- [ ] `POST /api/clara/news` met titel maar zonder slug genereert automatisch een slug.
- [ ] `GET /api/public/news/{slug}` returnt 404 voor draft-artikelen, 200 voor published.
- [ ] Frontend toont de juiste kleur **direct** na een Clara update (refresh van pagina is voldoende; geen rebuild nodig).
- [ ] OpenAPI docs op `/api/docs` tonen alle `/api/clara/*` endpoints met correcte schemas.
- [ ] CORS staat aan voor de Clara Custom origin.

### 🧪 Test endpoints achteraf met curl

```bash
SECRET="[YOUR_SHARED_SECRET]"
BASE="https://[your-site].preview.emergentagent.com"

# Health
curl -s "$BASE/api/clara/health" | jq .

# Kleur aanpassen
curl -X PATCH "$BASE/api/clara/config" \
  -H "Authorization: Bearer $SECRET" \
  -H "Content-Type: application/json" \
  -d '{"branding": {"primary_color": "#ff6600"}}'

# Nieuw artikel posten
curl -X POST "$BASE/api/clara/news" \
  -H "Authorization: Bearer $SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Testartikel vanuit Clara",
    "excerpt": "Hello world",
    "body_html": "<p>Inhoud</p>",
    "status": "published"
  }'

# Publiek lezen
curl -s "$BASE/api/public/news" | jq .
```

Bouw nu deze volledige stack en bevestig dat alle acceptatiecriteria slagen. Begin met de health endpoint + Pydantic modellen, dan de config endpoints, dan news, dan de frontend-integratie.

---

## 🔗 Hoe je dit in Clara Custom hangt (in jouw huidige platform)

Zodra de externe website bovenstaande endpoints heeft:

1. Ga in Clara naar **Koodh Media Group** → **Clara Custom** dashboard.
2. Klik **"+ Add API"** en voeg toe (4 entries, of importeer de OpenAPI):

   | Naam | Base URL | Path | Method | Auth header |
   |---|---|---|---|---|
   | Health | `https://[site]` | `/api/clara/health` | GET | *(leeg)* |
   | Config | `https://[site]` | `/api/clara/config` | GET | `Bearer [YOUR_SHARED_SECRET]` |
   | News list | `https://[site]` | `/api/clara/news` | GET | `Bearer [YOUR_SHARED_SECRET]` |
   | Public news | `https://[site]` | `/api/public/news` | GET | *(leeg)* |

   Of nog simpeler: gebruik **"Import from OpenAPI"** en plak de URL `https://[site]/api/openapi.json` — Clara haalt dan alle endpoints automatisch op.

3. Klik **"Check all"** — alle 4 zouden groen ("connected") moeten worden.

4. Voor het **doorpushen van content vanuit Clara content library** naar de site: dit is een aparte sync-feature die we daarna kunnen bouwen. De pre-requisites (`POST /api/clara/news/by-clara-id/{clara_content_id}` upsert + `clara_content_id` veld op artikelen) liggen nu klaar in de externe site. We hoeven alleen aan de Clara-kant een knop "Publish to external site" toe te voegen die deze POST aanroept.

---

## 📌 Volgende stap in Clara (na de externe site klaar is)

- Optioneel uit te bouwen feature: **"Push to Clara Custom site"** knop in de Clara content library — selecteer een artikel → kies een Clara Custom main site → klik push → Clara doet de upsert call. Laat me weten of je dit wilt, dan bouw ik het in `frontend/src/pages/ContentDetailPage.js` als extra actieknop, en in de backend als `POST /api/content/{content_id}/push-to-clara-custom/{api_id}`.
