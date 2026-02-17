import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { DEFAULT_AGENT_ID } from "../constants";
import { ensureDir } from "../util/fs";

export type ApiKeyProfile = {
  type: "api_key";
  provider: string;
  key: string;
};

export type TokenProfile = {
  type: "token";
  provider: string;
  /** The setup token (e.g. Anthropic setup-token from `claude setup-token`). */
  token: string;
};

export type OAuthProfile = {
  type: "oauth";
  provider: string;
  /** OAuth refresh token. */
  refresh?: string;
  /** OAuth access token. */
  access?: string;
  /** Token expiry timestamp (ms since epoch). */
  expires?: number;
  /** Account email returned by the provider. */
  email?: string;
  /** Arbitrary extra fields from the provider's OAuthCredentials. */
  [key: string]: unknown;
};

export type AuthProfile = ApiKeyProfile | TokenProfile | OAuthProfile;

export type AuthProfilesStore = {
  version: number;
  profiles: Record<string, AuthProfile>;
  order: Record<string, string[]>;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

export function resolveAuthProfilesPath(params: { stateDir: string; agentId?: string }): string {
  const agentId = params.agentId ?? DEFAULT_AGENT_ID;
  const agentDir = path.join(params.stateDir, "agents", agentId, "agent");
  return path.join(agentDir, "auth-profiles.json");
}

export function readAuthProfilesStore(params: { authProfilesPath: string }): AuthProfilesStore {
  let raw: unknown = undefined;
  try {
    if (fs.existsSync(params.authProfilesPath)) {
      const text = fs.readFileSync(params.authProfilesPath, "utf-8");
      raw = JSON.parse(text) as unknown;
    }
  } catch (err) {
    console.warn("[authProfilesStore] readAuthProfilesStore failed:", err);
    raw = undefined;
  }

  const parsed = isPlainObject(raw) ? raw : {};
  const version = typeof parsed.version === "number" ? parsed.version : 1;

  const profilesRaw = isPlainObject(parsed.profiles) ? parsed.profiles : {};
  const profiles: Record<string, AuthProfile> = {};
  for (const [k, v] of Object.entries(profilesRaw)) {
    if (!isPlainObject(v)) {
      continue;
    }
    const type = v.type;
    if (type === "api_key") {
      const provider = typeof v.provider === "string" ? v.provider : "";
      const key = typeof v.key === "string" ? v.key : "";
      if (provider && key) {
        profiles[k] = { type: "api_key", provider, key };
      }
    } else if (type === "token") {
      const provider = typeof v.provider === "string" ? v.provider : "";
      const token = typeof v.token === "string" ? v.token : "";
      if (provider && token) {
        profiles[k] = { type: "token", provider, token };
      }
    } else if (type === "oauth") {
      const provider = typeof v.provider === "string" ? v.provider : "";
      if (provider) {
        const oauthProfile: OAuthProfile = { type: "oauth", provider };
        if (typeof v.refresh === "string") oauthProfile.refresh = v.refresh;
        if (typeof v.access === "string") oauthProfile.access = v.access;
        if (typeof v.expires === "number") oauthProfile.expires = v.expires;
        if (typeof v.email === "string") oauthProfile.email = v.email;
        // Preserve arbitrary extra fields from the provider.
        for (const [fk, fv] of Object.entries(v)) {
          if (!["type", "provider", "refresh", "access", "expires", "email"].includes(fk)) {
            oauthProfile[fk] = fv;
          }
        }
        profiles[k] = oauthProfile;
      }
    }
  }

  const orderRaw = isPlainObject(parsed.order) ? parsed.order : {};
  const order: Record<string, string[]> = {};
  for (const [provider, ids] of Object.entries(orderRaw)) {
    if (!Array.isArray(ids)) {
      continue;
    }
    const list = ids.map((id) => (typeof id === "string" ? id : "")).filter(Boolean);
    if (list.length > 0) {
      order[provider] = list;
    }
  }

  return { version, profiles, order };
}

/**
 * Upsert an OAuth profile into auth-profiles.json.
 * Stores full credential data (tokens, expiry, email, extras)
 * so the gateway can use them for API authentication.
 */
export function upsertOAuthProfile(params: {
  stateDir: string;
  provider: string;
  credentials: Record<string, unknown>;
  profileName?: string;
  agentId?: string;
}): { profileId: string; authProfilesPath: string } {
  const provider = params.provider.trim().toLowerCase();
  if (!provider) {
    throw new Error("provider is required");
  }

  const email =
    typeof params.credentials.email === "string" && params.credentials.email.trim()
      ? params.credentials.email.trim()
      : params.profileName?.trim() || "default";
  const profileId = `${provider}:${email}`;
  const authProfilesPath = resolveAuthProfilesPath({
    stateDir: params.stateDir,
    agentId: params.agentId,
  });

  const store = readAuthProfilesStore({ authProfilesPath });
  const profile: OAuthProfile = {
    type: "oauth",
    provider,
    ...params.credentials,
  };
  const profiles = { ...store.profiles, [profileId]: profile };
  const order = { ...store.order };
  const prev = Array.isArray(order[provider]) ? order[provider] : [];
  const filtered = prev.filter((x) => x !== profileId);
  order[provider] = [profileId, ...filtered];

  writeAuthProfilesStoreAtomic({
    authProfilesPath,
    store: { version: store.version, profiles, order },
  });

  return { profileId, authProfilesPath };
}

export function writeAuthProfilesStoreAtomic(params: {
  authProfilesPath: string;
  store: AuthProfilesStore;
}) {
  ensureDir(path.dirname(params.authProfilesPath));
  const tmp = `${params.authProfilesPath}.${randomBytes(8).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(params.store, null, 2)}\n`, { encoding: "utf-8" });
  try {
    fs.chmodSync(tmp, 0o600);
  } catch (err) {
    console.warn("[authProfilesStore] chmod tmp file failed:", err);
  }
  fs.renameSync(tmp, params.authProfilesPath);
  try {
    fs.chmodSync(params.authProfilesPath, 0o600);
  } catch (err) {
    console.warn("[authProfilesStore] chmod auth profiles file failed:", err);
  }
}
