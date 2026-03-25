"""Wordfence integration for WordPress Security.

Uses the Wordfence Intelligence Vulnerability API (free)
and checks WordPress site for Wordfence plugin presence.
"""
import httpx
import logging

logger = logging.getLogger(__name__)

WF_VULN_API = "https://www.wordfence.com/api/intelligence/v2"


async def check_wordfence_installed(wp_url: str) -> dict:
    """Check if Wordfence is installed on the WordPress site."""
    wp_url = wp_url.rstrip("/")
    indicators = []

    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            # Check for Wordfence WAF headers
            resp = await client.get(wp_url)
            headers_str = str(resp.headers).lower()
            body = resp.text[:15000].lower()

            if "wordfence" in headers_str:
                indicators.append("Wordfence headers detected")
            if "wordfence" in body:
                indicators.append("Wordfence reference in HTML")
            if "wf-scan-issue" in body or "wfls-" in body:
                indicators.append("Wordfence scan markers found")

            # Check for Wordfence firewall file
            try:
                waf_resp = await client.get(f"{wp_url}/.user.ini", timeout=5)
                if waf_resp.status_code == 200 and "wordfence" in waf_resp.text.lower():
                    indicators.append("Wordfence WAF config (.user.ini) found")
            except Exception:
                pass

            # Check for Wordfence plugin directory
            try:
                wf_css = await client.get(f"{wp_url}/wp-content/plugins/wordfence/css/", timeout=5)
                if wf_css.status_code in (200, 403):
                    indicators.append("Wordfence plugin directory exists")
            except Exception:
                pass

            if indicators:
                return {
                    "installed": True,
                    "indicators": indicators,
                    "message": f"Wordfence detected ({len(indicators)} indicators)",
                }

            return {
                "installed": False,
                "indicators": [],
                "message": "Wordfence not detected on this site",
                "install_steps": [
                    "Log in to your WordPress admin at /wp-admin",
                    "Go to Plugins → Add New",
                    "Search for 'Wordfence Security'",
                    "Click Install Now, then Activate",
                    "Follow the setup wizard to configure basic security",
                ],
            }

    except Exception as e:
        return {"installed": False, "indicators": [], "message": f"Could not check: {str(e)}"}


async def scan_vulnerabilities(wp_url: str) -> dict:
    """Check WordPress site for known vulnerabilities using Wordfence Intelligence API.

    This scans the site's HTML for plugin/theme version info and cross-references
    with the Wordfence vulnerability database.
    """
    wp_url = wp_url.rstrip("/")
    found_software = []
    vulnerabilities = []

    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            # Fetch the main page to detect plugins/themes
            resp = await client.get(wp_url)
            body = resp.text

            # Try to detect WordPress core version
            wp_version = None
            import re
            gen_match = re.search(r'<meta name="generator" content="WordPress (\d+\.\d+\.?\d*)"', body, re.IGNORECASE)
            if gen_match:
                wp_version = gen_match.group(1)
                found_software.append({"type": "core", "slug": "wordpress", "version": wp_version})

            # Detect plugins from wp-content/plugins paths
            plugin_matches = re.findall(r'/wp-content/plugins/([a-z0-9\-_]+)/[^"\']*?ver=([0-9][0-9a-z.\-]*)', body, re.IGNORECASE)
            seen_plugins = set()
            for slug, version in plugin_matches:
                if slug not in seen_plugins:
                    seen_plugins.add(slug)
                    found_software.append({"type": "plugin", "slug": slug, "version": version})

            # Detect themes from wp-content/themes paths
            theme_matches = re.findall(r'/wp-content/themes/([a-z0-9\-_]+)/[^"\']*?ver=([0-9][0-9a-z.\-]*)', body, re.IGNORECASE)
            seen_themes = set()
            for slug, version in theme_matches:
                if slug not in seen_themes:
                    seen_themes.add(slug)
                    found_software.append({"type": "theme", "slug": slug, "version": version})

            # Check each detected software against Wordfence vulnerability DB
            for sw in found_software[:10]:  # Limit to 10 to avoid rate limits
                try:
                    vuln_resp = await client.get(
                        f"{WF_VULN_API}/vulnerabilities/production",
                        params={"software_type": sw["type"], "software_slug": sw["slug"]},
                        timeout=5,
                    )
                    if vuln_resp.status_code == 200:
                        vuln_data = vuln_resp.json()
                        for vuln_id, vuln in vuln_data.items():
                            # Check if this vulnerability affects the detected version
                            affected = vuln.get("software", [])
                            for af in affected:
                                if af.get("slug") == sw["slug"]:
                                    affected_versions = af.get("affected_versions", {})
                                    for _, av in affected_versions.items():
                                        from_ver = av.get("from_version", "0")
                                        to_ver = av.get("to_version", "99999")
                                        if _version_in_range(sw["version"], from_ver, to_ver):
                                            vulnerabilities.append({
                                                "id": vuln_id,
                                                "title": vuln.get("title", "Unknown vulnerability"),
                                                "severity": vuln.get("cvss", {}).get("rating", "unknown"),
                                                "cvss_score": vuln.get("cvss", {}).get("score"),
                                                "software": f"{sw['type']}/{sw['slug']}",
                                                "version": sw["version"],
                                                "patched_in": av.get("to_version"),
                                            })
                except Exception:
                    pass  # Skip individual plugin check failures

            return {
                "status": "ok",
                "wordpress_version": wp_version,
                "detected_software": found_software,
                "vulnerabilities": vulnerabilities,
                "vulnerability_count": len(vulnerabilities),
                "scanned_count": len(found_software),
            }

    except Exception as e:
        return {"status": "error", "message": str(e), "detected_software": [], "vulnerabilities": []}


def _version_in_range(version: str, from_ver: str, to_ver: str) -> bool:
    """Simple version comparison. Returns True if version is in [from_ver, to_ver]."""
    try:
        v_parts = [int(x) for x in version.split(".")[:3]]
        f_parts = [int(x) for x in from_ver.split(".")[:3]] if from_ver and from_ver != "*" else [0]
        t_parts = [int(x) for x in to_ver.split(".")[:3]] if to_ver and to_ver != "*" else [99999]

        # Pad to equal length
        while len(v_parts) < 3:
            v_parts.append(0)
        while len(f_parts) < 3:
            f_parts.append(0)
        while len(t_parts) < 3:
            t_parts.append(0)

        return f_parts <= v_parts <= t_parts
    except (ValueError, AttributeError):
        return False
