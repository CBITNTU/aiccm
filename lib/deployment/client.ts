"use client";

import { createContext, createElement, useContext, type ReactNode } from "react";
import type { PublicDeploymentProfile } from "./types";

export type { PublicDeploymentProfile } from "./types";

const DeploymentContext = createContext<PublicDeploymentProfile | null>(null);

/**
 * Provides the client-safe deployment profile to the React tree. The value is
 * resolved on the server (`getPublicProfile()`) and passed in from the root layout.
 */
export function DeploymentProvider({
  profile,
  children,
}: {
  profile: PublicDeploymentProfile;
  children: ReactNode;
}) {
  return createElement(DeploymentContext.Provider, { value: profile }, children);
}

/** Read the active deployment profile (brand, theme, currency, i18n) in client components. */
export function useDeployment(): PublicDeploymentProfile {
  const ctx = useContext(DeploymentContext);
  if (!ctx) {
    throw new Error("useDeployment must be used within a <DeploymentProvider>");
  }
  return ctx;
}
