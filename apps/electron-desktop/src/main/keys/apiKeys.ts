import {
  readAuthProfilesStore,
  resolveAuthProfilesPath,
  type ApiKeyProfile,
  type AuthProfilesStore,
  type TokenProfile,
  writeAuthProfilesStoreAtomic,
} from "./authProfilesStore";

function normalizeProvider(provider: string): string {
  return provider.trim().toLowerCase();
}

function normalizeProfileName(name: string): string {
  const trimmed = name.trim();
  return trimmed || "default";
}

function makeProfileId(params: { provider: string; profileName: string }): string {
  return `${params.provider}:${params.profileName}`;
}

function ensureOrderFront(params: { list: string[]; id: string }): string[] {
  const filtered = params.list.filter((x) => x !== params.id);
  return [params.id, ...filtered];
}

export function upsertApiKeyProfile(params: {
  stateDir: string;
  provider: string;
  key: string;
  profileName?: string;
  agentId?: string;
}): { profileId: string; authProfilesPath: string } {
  const provider = normalizeProvider(params.provider);
  const key = params.key.trim();
  if (!provider) {
    throw new Error("provider is required");
  }
  if (!key) {
    throw new Error("key is required");
  }

  const profileName = normalizeProfileName(params.profileName ?? "default");
  const profileId = makeProfileId({ provider, profileName });
  const authProfilesPath = resolveAuthProfilesPath({
    stateDir: params.stateDir,
    agentId: params.agentId,
  });

  const store = readAuthProfilesStore({ authProfilesPath });
  const next = applyUpsertApiKeyProfile(store, {
    profileId,
    profile: { type: "api_key", provider, key },
    setDefaultForProvider: true,
  });
  writeAuthProfilesStoreAtomic({ authProfilesPath, store: next });

  return { profileId, authProfilesPath };
}

export function applyUpsertApiKeyProfile(
  store: AuthProfilesStore,
  params: { profileId: string; profile: ApiKeyProfile; setDefaultForProvider: boolean }
): AuthProfilesStore {
  const profiles = { ...store.profiles, [params.profileId]: params.profile };
  const order = { ...store.order };
  if (params.setDefaultForProvider) {
    const prev = Array.isArray(order[params.profile.provider])
      ? order[params.profile.provider]
      : [];
    order[params.profile.provider] = ensureOrderFront({ list: prev, id: params.profileId });
  }
  return { version: store.version, profiles, order };
}

export function upsertTokenProfile(params: {
  stateDir: string;
  provider: string;
  token: string;
  profileName?: string;
  agentId?: string;
}): { profileId: string; authProfilesPath: string } {
  const provider = normalizeProvider(params.provider);
  const token = params.token.trim();
  if (!provider) {
    throw new Error("provider is required");
  }
  if (!token) {
    throw new Error("token is required");
  }

  const profileName = normalizeProfileName(params.profileName ?? "default");
  const profileId = makeProfileId({ provider, profileName });
  const authProfilesPath = resolveAuthProfilesPath({
    stateDir: params.stateDir,
    agentId: params.agentId,
  });

  const store = readAuthProfilesStore({ authProfilesPath });
  const profile: TokenProfile = { type: "token", provider, token };
  const profiles = { ...store.profiles, [profileId]: profile };
  const order = { ...store.order };
  const prev = Array.isArray(order[provider]) ? order[provider] : [];
  order[provider] = ensureOrderFront({ list: prev, id: profileId });

  writeAuthProfilesStoreAtomic({
    authProfilesPath,
    store: { version: store.version, profiles, order },
  });

  return { profileId, authProfilesPath };
}
