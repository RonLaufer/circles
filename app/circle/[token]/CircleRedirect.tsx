"use client";

import { useEffect } from "react";

export function CircleRedirect({ token }: { token: string }) {
  useEffect(() => {
    window.location.replace(`/?join=${encodeURIComponent(token)}`);
  }, [token]);

  return (
    <main className="centered-page">
      <div className="loading-panel" aria-live="polite">
        <span className="spinner" />
        <p>פותחים את המעגל...</p>
      </div>
    </main>
  );
}
