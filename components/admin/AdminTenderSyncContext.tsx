"use client";

import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  type ReactNode,
} from "react";

type AdminTenderSyncContextValue = {
  isSyncInProgress: boolean;
  stopSync: () => void;
  setSyncInProgress: (inProgress: boolean) => void;
  setStopSyncFn: (fn: (() => void) | null) => void;
};

const AdminTenderSyncContext = createContext<
  AdminTenderSyncContextValue | undefined
>(undefined);

export function AdminTenderSyncProvider({ children }: { children: ReactNode }) {
  const [isSyncInProgress, setSyncInProgress] = useState(false);
  const stopSyncRef = useRef<(() => void) | null>(null);

  const setStopSyncFn = useCallback((fn: (() => void) | null) => {
    stopSyncRef.current = fn;
  }, []);

  const stopSync = useCallback(() => {
    stopSyncRef.current?.();
    stopSyncRef.current = null;
  }, []);

  return (
    <AdminTenderSyncContext.Provider
      value={{
        isSyncInProgress,
        stopSync,
        setSyncInProgress,
        setStopSyncFn,
      }}
    >
      {children}
    </AdminTenderSyncContext.Provider>
  );
}

export function useAdminTenderSync(): AdminTenderSyncContextValue {
  const ctx = useContext(AdminTenderSyncContext);
  if (ctx === undefined) {
    throw new Error(
      "useAdminTenderSync must be used within AdminTenderSyncProvider",
    );
  }
  return ctx;
}

/** Use when optional (e.g. Import section). Returns isSyncInProgress: false when outside provider. */
export function useAdminTenderSyncOptional(): {
  isSyncInProgress: boolean;
  stopSync: () => void;
} {
  const ctx = useContext(AdminTenderSyncContext);
  return ctx
    ? { isSyncInProgress: ctx.isSyncInProgress, stopSync: ctx.stopSync }
    : { isSyncInProgress: false, stopSync: () => {} };
}
