import React from "react";
import { NavLink } from "react-router-dom";
import { ActionButton, ButtonRow } from "../kit";
import { routes } from "../routes";

export function OtherTab({ onError }: { onError: (msg: string | null) => void }) {
  const [launchAtStartup, setLaunchAtStartup] = React.useState(false);
  const [resetBusy, setResetBusy] = React.useState(false);

  const appVersion =
    typeof window !== "undefined" && window.openclawDesktop?.version
      ? window.openclawDesktop.version
      : "0.0.0";

  const resetAndClose = React.useCallback(async () => {
    const api = window.openclawDesktop;
    if (!api) {
      onError("Desktop API not available");
      return;
    }
    const ok = window.confirm(
      "Reset and close will delete the app's local state (including onboarding + logs) and remove all Google Workspace authorizations from the keystore. Continue?"
    );
    if (!ok) return;
    onError(null);
    setResetBusy(true);
    try {
      await api.resetAndClose();
    } catch (err) {
      onError(String(err));
      setResetBusy(false);
    }
  }, [onError]);

  const api = window.openclawDesktop;

  return (
    <div className="UiSettingsContentInner">
      <div className="UiSettingsTabTitle">Other</div>

      <section className="UiSettingsSection">
        <div className="UiSectionTitle">About</div>
        <div className="UiSettingsRow">
          <span className="UiSettingsRowLabel">App</span>
          <span className="UiSettingsRowValue">Atomic Bot v{appVersion}</span>
        </div>
        <div style={{ marginTop: 8 }}>
          <NavLink to={routes.legacy} className="UiLink">
            Legacy
          </NavLink>
        </div>

        <button
          onClick={() => {
            void api?.openLogs();
          }}
        >
          Open logs
        </button>
        <button
          onClick={() => {
            void api?.toggleDevTools();
          }}
        >
          DevTools
        </button>
      </section>

      <section className="UiSettingsSection">
        <div className="UiSectionTitle">General</div>
        <div className="UiSettingsRow">
          <span className="UiSettingsRowLabel">Launch at startup</span>
          <label className="UiToggle" aria-label="Launch at startup">
            <input
              type="checkbox"
              checked={launchAtStartup}
              onChange={(e) => setLaunchAtStartup(e.target.checked)}
            />
            <span className="UiToggleTrack">
              <span className="UiToggleThumb" />
            </span>
          </label>
        </div>
      </section>

      {/* ── Danger zone (reset) ──────────────────────────────── */}
      <section className="UiSettingsSection UiSettingsSection--danger" style={{ marginTop: 24 }}>
        <div className="UiSectionTitle">Danger zone</div>
        <div className="UiSectionSubtitle">
          This will wipe the app's local state and remove all Google Workspace authorizations. The
          app will then close.
        </div>
        <ButtonRow>
          <ActionButton variant="primary" disabled={resetBusy} onClick={() => void resetAndClose()}>
            {resetBusy ? "Resetting…" : "Reset and close"}
          </ActionButton>
        </ButtonRow>
      </section>
    </div>
  );
}
