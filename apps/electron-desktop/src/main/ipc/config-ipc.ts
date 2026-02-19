/**
 * IPC handlers for app config, consent, gateway info, and launch-at-login.
 */
import { app, dialog, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";

import type { RegisterParams } from "./types";

export function registerConfigHandlers(params: RegisterParams) {
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

  // OpenClaw config (openclaw.json) read/write.
  const configJsonPath = path.join(params.stateDir, "openclaw.json");

  ipcMain.handle("config-read", async () => {
    try {
      if (!fs.existsSync(configJsonPath)) {
        return { ok: true, content: "" };
      }
      const content = fs.readFileSync(configJsonPath, "utf-8");
      return { ok: true, content };
    } catch (err) {
      return { ok: false, content: "", error: String(err) };
    }
  });

  ipcMain.handle("config-write", async (_evt, p: { content?: unknown }) => {
    const content = typeof p?.content === "string" ? p.content : "";
    try {
      JSON.parse(content);
    } catch (err) {
      console.warn("[ipc/config] config-write JSON parse failed:", err);
      return { ok: false, error: "Invalid JSON" };
    }
    try {
      fs.mkdirSync(path.dirname(configJsonPath), { recursive: true });
      fs.writeFileSync(configJsonPath, content, "utf-8");
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // Launch at login (auto-start) IPC handlers.
  ipcMain.handle("launch-at-login-get", () => {
    const settings = app.getLoginItemSettings();
    return { enabled: settings.openAtLogin };
  });

  ipcMain.handle("launch-at-login-set", (_evt, p: { enabled?: unknown }) => {
    const enabled = typeof p?.enabled === "boolean" ? p.enabled : false;
    app.setLoginItemSettings({ openAtLogin: enabled });
    return { ok: true } as const;
  });

  // App version
  ipcMain.handle("get-app-version", () => {
    return { version: app.getVersion() };
  });

  // ── State directory IPC handlers ────────────────────────────────────────────

  ipcMain.handle("get-state-dir", () => {
    return { stateDir: params.stateDir };
  });

  ipcMain.handle("set-state-dir-override", async (_evt, p: { stateDir?: unknown }) => {
    const dir = typeof p?.stateDir === "string" ? p.stateDir.trim() : "";
    try {
      if (dir) {
        fs.writeFileSync(
          params.stateDirOverridePath,
          `${JSON.stringify({ stateDir: dir }, null, 2)}\n`,
          "utf-8"
        );
      } else {
        // Clear the override by removing the file.
        if (fs.existsSync(params.stateDirOverridePath)) {
          fs.unlinkSync(params.stateDirOverridePath);
        }
      }
      return { ok: true, needsRestart: true } as const;
    } catch (err) {
      return { ok: false, error: String(err) } as const;
    }
  });

  ipcMain.handle("pick-state-dir-folder", async () => {
    const win = params.getMainWindow();
    if (!win) {
      return { ok: false, path: "" };
    }
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory", "createDirectory"],
      title: "Select State Directory",
    });
    if (result.canceled || !result.filePaths[0]) {
      return { ok: false, path: "" };
    }
    return { ok: true, path: result.filePaths[0] };
  });
}
