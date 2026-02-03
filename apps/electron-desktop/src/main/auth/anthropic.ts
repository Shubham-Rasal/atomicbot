import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { DEFAULT_AGENT_ID } from "../constants";
import { ensureDir } from "../util/fs";

export function writeAuthProfilesAnthropicApiKey(params: { stateDir: string; apiKey: string }) {
  const key = params.apiKey.trim();
  if (!key) {
    throw new Error("apiKey is required");
  }
  const agentDir = path.join(params.stateDir, "agents", DEFAULT_AGENT_ID, "agent");
  const authPath = path.join(agentDir, "auth-profiles.json");
  ensureDir(agentDir);

  let store: {
    version?: number;
    profiles?: Record<string, unknown>;
    order?: Record<string, unknown>;
  } = {};
  try {
    if (fs.existsSync(authPath)) {
      const raw = fs.readFileSync(authPath, "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        store = parsed as typeof store;
      }
    }
  } catch {
    // ignore; we will overwrite with a sane payload
    store = {};
  }

  const profiles = (store.profiles && typeof store.profiles === "object" ? store.profiles : {}) as Record<
    string,
    unknown
  >;
  profiles["anthropic:default"] = { type: "api_key", provider: "anthropic", key };
  const order = (store.order && typeof store.order === "object" ? store.order : {}) as Record<string, unknown>;
  order.anthropic = ["anthropic:default"];

  const payload = {
    version: typeof store.version === "number" ? store.version : 1,
    profiles,
    order,
  };

  const tmp = `${authPath}.${randomBytes(8).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf-8" });
  try {
    fs.chmodSync(tmp, 0o600);
  } catch {
    // ignore
  }
  fs.renameSync(tmp, authPath);
  try {
    fs.chmodSync(authPath, 0o600);
  } catch {
    // ignore
  }
}

