# Multisite Migration Guide voor Clara.koodh.com

Dit document beschrijft hoe je de bestaande data van clara.koodh.com migreert naar de nieuwe multisite architectuur.

## Wat doet de migratie?

1. **Maakt een Main Site aan** - Een "container" voor al je bestaande data
2. **Koppelt alle gebruikers** - Alle teamleden krijgen toegang tot de Main Site met hun huidige rol
3. **Migreert alle data** - Alle shows, content, RDS instellingen, etc. krijgen een `main_site_id`

## Stap 1: Backup maken (BELANGRIJK!)

Maak eerst een backup van je productie database voordat je begint:

```bash
# Via MongoDB Atlas of je hosting provider
# Of via command line:
mongodump --uri="mongodb+srv://..." --out=/backup/clara-backup-$(date +%Y%m%d)
```

## Stap 2: Check huidige status

Draai het check script om te zien wat er gemigreerd moet worden:

```bash
cd /app/backend
export MONGO_URL="jouw-productie-mongo-url"
export DB_NAME="jouw-database-naam"

python scripts/check_migration_status.py
```

Dit toont:
- Hoeveel teams en users je hebt
- Hoeveel documenten per collectie
- Hoeveel documenten nog een `main_site_id` nodig hebben

## Stap 3: Dry run (test zonder wijzigingen)

```bash
python scripts/full_migration_to_multisite.py --dry-run \
    --main-site-name "Radiogroep" \
    --main-site-slug "radiogroep"
```

Dit simuleert de migratie en toont wat er zou gebeuren.

## Stap 4: Voer de migratie uit

Als de dry run er goed uitziet:

```bash
python scripts/full_migration_to_multisite.py \
    --main-site-name "Radiogroep" \
    --main-site-slug "radiogroep"
```

**Parameters:**
- `--main-site-name`: De naam die je wilt geven aan je Main Site (bijv. "Radiogroep MFY/GRK")
- `--main-site-slug`: De URL slug (bijv. "radiogroep" → wordt https://clara.koodh.com/radiogroep)

## Stap 5: Verifieer de migratie

Draai het check script opnieuw:

```bash
python scripts/check_migration_status.py
```

Alle collecties moeten nu "Needs Migration: 0" tonen.

## Na de migratie

1. **Log in als Network Admin** - Gebruikers met `is_network_admin=true` kunnen alle Main Sites beheren
2. **Check je data** - Ga naar `/{main-site-slug}` en verifieer dat alle shows, content, etc. zichtbaar zijn
3. **Maak eventueel meer Main Sites** - Via Network Admin kun je nieuwe organisaties aanmaken

## Collecties die gemigreerd worden

| Categorie | Collecties |
|-----------|------------|
| Shows | shows, show_titles, show_series, show_occurrences, rundowns, rundown_items |
| Content | content_items, content_audit_logs, categories |
| Media | media_assets, media_folders, folder_shares |
| WordPress | wordpress_sites |
| Chat | chat_threads, chat_messages |
| RDS | rds_outputs, rds_sequences, rds_scheduled_texts, etc. |
| Audio | audio_triggers, audio_trigger_states |
| Sites | sites, site_users, site_submissions |

## Problemen oplossen

### "No teams found"
De database is leeg of de verbinding is onjuist. Check je `MONGO_URL`.

### "Documents with unknown team_ids were not migrated"
Sommige documenten hebben geen `team_id`. Deze moeten handmatig worden bijgewerkt:

```javascript
// MongoDB shell
db.collection_name.updateMany(
    { main_site_id: { $exists: false } },
    { $set: { main_site_id: "jouw-main-site-id" } }
)
```

### Gebruikers kunnen niet inloggen
Check of de user is gekoppeld aan de Main Site:

```javascript
db.main_site_users.find({ user_id: "user-id-hier" })
```

## Support

Als je problemen tegenkomt, neem contact op of check de logs in de Emergent console.
