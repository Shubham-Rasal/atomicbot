import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as pty from "node-pty";
import type { BrowserWindow } from "electron";

type PtyInstance = pty.IPty;

interface TerminalSession {
  pty: PtyInstance;
  /** Circular buffer of recent output for replay on reconnect. */
  buffer: string;
  alive: boolean;
}

/** Cap per-terminal buffer at 100 KB to avoid unbounded memory growth. */
const MAX_BUFFER_SIZE = 100 * 1024;

const terminals = new Map<string, TerminalSession>();

// ─── Helper bin dir ────────────────────────────────────────────────────────

/**
 * Ensure a helper bin directory exists inside stateDir with an `openclaw`
 * wrapper script that points to the real openclaw.mjs entry point.
 * This lets the user type `openclaw <cmd>` in the embedded terminal.
 */
function ensureTerminalBinDir(params: {
  stateDir: string;
  openclawDir: string;
  nodeBin: string;
}): string {
  const binDir = path.join(params.stateDir, ".terminal-bin");
  try {
    fs.mkdirSync(binDir, { recursive: true });
  } catch {
    // ignore
  }

  const openclawMjs = path.join(params.openclawDir, "openclaw.mjs");
  const wrapperPath = path.join(binDir, "openclaw");

  // Always recreate the wrapper to keep it in sync with the current install.
  try {
    fs.unlinkSync(wrapperPath);
  } catch {
    // ignore (file may not exist)
  }

  // Resolve the actual node binary path for the wrapper.
  // In dev mode nodeBin may be just "node"; in that case rely on PATH.
  const isAbsoluteNodeBin = path.isAbsolute(params.nodeBin);
  const nodeCmd = isAbsoluteNodeBin ? params.nodeBin : "node";

  // Create a small shell wrapper instead of a symlink so we can control which
  // node binary is used (important in packaged mode where system node may not exist).
  const script = [
    "#!/bin/sh",
    `exec "${nodeCmd}" "${openclawMjs}" "$@"`,
    "",
  ].join("\n");
  fs.writeFileSync(wrapperPath, script, { mode: 0o755 });

  return binDir;
}

// ─── PATH construction ─────────────────────────────────────────────────────

/**
 * Build a PATH string that includes all bundled binaries so the user can run
 * `openclaw`, `node`, `gog`, `jq`, etc. directly from the embedded terminal.
 */
function buildTerminalPath(params: {
  terminalBinDir: string;
  nodeBin: string;
  gogBin?: string;
  jqBin?: string;
  memoBin?: string;
  remindctlBin?: string;
  obsidianCliBin?: string;
  ghBin?: string;
}): string {
  const systemPath = process.env.PATH ?? "";

  const extraDirs: string[] = [];

  // 1. The helper bin dir with the `openclaw` wrapper script (highest priority).
  extraDirs.push(params.terminalBinDir);

  // 2. The directory containing the bundled/resolved Node binary.
  //    Skip bare command names like "node" (path.dirname("node") → ".").
  if (params.nodeBin && path.isAbsolute(params.nodeBin)) {
    extraDirs.push(path.dirname(params.nodeBin));
  }

  // 3. Directories for each bundled tool binary.
  const toolBins = [
    params.gogBin,
    params.jqBin,
    params.memoBin,
    params.remindctlBin,
    params.obsidianCliBin,
    params.ghBin,
  ];
  for (const bin of toolBins) {
    if (bin && path.isAbsolute(bin)) {
      extraDirs.push(path.dirname(bin));
    }
  }

  const unique = Array.from(new Set(extraDirs.filter(Boolean)));
  if (unique.length === 0) {
    return systemPath;
  }
  return `${unique.join(path.delimiter)}${path.delimiter}${systemPath}`;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export type CreateTerminalParams = {
  getMainWindow: () => BrowserWindow | null;
  stateDir: string;
  openclawDir: string;
  nodeBin: string;
  gogBin?: string;
  jqBin?: string;
  memoBin?: string;
  remindctlBin?: string;
  obsidianCliBin?: string;
  ghBin?: string;
};

export function createTerminal(params: CreateTerminalParams): { id: string } {
  const id = crypto.randomBytes(8).toString("hex");

  const shell = process.env.SHELL || (process.platform === "win32" ? "powershell.exe" : "/bin/sh");
  const cwd = params.stateDir;

  // Create/refresh the helper bin directory with the `openclaw` wrapper script.
  const terminalBinDir = ensureTerminalBinDir({
    stateDir: params.stateDir,
    openclawDir: params.openclawDir,
    nodeBin: params.nodeBin,
  });

  const mergedPath = buildTerminalPath({
    terminalBinDir,
    nodeBin: params.nodeBin,
    gogBin: params.gogBin,
    jqBin: params.jqBin,
    memoBin: params.memoBin,
    remindctlBin: params.remindctlBin,
    obsidianCliBin: params.obsidianCliBin,
    ghBin: params.ghBin,
  });

  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) {
      env[k] = v;
    }
  }
  env.PATH = mergedPath;
  // Ensure terminal programs see colors.
  delete env.NO_COLOR;
  delete env.FORCE_COLOR;
  env.TERM = env.TERM || "xterm-256color";

  const ptyProcess = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd,
    env,
  });

  const session: TerminalSession = { pty: ptyProcess, buffer: "", alive: true };
  terminals.set(id, session);

  ptyProcess.onData((data: string) => {
    // Append to replay buffer (circular — trim from the front when oversize).
    session.buffer += data;
    if (session.buffer.length > MAX_BUFFER_SIZE) {
      session.buffer = session.buffer.slice(session.buffer.length - MAX_BUFFER_SIZE);
    }

    const win = params.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("terminal:data", { id, data });
    }
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    session.alive = false;
    const win = params.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("terminal:exit", { id, exitCode, signal });
    }
  });

  return { id };
}

export function writeTerminal(id: string, data: string): void {
  const session = terminals.get(id);
  if (session?.alive) {
    session.pty.write(data);
  }
}

export function resizeTerminal(id: string, cols: number, rows: number): void {
  const session = terminals.get(id);
  if (session?.alive) {
    session.pty.resize(Math.max(cols, 1), Math.max(rows, 1));
  }
}

export function killTerminal(id: string): void {
  const session = terminals.get(id);
  if (!session) {
    return;
  }
  try {
    session.pty.kill();
  } catch {
    // ignore
  }
  terminals.delete(id);
}

export function listTerminals(): Array<{ id: string; alive: boolean }> {
  const result: Array<{ id: string; alive: boolean }> = [];
  for (const [id, session] of terminals) {
    result.push({ id, alive: session.alive });
  }
  return result;
}

export function getTerminalBuffer(id: string): string {
  return terminals.get(id)?.buffer ?? "";
}

export function killAllTerminals(): void {
  for (const [id] of terminals) {
    killTerminal(id);
  }
}
