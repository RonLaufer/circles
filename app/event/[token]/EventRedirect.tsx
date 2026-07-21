"use client";

import { useEffect } from "react";

export function EventRedirect({ token }: { token: string }) {
  useEffect(() => {
    window.location.replace(`/?event=${encodeURIComponent(token)}`);
  }, [token]);

  return (
    <main className="centered-page">
      <div className="loading-panel" aria-live="polite">
        <span className="spinner" />
        <p>פותחים את האירוע...</p>
      </div>
    </main>
  );
}
