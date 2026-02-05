import { app, ipcMain, shell, type BrowserWindow } from "electron";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

import { upsertApiKeyProfile } from "../keys/apiKeys";
import { registerGogIpcHandlers } from "../gog/ipc";
import { registerResetAndCloseIpcHandler } from "../reset/ipc";
import type { GatewayState } from "../types";

export function registerIpcHandlers(params: {
  getMainWindow: () => BrowserWindow | null;
  getGatewayState: () => GatewayState | null;
  getLogsDir: () => string | null;
  getConsentAccepted: () => boolean;
  acceptConsent: () => Promise<void>;
  startGateway: () => Promise<void>;
  userData: string;
  stateDir: string;
  logsDir: string;
  openclawDir: string;
  gogBin: string;
  memoBin: string;
  stopGatewayChild: () => Promise<void>;
}) {
  ipcMain.handle("open-logs", async () => {
    const logsDir = params.getLogsDir();
    if (!logsDir) {
      return;
    }
    // Open the logs directory in Finder/Explorer.
    await shell.openPath(logsDir);
  });

  ipcMain.handle("devtools-toggle", async () => {
    const win = params.getMainWindow();
    if (!win || win.isDestroyed()) {
      return;
    }
    const wc = win.webContents;
    if (wc.isDevToolsOpened()) {
      wc.closeDevTools();
    } else {
      wc.openDevTools({ mode: "detach" });
    }
  });

  ipcMain.handle("open-external", async (_evt, p: { url?: unknown }) => {
    const url = typeof p?.url === "string" ? p.url : "";
    if (!url) {
      return;
    }
    await shell.openExternal(url);
  });

  ipcMain.handle("gateway-get-info", async () => ({ state: params.getGatewayState() }));

  ipcMain.handle("consent-get", async () => ({ accepted: params.getConsentAccepted() }));

  ipcMain.handle("consent-accept", async () => {
    await params.acceptConsent();
    await params.startGateway();
    return { ok: true } as const;
  });

  ipcMain.handle("gateway-start", async () => {
    await params.startGateway();
    return { ok: true } as const;
  });

  ipcMain.handle("gateway-retry", async () => {
    app.relaunch();
    app.exit(0);
  });

  ipcMain.handle("auth-set-api-key", async (_evt, p: { provider?: unknown; apiKey?: unknown }) => {
    const provider = typeof p?.provider === "string" ? p.provider.trim() : "";
    const apiKey = typeof p?.apiKey === "string" ? p.apiKey : "";
    if (!provider) {
      throw new Error("provider is required");
    }
    upsertApiKeyProfile({ stateDir: params.stateDir, provider, key: apiKey, profileName: "default" });
    return { ok: true } as const;
  });

  ipcMain.handle("memo-check", async () => {
    const memoBin = params.memoBin;
    if (!fs.existsSync(memoBin)) {
      return {
        ok: false,
        code: null,
        stdout: "",
        stderr: `memo binary not found at: ${memoBin}\nRun: cd apps/electron-desktop && npm run prepare:memo:all`,
        resolvedPath: null,
      } as const;
    }
    const res = spawnSync(memoBin, ["--help"], {
      encoding: "utf-8",
      cwd: params.openclawDir,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = String(res.stdout || "");
    const stderr = String(res.stderr || "");
    const ok = res.status === 0;
    return {
      ok,
      code: typeof res.status === "number" ? res.status : null,
      stdout,
      stderr,
      resolvedPath: memoBin,
    } as const;
  });

  registerGogIpcHandlers({
    gogBin: params.gogBin,
    openclawDir: params.openclawDir,
    userData: params.userData,
    // Let the gog IPC layer auto-discover the correct staged credentials file. Passing an empty
    // string also keeps this call compatible with older TS inference in some tooling.
    gogCredentialsPath: "",
  });
  registerResetAndCloseIpcHandler({
    userData: params.userData,
    stateDir: params.stateDir,
    logsDir: params.logsDir,
    gogBin: params.gogBin,
    openclawDir: params.openclawDir,
    stopGatewayChild: params.stopGatewayChild,
  });
}

