/* eslint-disable */
import { createContext, useContext, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';

const JourneyContext = createContext(null);

export const useJourney = () => useContext(JourneyContext) || { journey: [] };

const MAX_STEPS = 50;

// Map path segments to human-readable page names
const PAGE_NAMES = {
  shows: 'Shows',
  calendar: 'Calendar',
  content: 'Content Library',
  media: 'Media Library',
  chat: 'Chat',
  settings: 'Settings',
  wordpress: 'WordPress Settings',
  team: 'Team Settings',
  approvals: 'Content Approval',
  rundown: 'Rundown',
  sites: 'Sites',
  trash: 'Trash',
  statistics: 'Statistics',
  backups: 'Backups',
  explorer: 'API Explorer',
  login: 'Login',
};

function getPageName(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  // Check last meaningful segment
  for (let i = parts.length - 1; i >= 0; i--) {
    const name = PAGE_NAMES[parts[i]];
    if (name) return name;
  }
  if (parts.length <= 1) return 'Dashboard';
  return parts[parts.length - 1] || 'Dashboard';
}

export const JourneyProvider = ({ children }) => {
  const location = useLocation();
  const journeyRef = useRef([]);

  useEffect(() => {
    const step = {
      url: location.pathname,
      name: getPageName(location.pathname),
      timestamp: new Date().toISOString(),
    };

    // Don't add duplicate consecutive pages
    const last = journeyRef.current[journeyRef.current.length - 1];
    if (last?.url === step.url) return;

    journeyRef.current = [...journeyRef.current, step].slice(-MAX_STEPS);
  }, [location.pathname]);

  const getJourney = useCallback(() => [...journeyRef.current], []);

  return (
    <JourneyContext.Provider value={{ journey: journeyRef.current, getJourney }}>
      {children}
    </JourneyContext.Provider>
  );
};
