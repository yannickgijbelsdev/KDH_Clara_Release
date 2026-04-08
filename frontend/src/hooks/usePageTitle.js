import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Maps path segments to human-readable page titles.
 */
const PAGE_TITLES = {
  'dashboard': 'Dashboard',
  'shows': 'Shows',
  'show-management': 'Show Management',
  'calendar': 'Calendar',
  'content': 'Content Library',
  'approvals': 'Approvals',
  'trash': 'Trash',
  'settings': 'Settings',
  'chat': 'Chat',
  'media': 'Media Library',
  'team': 'Team',
  'logs': 'Logs',
  'wordpress': 'WordPress',
  'rds': 'RDS Settings',
  'rds-builder': 'RDS Builder',
  'rds-scheduler': 'RDS Scheduler',
  'rds-monitor': 'RDS Monitor',
  'audio-triggers': 'Audio Triggers',
  'streams': 'Streams',
  'sites': 'Sites',
  'firewall': 'Firewall',
  'network': 'Network',
  'backups': 'Backups',
  'explorer': 'API Explorer',
  'login': 'Login',
  'call-studio': 'Call Studio',
  'tasks': 'Tasks',
  'tickets': 'Tickets',
  'zerotier': 'ZeroTier',
  'clara-global': 'Clara Global',
  'statistics': 'Statistics',
  'radioplayer': 'Radioplayer',
  'vmix': 'vMix Director',
  'xml-imports': 'XML Imports',
  'xml-upload': 'XML Upload',
  'api-keys': 'API Keys',
  'security': 'Security',
};

/**
 * Hook that dynamically updates the browser tab title based on the current route.
 * Format: "Clara | Page Name - Site Name" or "Clara | Page Name" or "Clara | Site Name"
 *
 * @param {string} [siteName] - The current main site or team name
 * @param {string} [brandName] - The platform brand name (default: "Clara")
 */
export default function usePageTitle(siteName, brandName = 'Clara') {
  const { pathname } = useLocation();

  useEffect(() => {
    const segments = pathname.split('/').filter(Boolean);

    // Find the best matching page title by walking segments from end to start
    let pageTitle = null;
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      // Skip UUIDs and dynamic IDs
      if (/^[0-9a-f]{8}-/.test(seg) || /^\d{10,}$/.test(seg)) continue;
      // Skip the main site slug (first segment) when it's not a known page
      if (i === 0 && !PAGE_TITLES[seg]) continue;

      if (PAGE_TITLES[seg]) {
        pageTitle = PAGE_TITLES[seg];
        break;
      }
    }

    // Special case: content calendar
    if (segments.includes('content') && segments.includes('calendar')) {
      pageTitle = 'Content Calendar';
    }

    // Build title - avoid duplicating siteName in pageTitle
    const parts = [brandName];
    // If no page matched but we have a siteName, assume it's the dashboard
    if (!pageTitle && siteName && segments.length <= 1) {
      pageTitle = 'Dashboard';
    }
    if (pageTitle && siteName && pageTitle !== siteName) {
      parts.push(`${pageTitle} - ${siteName}`);
    } else if (pageTitle) {
      parts.push(pageTitle);
    } else if (siteName) {
      parts.push(siteName);
    }

    document.title = parts.join(' | ');
  }, [pathname, siteName, brandName]);
}
