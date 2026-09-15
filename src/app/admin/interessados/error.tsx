"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <section><p role="alert">Não foi possível carregar os interessados.</p><button onClick={reset}>Tentar novamente</button></section>;
}
