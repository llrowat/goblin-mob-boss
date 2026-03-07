import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";

interface TerminalSession {
  featureId: string;
  sessionId: string;
}

interface TerminalSessionContextValue {
  session: TerminalSession | null;
  startSession: (featureId: string, sessionId: string) => void;
  clearSession: () => void;
}

const TerminalSessionContext = createContext<TerminalSessionContextValue>({
  session: null,
  startSession: () => {},
  clearSession: () => {},
});

export function TerminalSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<TerminalSession | null>(null);

  const startSession = useCallback((featureId: string, sessionId: string) => {
    setSession({ featureId, sessionId });
  }, []);

  const clearSession = useCallback(() => {
    setSession(null);
  }, []);

  return (
    <TerminalSessionContext.Provider value={{ session, startSession, clearSession }}>
      {children}
    </TerminalSessionContext.Provider>
  );
}

export function useTerminalSession() {
  return useContext(TerminalSessionContext);
}
