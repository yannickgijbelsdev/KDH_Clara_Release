/* eslint-disable */
import { useState, useEffect, createContext, useContext } from 'react';

const LoadingContext = createContext({ isLoading: false, startLoading: () => {}, stopLoading: () => {} });

export function useTopLoader() {
  return useContext(LoadingContext);
}

export function TopLoaderProvider({ children }) {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isLoading) { setProgress(0); return; }
    setProgress(15);
    const t1 = setTimeout(() => setProgress(40), 200);
    const t2 = setTimeout(() => setProgress(65), 600);
    const t3 = setTimeout(() => setProgress(80), 1200);
    const t4 = setTimeout(() => setProgress(90), 2500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, [isLoading]);

  const startLoading = () => setIsLoading(true);
  const stopLoading = () => {
    setProgress(100);
    setTimeout(() => { setIsLoading(false); setProgress(0); }, 300);
  };

  return (
    <LoadingContext.Provider value={{ isLoading, startLoading, stopLoading }}>
      {isLoading && (
        <div className="fixed top-0 left-0 right-0 z-[9999] h-[3px]" data-testid="top-loader">
          <div
            className="h-full bg-orange-500 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
      {children}
    </LoadingContext.Provider>
  );
}
