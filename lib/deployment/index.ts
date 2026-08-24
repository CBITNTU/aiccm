import type {
  DeploymentProfile,
  DeploymentProfileId,
  PublicDeploymentProfile,
} from "./types";
import { ukProfile } from "./profiles/uk";
import { cnProfile } from "./profiles/cn";
import { thProfile } from "./profiles/th";

export type {
  DeploymentProfile,
  DeploymentProfileId,
  PublicDeploymentProfile,
} from "./types";

const PROFILES: Record<DeploymentProfileId, DeploymentProfile> = {
  uk: ukProfile,
  cn: cnProfile,
  th: thProfile,
};

function resolveActiveProfile(): DeploymentProfile {
  const raw = (process.env.DEPLOYMENT_PROFILE ?? "uk").trim().toLowerCase();
  const profile = PROFILES[raw as DeploymentProfileId];
  if (!profile) {
    throw new Error(
      `Unknown DEPLOYMENT_PROFILE "${raw}". Expected one of: ${Object.keys(
        PROFILES,
      ).join(", ")}.`,
    );
  }
  return profile;
}

// Resolved once at module load — process-static, so no per-request DB/cache lookup
// and no cross-instance staleness (unlike platform_settings).
const ACTIVE_PROFILE: DeploymentProfile = resolveActiveProfile();

/** Full active deployment profile. Server-only — do not import from client components. */
export function getActiveProfile(): DeploymentProfile {
  return ACTIVE_PROFILE;
}

/**
 * Whether this process should report page views to Vercel Web Analytics.
 * Profile-gated (UK only — see `webAnalytics` in the profiles) and
 * production-only, so preview deploys and local dev stay out of the dashboard
 * and off the event quota. `VERCEL_ENV` is unset outside Vercel.
 */
export function isWebAnalyticsEnabled(): boolean {
  return ACTIVE_PROFILE.webAnalytics && process.env.VERCEL_ENV === "production";
}

/** Client-safe subset of the active profile, for serializing into the client tree. */
export function getPublicProfile(): PublicDeploymentProfile {
  const { id, brand, theme, i18n, currency, verification } = ACTIVE_PROFILE;
  return { id, brand, theme, i18n, currency, verification };
}
