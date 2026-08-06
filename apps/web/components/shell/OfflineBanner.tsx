"use client";

import { useEffect, useState } from "react";

type Props = {
  message: string;
};

export function OfflineBanner({ message }: Props) {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    function sync() {
      setOffline(!navigator.onLine);
    }
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="status-banner" role="status" aria-live="polite">
      {message || "You are offline. Changes may not save until you reconnect."}
    </div>
  );
}
