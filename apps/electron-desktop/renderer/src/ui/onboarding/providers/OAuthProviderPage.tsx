import React, { useCallback, useEffect, useRef, useState } from "react";

import { getDesktopApiOrNull } from "@ipc/desktopApi";
import ob from "./OnboardingProviders.module.css";
import { GlassCard, HeroPageLayout, PrimaryButton } from "@shared/kit";
import { MODEL_PROVIDER_BY_ID, type ModelProvider } from "@shared/models/providers";

type OAuthState = "idle" | "waiting" | "signing-in" | "saving" | "error";

export function OAuthProviderPage(props: {
  provider: ModelProvider;
  onSuccess: (profileId: string) => void;
  onBack: () => void;
}) {
  const meta = MODEL_PROVIDER_BY_ID[props.provider];
  const [state, setState] = useState<OAuthState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const abortRef = useRef(false);

  const totalSteps = 5;
  const activeStep = 1;

  const startOAuth = useCallback(async () => {
    const desktopApi = getDesktopApiOrNull();
    if (!desktopApi) {
      setError("Desktop API is not available.");
      setState("error");
      return;
    }

    abortRef.current = false;
    setState("waiting");
    setError(null);
    setProgressMsg(null);

    // Listen for progress events from the main process.
    const unsub = desktopApi.onOAuthProgress((payload) => {
      if (payload.provider === props.provider) {
        setState("signing-in");
        setProgressMsg(payload.message);
      }
    });

    try {
      // The main process opens the browser and handles the full OAuth flow.
      const result = await desktopApi.oauthLogin(props.provider);
      unsub();

      if (abortRef.current) {
        return;
      }

      if (result?.ok && result.profileId) {
        setState("saving");
        props.onSuccess(result.profileId);
      } else {
        setState("error");
        setError("OAuth flow did not return a valid profile.");
      }
    } catch (err: unknown) {
      unsub();
      if (abortRef.current) {
        return;
      }
      setState("error");
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : String(err);
      setError(msg);
    }
  }, [props.provider, props.onSuccess]);

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      abortRef.current = true;
    };
  }, []);

  const isBusy = state === "waiting" || state === "signing-in" || state === "saving";

  const statusText = (() => {
    switch (state) {
      case "waiting":
        return progressMsg ?? "Starting OAuth flow\u2026";
      case "signing-in":
        return progressMsg ?? "Waiting for sign-in in browser\u2026";
      case "saving":
        return "Saving credentials\u2026";
      default:
        return null;
    }
  })();

  return (
    <HeroPageLayout variant="compact" align="center" aria-label="OAuth provider setup">
      <GlassCard className={`${ob.UiApiKeyCard} UiGlassCardOnboarding`}>
        <div className={ob.UiOnboardingDots} aria-label="Onboarding progress">
          {Array.from({ length: totalSteps }).map((_, idx) => (
            <span
              // eslint-disable-next-line react/no-array-index-key
              key={idx}
              className={`${ob.UiOnboardingDot} ${idx === activeStep ? ob["UiOnboardingDot--active"] : ""}`}
              aria-hidden="true"
            />
          ))}
        </div>

        <div className={ob.UiApiKeyTitle}>Sign in to {meta.name}</div>
        <div className={ob.UiApiKeySubtitle}>
          {meta.helpText}{" "}
          {meta.helpUrl ? (
            <a
              href={meta.helpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="UiLink"
              onClick={(e) => {
                e.preventDefault();
                const url = meta.helpUrl;
                if (url) {
                  void getDesktopApiOrNull()?.openExternal(url);
                }
              }}
            >
              Learn more ↗
            </a>
          ) : null}
        </div>

        {statusText && <div className={ob.UiApiKeySubtitle}>{statusText}</div>}

        {error && (
          <div style={{ color: "var(--color-danger, #f44)", fontSize: 14, marginBottom: 8 }}>
            {error}
          </div>
        )}

        <div className={ob.UiApiKeySpacer} aria-hidden="true" />

        <div className={ob.UiApiKeyButtonRow}>
          <button className="UiTextButton" disabled={isBusy} onClick={props.onBack} type="button">
            Back
          </button>
          <PrimaryButton
            size={"sm"}
            disabled={isBusy}
            loading={isBusy}
            onClick={() => void startOAuth()}
          >
            {state === "error" ? "Retry" : isBusy ? "Signing in\u2026" : "Sign in with ChatGPT"}
          </PrimaryButton>
        </div>
      </GlassCard>
    </HeroPageLayout>
  );
}
