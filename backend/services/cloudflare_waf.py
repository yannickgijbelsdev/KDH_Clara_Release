"""Cloudflare WAF integration for WordPress Security.

Manages WAF custom rules, IP access rules, and rate limiting
for WordPress sites via the Cloudflare API.
"""
import httpx
import logging

logger = logging.getLogger(__name__)

CF_API = "https://api.cloudflare.com/client/v4"


def _headers(api_token: str) -> dict:
    return {"Authorization": f"Bearer {api_token}", "Content-Type": "application/json"}


async def test_credentials(api_token: str, zone_id: str) -> dict:
    """Test Cloudflare API credentials by fetching zone details AND checking WAF access."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # Step 1: Test basic zone access
            resp = await client.get(f"{CF_API}/zones/{zone_id}", headers=_headers(api_token))
            data = resp.json()
            if not data.get("success"):
                errors = data.get("errors", [])
                error_msg = errors[0].get("message", "Unknown error") if errors else "Authentication failed"
                return {
                    "status": "error",
                    "message": error_msg,
                    "steps": [
                        "Your Cloudflare API Token or Zone ID is invalid",
                        "Go to dash.cloudflare.com > Profile > API Tokens",
                        "Create a token with 'Zone.Firewall Services.Edit' and 'Zone.Zone.Read' permissions",
                        "Make sure the token has access to the correct zone",
                    ],
                }

            zone = data["result"]

            # Step 2: Test WAF/Firewall access (the actual permission needed for sync)
            waf_resp = await client.get(
                f"{CF_API}/zones/{zone_id}/rulesets/phases/http_request_firewall_custom/entrypoint",
                headers=_headers(api_token),
            )
            waf_data = waf_resp.json()
            waf_ok = waf_data.get("success", False)
            # A 404 with success=false is OK — it means no rules exist yet but we have access
            if not waf_ok and waf_resp.status_code == 404:
                waf_ok = True

            if not waf_ok and waf_resp.status_code in (401, 403):
                return {
                    "status": "error",
                    "message": f"Zone access OK ({zone.get('name')}), but WAF permission denied",
                    "steps": [
                        "Your API Token can read the zone, but cannot manage WAF rules",
                        "Go to dash.cloudflare.com > Profile > API Tokens",
                        "Edit your token (or create a new one) with these permissions:",
                        "  - Zone > Firewall Services > Edit",
                        "  - Zone > Zone > Read",
                        "Make sure the token scope includes the zone: " + zone.get("name", zone_id),
                    ],
                }

            return {
                "status": "ok",
                "message": f"Connected to Cloudflare zone: {zone.get('name', zone_id)} (WAF access verified)",
                "zone_name": zone.get("name"),
                "zone_status": zone.get("status"),
                "plan": zone.get("plan", {}).get("name", "Unknown"),
                "waf_access": waf_ok,
            }
    except httpx.ConnectError:
        return {"status": "error", "message": "Cannot connect to Cloudflare API", "steps": ["Check your internet connection"]}
    except Exception as e:
        return {"status": "error", "message": str(e), "steps": ["An unexpected error occurred"]}


async def _get_custom_ruleset_id(client: httpx.AsyncClient, api_token: str, zone_id: str) -> str | None:
    """Get the ID of the http_request_firewall_custom phase entry point ruleset."""
    resp = await client.get(
        f"{CF_API}/zones/{zone_id}/rulesets/phases/http_request_firewall_custom/entrypoint",
        headers=_headers(api_token),
    )
    data = resp.json()
    if data.get("success"):
        return data["result"]["id"]
    return None


def _build_cf_expression(rule: dict) -> str:
    """Convert a Clara WAF rule to a Cloudflare filter expression."""
    target = rule.get("target", "")
    if target.startswith("/"):
        return f'(http.request.uri.path eq "{target}")'
    return f'(http.request.uri.path contains "{target}")'


async def sync_waf_rules(api_token: str, zone_id: str, rules: list, clara_prefix: str = "clara-wp-") -> dict:
    """Sync WAF rules to Cloudflare. Creates/updates/deletes as needed.

    Uses the custom rulesets API (http_request_firewall_custom phase).
    All Clara-managed rules are prefixed with `clara-wp-` for identification.
    """
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Get existing ruleset
            ruleset_id = await _get_custom_ruleset_id(client, api_token, zone_id)

            # Build the rules we want in Cloudflare
            cf_rules = []
            for rule in rules:
                if not rule.get("enabled"):
                    continue
                action = "block" if rule.get("action") == "block" else "managed_challenge"
                cf_rules.append({
                    "action": action,
                    "expression": _build_cf_expression(rule),
                    "description": f"{clara_prefix}{rule['id']}: {rule.get('name', '')}",
                    "enabled": True,
                })

            if not ruleset_id:
                # Create new ruleset with our rules
                if not cf_rules:
                    return {"status": "ok", "synced": 0, "message": "No active rules to sync"}
                resp = await client.post(
                    f"{CF_API}/zones/{zone_id}/rulesets",
                    headers=_headers(api_token),
                    json={
                        "name": "Clara WP Security Rules",
                        "kind": "zone",
                        "phase": "http_request_firewall_custom",
                        "rules": cf_rules,
                    },
                )
                data = resp.json()
                if data.get("success"):
                    return {"status": "ok", "synced": len(cf_rules), "message": f"{len(cf_rules)} rules synced to Cloudflare"}
                error_msg = data.get("errors", [{}])[0].get("message", "Failed to create ruleset")
                if resp.status_code in (401, 403) or "auth" in error_msg.lower():
                    return {
                        "status": "error",
                        "message": "Cloudflare WAF permission denied",
                        "steps": [
                            "Your API Token cannot manage WAF rules",
                            "Go to dash.cloudflare.com > Profile > API Tokens",
                            "Edit your token with: Zone > Firewall Services > Edit",
                        ],
                    }
                return {"status": "error", "message": error_msg}

            # Ruleset exists — get current rules
            resp = await client.get(
                f"{CF_API}/zones/{zone_id}/rulesets/{ruleset_id}",
                headers=_headers(api_token),
            )
            data = resp.json()
            existing_rules = data.get("result", {}).get("rules", []) if data.get("success") else []

            # Separate Clara rules from non-Clara rules
            non_clara_rules = [r for r in existing_rules if not r.get("description", "").startswith(clara_prefix)]

            # Merge: keep non-Clara rules, replace Clara rules
            merged_rules = non_clara_rules + cf_rules

            # Update the entire ruleset
            resp = await client.put(
                f"{CF_API}/zones/{zone_id}/rulesets/{ruleset_id}",
                headers=_headers(api_token),
                json={"rules": merged_rules},
            )
            data = resp.json()
            if data.get("success"):
                return {"status": "ok", "synced": len(cf_rules), "message": f"{len(cf_rules)} rules synced to Cloudflare"}
            error_msg = data.get("errors", [{}])[0].get("message", "Failed to update rules")
            if resp.status_code in (401, 403) or "auth" in error_msg.lower():
                return {
                    "status": "error",
                    "message": "Cloudflare WAF permission denied",
                    "steps": [
                        "Your API Token cannot manage WAF rules",
                        "Go to dash.cloudflare.com > Profile > API Tokens",
                        "Edit your token with: Zone > Firewall Services > Edit",
                    ],
                }
            return {"status": "error", "message": error_msg}

    except Exception as e:
        logger.error(f"Cloudflare WAF sync error: {e}")
        return {"status": "error", "message": str(e)}


async def sync_ip_block(api_token: str, zone_id: str, ip: str, note: str = "") -> dict:
    """Block an IP address via Cloudflare IP Access Rules."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{CF_API}/zones/{zone_id}/firewall/access_rules/rules",
                headers=_headers(api_token),
                json={
                    "mode": "block",
                    "configuration": {"target": "ip", "value": ip},
                    "notes": f"Clara WP Security: {note}" if note else "Clara WP Security: Blocked",
                },
            )
            data = resp.json()
            if data.get("success"):
                return {"status": "ok", "cf_rule_id": data["result"]["id"]}
            error = data.get("errors", [{}])[0].get("message", "Failed to block IP")
            # Duplicate = already blocked, that's fine
            if "already exists" in error.lower() or "duplicate" in error.lower():
                return {"status": "ok", "message": "IP was already blocked in Cloudflare"}
            return {"status": "error", "message": error}
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def remove_ip_block(api_token: str, zone_id: str, ip: str) -> dict:
    """Remove an IP block from Cloudflare IP Access Rules."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # Find the rule ID for this IP
            resp = await client.get(
                f"{CF_API}/zones/{zone_id}/firewall/access_rules/rules",
                headers=_headers(api_token),
                params={"configuration.value": ip, "mode": "block"},
            )
            data = resp.json()
            if not data.get("success"):
                return {"status": "error", "message": "Failed to find IP rule"}

            rules = data.get("result", [])
            if not rules:
                return {"status": "ok", "message": "IP was not blocked in Cloudflare"}

            # Delete the rule
            rule_id = rules[0]["id"]
            resp = await client.delete(
                f"{CF_API}/zones/{zone_id}/firewall/access_rules/rules/{rule_id}",
                headers=_headers(api_token),
            )
            data = resp.json()
            if data.get("success"):
                return {"status": "ok"}
            return {"status": "error", "message": "Failed to remove IP block from Cloudflare"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


async def get_blocked_ips(api_token: str, zone_id: str) -> list:
    """Get list of blocked IPs from Cloudflare (Clara-created only)."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{CF_API}/zones/{zone_id}/firewall/access_rules/rules",
                headers=_headers(api_token),
                params={"mode": "block", "per_page": 100},
            )
            data = resp.json()
            if data.get("success"):
                return [
                    {
                        "ip": r["configuration"]["value"],
                        "note": r.get("notes", "").replace("Clara WP Security: ", ""),
                        "cf_rule_id": r["id"],
                        "created_on": r.get("created_on", ""),
                    }
                    for r in data.get("result", [])
                    if "clara" in r.get("notes", "").lower()
                ]
            return []
    except Exception:
        return []
