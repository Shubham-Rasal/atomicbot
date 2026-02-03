import { app, type BrowserWindow } from "electron";
import type { ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import * as path from "node:path";
import { registerIpcHandlers } from "./main/ipc/register";
import { DEFAULT_PORT } from "./main/constants";
import { ensureGogCredentialsConfigured } from "./main/gog/gog";
import { ensureGatewayConfigFile, readGatewayTokenFromConfig } from "./main/gateway/config";
import { spawnGateway } from "./main/gateway/spawn";
import {
  resolveBundledGogBin,
  resolveBundledGogCredentialsPath,
  resolveBundledNodeBin,
  resolveBundledOpenClawDir,
  resolveDownloadedGogBin,
  resolveDownloadedGogCredentialsPath,
  resolvePreloadPath,
  resolveRendererIndex,
  resolveRepoRoot,
} from "./main/openclaw/paths";
import { createTailBuffer, pickPort, waitForPortOpen } from "./main/util/net";
import { createMainWindow } from "./main/window/mainWindow";
import type { GatewayState } from "./main/types";

const MAIN_DIR = __dirname;

let mainWindow: BrowserWindow | null = null;

let gateway: ChildProcess | null = null;
let logsDirForUi: string | null = null;
let gatewayState: GatewayState | null = null;

async function stopGatewayChild(): Promise<void> {
  const child = gateway;
  gateway = null;
  if (!child) {
    return;
  }
  try {
    child.kill("SIGTERM");
  } catch {
    // ignore
  }
  await new Promise((r) => setTimeout(r, 1500));
  if (!child.killed) {
    try {
      child.kill("SIGKILL");
    } catch {
      // ignore
    }
  }
}

function broadcastGatewayState(win: BrowserWindow | null, state: GatewayState) {
  gatewayState = state;
  try {
    win?.webContents.send("gateway-state", state);
  } catch {
    // ignore
  }
}

app.on("window-all-closed", () => {
  // macOS convention: keep the app alive until the user quits explicitly.
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  await stopGatewayChild();
});

app.whenReady().then(async () => {
  const userData = app.getPath("userData");
  const stateDir = path.join(userData, "openclaw");
  const logsDir = path.join(userData, "logs");
  logsDirForUi = logsDir;

  const openclawDir = app.isPackaged ? resolveBundledOpenClawDir() : resolveRepoRoot(MAIN_DIR);
  const nodeBin = app.isPackaged ? resolveBundledNodeBin() : process.execPath;
  const gogBin = app.isPackaged ? resolveBundledGogBin() : resolveDownloadedGogBin(MAIN_DIR);
  const gogCredentialsPath = app.isPackaged
    ? resolveBundledGogCredentialsPath()
    : resolveDownloadedGogCredentialsPath(MAIN_DIR);

  registerIpcHandlers({
    getMainWindow: () => mainWindow,
    getGatewayState: () => gatewayState,
    getLogsDir: () => logsDirForUi,
    userData,
    stateDir,
    logsDir,
    openclawDir,
    gogBin,
    stopGatewayChild,
  });

  await ensureGogCredentialsConfigured({
    gogBin,
    openclawDir,
    credentialsJsonPath: gogCredentialsPath,
  });

  const port = await pickPort(DEFAULT_PORT);
  const url = `http://127.0.0.1:${port}/`;
  const configPath = path.join(stateDir, "openclaw.json");
  const tokenFromConfig = readGatewayTokenFromConfig(configPath);
  const token = tokenFromConfig ?? randomBytes(24).toString("base64url");
  ensureGatewayConfigFile({ configPath, token });

  const stderrTail = createTailBuffer(24_000);
  gateway = spawnGateway({
    port,
    logsDir,
    stateDir,
    configPath,
    token,
    openclawDir,
    nodeBin,
    gogBin,
    stderrTail,
  });

  const rendererIndex = resolveRendererIndex({ isPackaged: app.isPackaged, appPath: app.getAppPath(), mainDir: MAIN_DIR });
  const preloadPath = resolvePreloadPath(MAIN_DIR);
  const win = await createMainWindow({ preloadPath, rendererIndex });
  mainWindow = win;
  broadcastGatewayState(win, { kind: "starting", port, logsDir, token });

  const ok = await waitForPortOpen("127.0.0.1", port, 30_000);
  if (!ok) {
    const details = [
      `Gateway did not open the port within 30s.`,
      "",
      `openclawDir: ${openclawDir}`,
      `nodeBin: ${nodeBin}`,
      `stderr (tail):`,
      stderrTail.read().trim() || "<empty>",
      "",
      `See logs in: ${logsDir}`,
    ].join("\n");
    broadcastGatewayState(win, { kind: "failed", port, logsDir, details, token });
    return;
  }

  // Keep the Electron window on the React renderer. The legacy Control UI is embedded in an iframe
  // and can be switched to/from the native pages without losing the top-level navigation.
  broadcastGatewayState(win, { kind: "ready", port, logsDir, url, token });
});

