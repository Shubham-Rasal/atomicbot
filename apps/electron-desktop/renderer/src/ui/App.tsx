import React from "react";
import {
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { ChatPage } from "./ChatPage";
import { StartChatPage } from "./StartChatPage";
import { Sidebar } from "./Sidebar";
import { SettingsIndexRedirect, SettingsPage, SettingsTab } from "./SettingsPage";
import { WelcomePage } from "./WelcomePage";
import { ConsentScreen, type ConsentDesktopApi } from "./ConsentScreen";
import { LoadingScreen } from "./LoadingScreen";
import { Brand } from "./kit";
import { GatewayRpcProvider } from "../gateway/context";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { initGatewayState } from "../store/slices/gatewaySlice";
import { loadOnboardingFromStorage } from "../store/slices/onboardingSlice";
import type { GatewayState } from "../../../src/main/types";
import { isBootstrapPath, routes } from "./routes";
import { OptimisticSessionProvider, OptimisticSessionSync } from "./optimisticSessionContext";

function ChatRoute({ state }: { state: Extract<GatewayState, { kind: "ready" }> }) {
  const [searchParams] = useSearchParams();
  const session = searchParams.get("session");
  if (session?.trim()) {
    return <ChatPage state={state} />;
  }
  return <StartChatPage state={state} />;
}

function SidebarLayout({ state }: { state: Extract<GatewayState, { kind: "ready" }> }) {
  return (
    <GatewayRpcProvider url={state.url} token={state.token}>
      <OptimisticSessionProvider>
        <OptimisticSessionSync />
        <div className="UiAppShell">
          <div className="UiAppPage UiChatLayout">
            <Sidebar />
            <div className="UiChatLayoutMain">
              <Outlet />
            </div>
          </div>
        </div>
      </OptimisticSessionProvider>
    </GatewayRpcProvider>
  );
}

function Topbar() {
  const brandIconUrl = React.useMemo(() => {
    // Renderer lives at renderer/dist/index.html; the app's assets are at ../../assets/
    return new URL("../../assets/icon-simple-splash.png", document.baseURI).toString();
  }, []);

  return (
    <div className="UiAppTopbar">
      <Brand text="ATOMIC BOT" iconSrc={brandIconUrl} iconAlt="" />

      <div className="UiAppTopbarActions">
        <NavLink to={routes.settings + "/other"} className="UiTab">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path
              d="M7.46122 6.25282C7.29957 6.09668 7.08305 6.01029 6.85831 6.01224C6.63357 6.01419 6.41859 6.10434 6.25967 6.26326C6.10074 6.42218 6.0106 6.63716 6.00865 6.8619C6.00669 7.08664 6.09309 7.30316 6.24922 7.46482L10.7861 12.0017L6.24922 16.5385C6.16736 16.6176 6.10206 16.7122 6.05714 16.8168C6.01222 16.9213 5.98857 17.0338 5.98758 17.1476C5.98659 17.2614 6.00828 17.3743 6.05138 17.4796C6.09447 17.585 6.15812 17.6807 6.2386 17.7612C6.31908 17.8416 6.41478 17.9053 6.52012 17.9484C6.62546 17.9915 6.73833 18.0132 6.85214 18.0122C6.96595 18.0112 7.07842 17.9875 7.183 17.9426C7.28757 17.8977 7.38216 17.8324 7.46122 17.7505L11.9981 13.2137L16.5349 17.7505C16.6966 17.9067 16.9131 17.9931 17.1379 17.9911C17.3626 17.9892 17.5776 17.899 17.7365 17.7401C17.8954 17.5812 17.9856 17.3662 17.9875 17.1414C17.9895 16.9167 17.9031 16.7002 17.7469 16.5385L13.2101 12.0017L17.7469 7.46482C17.9031 7.30316 17.9895 7.08664 17.9875 6.8619C17.9856 6.63716 17.8954 6.42218 17.7365 6.26326C17.5776 6.10434 17.3626 6.01419 17.1379 6.01224C16.9131 6.01029 16.6966 6.09668 16.5349 6.25282L11.9981 10.7897L7.46122 6.25282Z"
              fill="white"
              fill-opacity="0.6"
            />
          </svg>
        </NavLink>
      </div>
    </div>
  );
}

function ErrorScreen({ state }: { state: Extract<GatewayState, { kind: "failed" }> }) {
  return (
    <div className="Centered">
      <div className="Card">
        <div className="CardTitle">OpenClaw Gateway failed to start</div>
        <div className="CardSubtitle">
          The Gateway process did not become available. Open the logs to see the root cause.
        </div>
        <div className="Meta">
          <div className="Pill">port: {state.port}</div>
          <div className="Pill">logs: {state.logsDir}</div>
        </div>
        <pre>{state.details || "No details."}</pre>
      </div>
    </div>
  );
}

function LegacyScreen({ state }: { state: Extract<GatewayState, { kind: "ready" }> }) {
  const legacyUrl = React.useMemo(() => {
    const base = state.url.endsWith("/") ? state.url : `${state.url}/`;
    const token = encodeURIComponent(state.token);
    // When the gateway Control UI basePath is empty (default), the legacy UI lives at
    // /overview, /chat, ... and /ui/* is explicitly 404'd by the gateway.
    // The legacy UI supports ?token=... (see ui navigation tests).
    // The desktop app embeds the Control UI in an iframe; ask the gateway to emit
    // an embedding-friendly `frame-ancestors` policy for this request.
    return `${base}overview?token=${token}&embed=1`;
  }, [state.url, state.token]);
  return (
    <div className="IframeWrap">
      <iframe title="OpenClaw Control UI" src={legacyUrl} />
    </div>
  );
}

function ReadyRoutes({ state }: { state: Extract<GatewayState, { kind: "ready" }> }) {
  return (
    <GatewayRpcProvider url={state.url} token={state.token}>
      <Routes>
        <Route path={routes.loading} element={<LoadingScreen state={state} />} />
        <Route path={routes.error} element={<Navigate to={routes.chat} replace />} />
        <Route path={`${routes.welcome}/*`} element={<WelcomePage state={state} />} />
        <Route path={routes.legacy} element={<LegacyScreen state={state} />} />
        <Route path="*" element={<Navigate to={routes.chat} replace />} />
      </Routes>
    </GatewayRpcProvider>
  );
}

export function App() {
  const dispatch = useAppDispatch();
  const state = useAppSelector((s) => s.gateway.state);
  const onboarded = useAppSelector((s) => s.onboarding.onboarded);
  const navigate = useNavigate();
  const location = useLocation();
  const didAutoNavRef = React.useRef(false);
  const [consent, setConsent] = React.useState<"unknown" | "required" | "accepted">("unknown");

  React.useEffect(() => {
    void dispatch(initGatewayState());
    void dispatch(loadOnboardingFromStorage());
  }, [dispatch]);

  React.useEffect(() => {
    const api = window.openclawDesktop as ConsentDesktopApi | undefined;
    let alive = true;
    void (async () => {
      try {
        const info = await api?.getConsentInfo();
        const accepted = info?.accepted === true;
        if (alive) {
          setConsent(accepted ? "accepted" : "required");
        }
      } catch {
        if (alive) {
          setConsent("required");
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    if (consent !== "accepted") {
      return;
    }
    if (!state) {
      return;
    }
    if (state.kind === "ready") {
      // Only auto-navigate once (first time we become ready), and only if the user
      // is still on the bootstrap screens. Otherwise, user navigation would be
      // overridden on every render.
      if (didAutoNavRef.current) {
        return;
      }
      const path = location.pathname || "/";
      const isBootstrap = isBootstrapPath(path);
      if (isBootstrap) {
        didAutoNavRef.current = true;
        void navigate(onboarded ? routes.chat : routes.welcome, { replace: true });
      }
      return;
    }
    if (state.kind === "failed") {
      void navigate(routes.error, { replace: true });
    }
    if (state.kind === "starting") {
      void navigate(routes.loading, { replace: true });
    }
  }, [state, consent, onboarded, navigate, location.pathname]);

  if (consent !== "accepted") {
    // While consent is loading, keep showing the splash to avoid a flash of unstyled content.
    if (consent === "unknown") {
      return <LoadingScreen state={null} />;
    }
    return (
      <ConsentScreen
        onAccepted={() => {
          setConsent("accepted");
          // Avoid getting stuck on /loading when gateway is already ready.
          if (state?.kind === "ready") {
            void navigate(onboarded ? routes.chat : routes.welcome, { replace: true });
            return;
          }
          if (state?.kind === "failed") {
            void navigate(routes.error, { replace: true });
            return;
          }
          void navigate(routes.loading, { replace: true });
        }}
      />
    );
  }

  // After consent is accepted, route fullscreen pages explicitly so nested routing works correctly
  // (especially onboarding, which relies on an index route).
  if (state?.kind === "ready") {
    return (
      <Routes>
        <Route path={routes.loading} element={<LoadingScreen state={state} />} />
        <Route
          path={`${routes.welcome}/*`}
          element={
            <GatewayRpcProvider url={state.url} token={state.token}>
              <WelcomePage state={state} />
            </GatewayRpcProvider>
          }
        />
        <Route path="/" element={<SidebarLayout state={state} />}>
          <Route index element={<Navigate to={routes.chat} replace />} />
          <Route path="chat" element={<ChatRoute state={state} />} />
          <Route path={routes.settings} element={<SettingsPage state={state} />}>
            <Route index element={<SettingsIndexRedirect />} />
            <Route path="ai-models" element={<SettingsTab tab="model" />} />
            <Route path="ai-providers" element={<SettingsTab tab="providers" />} />
            <Route path="messengers" element={<SettingsTab tab="connectors" />} />
            <Route path="skills" element={<SettingsTab tab="skills-integrations" />} />
            <Route path="other" element={<SettingsTab tab="other" />} />
          </Route>
        </Route>
        <Route
          path="*"
          element={
            <div className="UiAppShell">
              <Topbar />
              <div className="UiAppPage">
                <ReadyRoutes state={state} />
              </div>
            </div>
          }
        />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path={routes.loading} element={<LoadingScreen state={state ?? null} />} />
      <Route
        path={routes.error}
        element={
          state?.kind === "failed" ? (
            <ErrorScreen state={state} />
          ) : (
            <Navigate to={routes.loading} replace />
          )
        }
      />
      <Route path={`${routes.welcome}/*`} element={<Navigate to={routes.loading} replace />} />
      <Route path="*" element={<Navigate to={routes.loading} replace />} />
    </Routes>
  );
}
