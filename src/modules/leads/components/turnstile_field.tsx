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
    responseField: boolean;
    responseFieldName: string;
    refreshExpired: "auto";
    refreshTimeout: "auto";
    callback(): void;
  }): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};

function turnstileApi() {
  return (window as Window & { turnstile?: TurnstileApi }).turnstile;
}

export function TurnstileField({ configuration, idempotencyKey: initialIdempotencyKey, resetId }: {
  configuration: TurnstileWidgetConfiguration;
  idempotencyKey: string;
  resetId?: string;
}) {
  const [idempotencyKey, setIdempotencyKey] = useState(initialIdempotencyKey);
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string>(undefined);
  const renderWidget = useCallback(() => {
    if (configuration.mode !== "cloudflare" || !container.current || widgetId.current) return;
    widgetId.current = turnstileApi()?.render(container.current, {
      sitekey: configuration.siteKey,
      action: "submit_lead",
      responseField: true,
      responseFieldName: "turnstileToken",
      refreshExpired: "auto",
      refreshTimeout: "auto",
      callback: () => setIdempotencyKey(crypto.randomUUID()),
    });
  }, [configuration]);

  useEffect(() => {
    renderWidget();
    return () => {
      if (widgetId.current) turnstileApi()?.remove(widgetId.current);
      widgetId.current = undefined;
    };
  }, [renderWidget]);

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
    <input type="hidden" name="turnstileIdempotencyKey" value={idempotencyKey} />
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onReady={renderWidget} />
    <div ref={container} className="turnstile-container" />
  </>;
}
