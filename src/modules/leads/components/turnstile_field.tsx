"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { localTurnstileToken } from "../domain/turnstile_contract";

type TurnstileWidgetConfiguration =
  | { mode: "local" }
  | { mode: "cloudflare"; siteKey: string };

type TurnstileApi = {
  render(container: HTMLElement, options: {
    sitekey: string;
    action: string;
    "response-field": false;
    "refresh-expired": "auto";
    "refresh-timeout": "auto";
    callback(token: string): void;
    "expired-callback"(): void;
    "error-callback"(): void;
    "timeout-callback"(): void;
  }): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};

function turnstileApi() {
  return (window as Window & { turnstile?: TurnstileApi }).turnstile;
}

export function TurnstileField({ configuration, idempotencyKey: initialIdempotencyKey, resetId, onReadyChange }: {
  configuration: TurnstileWidgetConfiguration;
  idempotencyKey: string;
  resetId?: string;
  onReadyChange?: (ready: boolean) => void;
}) {
  const [idempotencyKey, setIdempotencyKey] = useState(initialIdempotencyKey);
  const [token, setToken] = useState("");
  const [previousResetId, setPreviousResetId] = useState(resetId);
  // Clear during render so the DOM is empty before the reset effect calls the SDK.
  if (resetId && previousResetId !== resetId) {
    setPreviousResetId(resetId);
    setToken("");
  }
  const lastDeliveredToken = useRef("");
  const mode = configuration.mode;
  const siteKey = configuration.mode === "cloudflare" ? configuration.siteKey : undefined;
  const clearToken = useCallback(() => setToken(""), []);
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string>(undefined);
  const renderWidget = useCallback(() => {
    if (mode !== "cloudflare" || !siteKey || !container.current || widgetId.current) return;
    widgetId.current = turnstileApi()?.render(container.current, {
      sitekey: siteKey,
      action: "submit_lead",
      "response-field": false,
      "refresh-expired": "auto",
      "refresh-timeout": "auto",
      callback: (newToken) => {
        if (!newToken || newToken === lastDeliveredToken.current) return;
        lastDeliveredToken.current = newToken;
        setToken(newToken);
        setIdempotencyKey(crypto.randomUUID());
      },
      "expired-callback": clearToken,
      "error-callback": clearToken,
      "timeout-callback": clearToken,
    });
  }, [mode, siteKey, clearToken]);

  useEffect(() => {
    renderWidget();
    return () => {
      if (widgetId.current) turnstileApi()?.remove(widgetId.current);
      widgetId.current = undefined;
    };
  }, [renderWidget]);

  useEffect(() => {
    onReadyChange?.(mode === "local" || token.length > 0);
  }, [mode, token, onReadyChange]);

  useEffect(() => {
    if (resetId && widgetId.current) turnstileApi()?.reset(widgetId.current);
  }, [resetId]);

  if (configuration.mode === "local") {
    return <>
      <input type="hidden" name="turnstileToken" value={localTurnstileToken} />
      <input type="hidden" name="turnstileIdempotencyKey" value={idempotencyKey} />
    </>;
  }
  return <>
    <input type="hidden" name="turnstileToken" value={token} />
    <input type="hidden" name="turnstileIdempotencyKey" value={idempotencyKey} />
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={renderWidget} />
    <div ref={container} className="turnstile-container" />
  </>;
}
