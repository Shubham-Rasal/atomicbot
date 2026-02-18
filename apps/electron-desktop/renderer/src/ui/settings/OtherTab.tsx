import React from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { routes } from "../app/routes";
import { settingsStyles as ps } from "./SettingsPage";
import { RestoreBackupModal } from "./RestoreBackupModal";
import s from "./OtherTab.module.css";
import pkg from "../../../../package.json";

const TERMINAL_SIDEBAR_KEY = "terminal-sidebar-visible";

export function useTerminalSidebarVisible(): [boolean, (v: boolean) => void] {
  const [visible, setVisible] = React.useState(() => {
    try {
      return localStorage.getItem(TERMINAL_SIDEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });

  const toggle = React.useCallback((v: boolean) => {
    setVisible(v);
    try {
      localStorage.setItem(TERMINAL_SIDEBAR_KEY, v ? "1" : "0");
    } catch {
      // ignore
    }
    // Notify other components (Sidebar) that are already mounted.
    window.dispatchEvent(new Event("terminal-sidebar-changed"));
  }, []);

  return [visible, toggle];
}

export function OtherTab({ onError }: { onError: (msg: string | null) => void }) {
  const [launchAtStartup, setLaunchAtStartup] = React.useState(false);
  const [resetBusy, setResetBusy] = React.useState(false);
  const [terminalSidebar, setTerminalSidebar] = useTerminalSidebarVisible();
  const [stateDir, setStateDir] = React.useState<string>("");

  const appVersion = pkg.version || "0.0.0";

  // Load the current launch-at-login state and stateDir on mount.
  React.useEffect(() => {
    const api = getDesktopApiOrNull();
    if (!api?.getLaunchAtLogin) {
      return;
    }
    void api.getLaunchAtLogin().then((res) => setLaunchAtStartup(res.enabled));
    if (api?.getStateDir) {
      void api.getStateDir().then((res) => setStateDir(res.stateDir));
    }
  }, []);

  const toggleLaunchAtStartup = React.useCallback(
    async (enabled: boolean) => {
      const api = getDesktopApiOrNull();
      if (!api?.setLaunchAtLogin) {
        onError("Desktop API not available");
        return;
      }
      setLaunchAtStartup(enabled);
      try {
        await api.setLaunchAtLogin(enabled);
      } catch (err) {
        // Revert on failure.
        setLaunchAtStartup(!enabled);
        onError(String(err));
      }
    },
    [onError]
  );

  const changeStateDir = React.useCallback(async () => {
    const api = window.openclawDesktop;
    if (!api?.pickStateDirFolder || !api?.setStateDirOverride) {
      onError("Desktop API not available");
      return;
    }
    onError(null);
    const pick = await api.pickStateDirFolder();
    if (!pick.ok || !pick.path) {return;}
    const res = await api.setStateDirOverride(pick.path);
    if (!res.ok) {
      onError(res.error ?? "Failed to set state directory");
      return;
    }
    setStateDir(pick.path);
    if (res.needsRestart) {
      const ok = window.confirm(
        "The state directory has been changed. The app needs to restart for this to take effect. Restart now?"
      );
      if (ok) {
        void api.retry();
      }
    }
  }, [onError]);

  const resetStateDir = React.useCallback(async () => {
    const api = window.openclawDesktop;
    if (!api?.setStateDirOverride) {
      onError("Desktop API not available");
      return;
    }
    onError(null);
    const res = await api.setStateDirOverride("");
    if (!res.ok) {
      onError(res.error ?? "Failed to reset state directory");
      return;
    }
    const ok = window.confirm(
      "The state directory override has been cleared. The app needs to restart to use the default. Restart now?"
    );
    if (ok) {
      void api.retry();
    }
  }, [onError]);

  const resetAndClose = React.useCallback(async () => {
    const api = getDesktopApiOrNull();
    if (!api) {
      onError("Desktop API not available");
      return;
    }
    const ok = window.confirm(
      "All local data will be deleted and Google Workspace will be disconnected. The app will close and you’ll need to set it up again."
    );
    if (!ok) {
      return;
    }
    onError(null);
    setResetBusy(true);
    try {
      await api.resetAndClose();
    } catch (err) {
      onError(String(err));
      setResetBusy(false);
    }
  }, [onError]);

  const handleCreateBackup = React.useCallback(async () => {
    const api = getDesktopApiOrNull();
    if (!api?.createBackup) {
      onError("Desktop API not available");
      return;
    }
    onError(null);
    setBackupBusy(true);
    try {
      const result = await api.createBackup();
      if (!result.ok && !result.cancelled) {
        onError(result.error || "Failed to create backup");
      }
    } catch (err) {
      onError(String(err));
    } finally {
      setBackupBusy(false);
    }
  }, [onError]);

  const handleRestored = React.useCallback(() => {
    setRestoreModalOpen(false);
    navigate(routes.chat);
  }, [navigate]);

  const api = getDesktopApiOrNull();

  return (
<<<<<<< HEAD
    <div className={ps.UiSettingsContentInner}>
      {/* Folders: OpenClaw data + Agent workspace */}
      <section className={s.UiSettingsOtherSection}>
        <h3 className={s.UiSettingsOtherSectionTitle}>Folders</h3>
        <div className={s.UiSettingsOtherCard}>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>OpenClaw folder</span>
=======
    <div className="UiSettingsContentInner UiSettingsOther">
      <h2 className="UiSettingsOtherTitle">Other</h2>

      <section className="UiSettingsOtherSection">
        <h3 className="UiSettingsOtherSectionTitle">State Directory</h3>
        <div className="UiSettingsOtherCard">
          <div className="UiSettingsOtherRow">
            <span className="UiSettingsOtherRowLabel UiSettingsOtherRowLabel--mono">
              {stateDir || "Loading..."}
            </span>
          </div>
          <div className="UiSettingsOtherRow">
>>>>>>> 7207ec5 (Implement state directory management in Electron app, allowing user overrides and selection of custom directories. Enhance chat functionality to support message attachments and update UI for generated images. Add Nano Banana skill integration with appropriate modals and status handling.)
            <button
              type="button"
              className={s.UiSettingsOtherLink}
              onClick={() => void api?.openOpenclawFolder()}
            >
              Open folder
            </button>
            <span style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className="UiSettingsOtherLink"
                onClick={() => void changeStateDir()}
              >
                Change
              </button>
              <button
                type="button"
                className="UiSettingsOtherLink"
                onClick={() => void resetStateDir()}
              >
                Reset to default
              </button>
            </span>
          </div>
<<<<<<< HEAD
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Agent workspace</span>
=======
        </div>
        <p className="UiSettingsOtherHint">
          Contains your local OpenClaw state and app data. When an external gateway is running, this
          automatically points to ~/.openclaw.
        </p>
      </section>

      <section className="UiSettingsOtherSection">
        <h3 className="UiSettingsOtherSectionTitle">Workspace</h3>
        <div className="UiSettingsOtherCard">
          <div className="UiSettingsOtherRow">
            <span className="UiSettingsOtherRowLabel UiSettingsOtherRowLabel--mono">
              {stateDir ? `${stateDir}/workspace` : "Loading..."}
            </span>
          </div>
          <div className="UiSettingsOtherRow">
>>>>>>> 7207ec5 (Implement state directory management in Electron app, allowing user overrides and selection of custom directories. Enhance chat functionality to support message attachments and update UI for generated images. Add Nano Banana skill integration with appropriate modals and status handling.)
            <button
              type="button"
              className={s.UiSettingsOtherLink}
              onClick={() => void api?.openWorkspaceFolder()}
            >
              Open folder
            </button>
          </div>
        </div>
        <p className={s.UiSettingsOtherHint}>
          Contains your local OpenClaw state and app data. Workspace contains editable .md files
          (AGENTS, SOUL, USER, IDENTITY, TOOLS, HEARTBEAT, BOOTSTRAP) that shape the agent.
        </p>
      </section>

      {/* Terminal */}
      <section className={s.UiSettingsOtherSection}>
        <h3 className={s.UiSettingsOtherSectionTitle}>Terminal</h3>
        <div className={s.UiSettingsOtherCard}>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Show in sidebar</span>
            <span className={s.UiSettingsOtherAppRowValue}>
              <label className={s.UiSettingsOtherToggle} aria-label="Show terminal in sidebar">
                <input
                  type="checkbox"
                  checked={terminalSidebar}
                  onChange={(e) => setTerminalSidebar(e.target.checked)}
                />
                <span className={s.UiSettingsOtherToggleTrack}>
                  <span className={s.UiSettingsOtherToggleThumb} />
                </span>
              </label>
            </span>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <NavLink to={routes.terminal} className={s.UiSettingsOtherLink}>
              Open Terminal
            </NavLink>
          </div>
        </div>
        <p className={s.UiSettingsOtherHint}>
          Built-in terminal with openclaw and bundled tools in PATH.
        </p>
      </section>

      {/* App & About (combined) */}
      <section className={s.UiSettingsOtherSection}>
        <h3 className={s.UiSettingsOtherSectionTitle}>App</h3>
        <div className={s.UiSettingsOtherCard}>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Version</span>
            <span className={s.UiSettingsOtherAppRowValue}>Atomic Bot v{appVersion}</span>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Auto start</span>
            <span className={s.UiSettingsOtherAppRowValue}>
              <label className={s.UiSettingsOtherToggle} aria-label="Launch at startup">
                <input
                  type="checkbox"
                  checked={launchAtStartup}
                  onChange={(e) => void toggleLaunchAtStartup(e.target.checked)}
                />
                <span className={s.UiSettingsOtherToggleTrack}>
                  <span className={s.UiSettingsOtherToggleThumb} />
                </span>
              </label>
            </span>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>License</span>
            <button
              type="button"
              className={s.UiSettingsOtherLink}
              onClick={() =>
                void api?.openExternal("https://polyformproject.org/licenses/noncommercial/1.0.0")
              }
            >
              PolyForm Noncommercial 1.0.0
            </button>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Support</span>
            <a href="mailto:support@atomicbot.ai" className={s.UiSettingsOtherLink}>
              support@atomicbot.ai
            </a>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <NavLink to={routes.legacy} className={s.UiSettingsOtherLink}>
              Legacy UI Dashboard
            </NavLink>
          </div>
        </div>
        <div className={s.UiSettingsOtherLinksRow}>
          <span className={s.UiSettingsOtherFooterCopy}>
            &copy; {new Date().getFullYear()} Atomic Bot
          </span>
          <button
            type="button"
            className={s.UiSettingsOtherFooterLink}
            onClick={() => void api?.openExternal("https://github.com/AtomicBot-ai/atomicbot")}
          >
            GitHub
          </button>
          <button
            type="button"
            className={s.UiSettingsOtherFooterLink}
            onClick={() => void api?.openExternal("https://atomicbot.ai")}
          >
            Website
          </button>
          <button
            type="button"
            className={s.UiSettingsOtherFooterLink}
            onClick={() => void api?.openExternal("https://x.com/atomicbot_ai")}
          >
            X
          </button>
          <button
            type="button"
            className={s.UiSettingsOtherFooterLink}
            onClick={() => void api?.openExternal("https://www.instagram.com/atomicbot.ai/")}
          >
            Instagram
          </button>
          <button
            type="button"
            className={s.UiSettingsOtherFooterLink}
            onClick={() => void api?.openExternal("https://discord.gg/2TXafRV69m")}
          >
            Discord
          </button>
        </div>
      </section>

      {/* Backup */}
      <section className={s.UiSettingsOtherSection}>
        <h3 className={s.UiSettingsOtherSectionTitle}>Backup</h3>
        <div className={s.UiSettingsOtherCard}>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Create backup</span>
            <button
              type="button"
              className={s.UiSettingsOtherLink}
              disabled={backupBusy}
              onClick={() => void handleCreateBackup()}
            >
              {backupBusy ? "Creating..." : "Save to file"}
            </button>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Restore from backup</span>
            <button
              type="button"
              className={s.UiSettingsOtherLink}
              onClick={() => setRestoreModalOpen(true)}
            >
              Choose file
            </button>
          </div>
        </div>
        <p className={s.UiSettingsOtherHint}>
          Create a full backup of your OpenClaw configuration or restore from a previously saved
          backup.
        </p>
      </section>

      <RestoreBackupModal
        open={restoreModalOpen}
        onClose={() => setRestoreModalOpen(false)}
        onRestored={handleRestored}
      />

      {/* Folders: OpenClaw data + Agent workspace */}
      <section className={s.UiSettingsOtherSection}>
        <h3 className={s.UiSettingsOtherSectionTitle}>Folders</h3>
        <div className={s.UiSettingsOtherCard}>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>OpenClaw folder</span>
            <button
              type="button"
              className={s.UiSettingsOtherLink}
              onClick={() => void api?.openOpenclawFolder()}
            >
              Open folder
            </button>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Agent workspace</span>
            <button
              type="button"
              className={s.UiSettingsOtherLink}
              onClick={() => void api?.openWorkspaceFolder()}
            >
              Open folder
            </button>
          </div>
        </div>
        <p className={s.UiSettingsOtherHint}>
          Contains your local OpenClaw state and app data. Workspace contains editable .md files
          (AGENTS, SOUL, USER, IDENTITY, TOOLS, HEARTBEAT, BOOTSTRAP) that shape the agent.
        </p>
      </section>

      {/* Terminal */}
      <section className={s.UiSettingsOtherSection}>
        <h3 className={s.UiSettingsOtherSectionTitle}>Terminal</h3>
        <div className={s.UiSettingsOtherCard}>
          <div className={s.UiSettingsOtherRow}>
            <span className={s.UiSettingsOtherRowLabel}>Show in sidebar</span>
            <span className={s.UiSettingsOtherAppRowValue}>
              <label className={s.UiSettingsOtherToggle} aria-label="Show terminal in sidebar">
                <input
                  type="checkbox"
                  checked={terminalSidebar}
                  onChange={(e) => setTerminalSidebar(e.target.checked)}
                />
                <span className={s.UiSettingsOtherToggleTrack}>
                  <span className={s.UiSettingsOtherToggleThumb} />
                </span>
              </label>
            </span>
          </div>
          <div className={s.UiSettingsOtherRow}>
            <NavLink to={routes.terminal} className={s.UiSettingsOtherLink}>
              Open Terminal
            </NavLink>
          </div>
        </div>
        <p className={s.UiSettingsOtherHint}>
          Built-in terminal with openclaw and bundled tools in PATH.
        </p>
      </section>

      {/* Danger zone (reset) */}
      <section className={s.UiSettingsOtherSection}>
        <h3 className={s.UiSettingsOtherSectionTitle}>Account</h3>
        <p className={s.UiSettingsOtherDangerSubtitle}>
          This will wipe the app's local state and remove all Google Workspace authorizations. The
          app will restart.
        </p>
        <div className={`${s.UiSettingsOtherCard} ${s["UiSettingsOtherCard--danger"]}`}>
          <div className={s.UiSettingsOtherRow}>
            <button
              type="button"
              className={s.UiSettingsOtherDangerButton}
              disabled={resetBusy}
              onClick={() => void resetAndClose()}
            >
              {resetBusy ? "Resetting..." : "Reset and sign out"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
