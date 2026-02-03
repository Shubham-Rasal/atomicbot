import { ipcMain } from "electron";
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { ensureDir } from "../util/fs";
import { runGog } from "./gog";
import type { GogExecResult } from "./types";

export function registerGogIpcHandlers(params: { gogBin: string; openclawDir: string; userData: string }) {
  const { gogBin, openclawDir, userData } = params;

  ipcMain.handle("gog-auth-list", async () => {
    if (!fs.existsSync(gogBin)) {
      return {
        ok: false,
        code: null,
        stdout: "",
        stderr: `gog binary not found at: ${gogBin}\nRun: npm run fetch:gog (in apps/electron-desktop)`,
      } satisfies GogExecResult;
    }
    const res = await runGog({ bin: gogBin, args: ["auth", "list"], cwd: openclawDir });
    return res;
  });

  ipcMain.handle("gog-auth-add", async (_evt, p: { account?: unknown; services?: unknown; noInput?: unknown }) => {
    if (!fs.existsSync(gogBin)) {
      return {
        ok: false,
        code: null,
        stdout: "",
        stderr: `gog binary not found at: ${gogBin}\nRun: npm run fetch:gog (in apps/electron-desktop)`,
      } satisfies GogExecResult;
    }
    const account = typeof p?.account === "string" ? p.account.trim() : "";
    const services = typeof p?.services === "string" ? p.services.trim() : "gmail";
    const noInput = Boolean(p?.noInput);
    if (!account) {
      return {
        ok: false,
        code: null,
        stdout: "",
        stderr: "account is required",
      } satisfies GogExecResult;
    }
    const args = ["auth", "add", account, "--services", services];
    if (noInput) {
      args.push("--no-input");
    }
    const res = await runGog({ bin: gogBin, args, cwd: openclawDir });
    return res;
  });

  ipcMain.handle("gog-auth-credentials", async (_evt, p: { credentialsJson?: unknown; filename?: unknown }) => {
    if (!fs.existsSync(gogBin)) {
      return {
        ok: false,
        code: null,
        stdout: "",
        stderr: `gog binary not found at: ${gogBin}\nRun: npm run fetch:gog (in apps/electron-desktop)`,
      } satisfies GogExecResult;
    }
    const text = typeof p?.credentialsJson === "string" ? p.credentialsJson : "";
    if (!text.trim()) {
      return {
        ok: false,
        code: null,
        stdout: "",
        stderr: "credentialsJson is required",
      } satisfies GogExecResult;
    }
    const tmpDir = path.join(userData, "tmp");
    ensureDir(tmpDir);
    const nameRaw = typeof p?.filename === "string" ? p.filename.trim() : "";
    const base = nameRaw && nameRaw.endsWith(".json") ? nameRaw : "gog-client-secret.json";
    const tmpPath = path.join(tmpDir, `${randomBytes(8).toString("hex")}-${base}`);
    fs.writeFileSync(tmpPath, text, { encoding: "utf-8" });
    try {
      fs.chmodSync(tmpPath, 0o600);
    } catch {
      // ignore
    }
    try {
      const res = await runGog({
        bin: gogBin,
        args: ["auth", "credentials", "set", tmpPath, "--no-input"],
        cwd: openclawDir,
      });
      return res;
    } finally {
      try {
        fs.rmSync(tmpPath, { force: true });
      } catch {
        // ignore
      }
    }
  });
}

