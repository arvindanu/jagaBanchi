"use client";

import { useEffect } from "react";

/** Registers the production service worker and checks for deployments regularly. */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    let intervalId: number | undefined;
    let registration: ServiceWorkerRegistration | undefined;
    let hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;

    const onControllerChange = () => {
      // Do not reload on the very first installation; reload only when an
      // already-controlled page receives a newly activated worker.
      if (hadController && !reloading) {
        reloading = true;
        window.location.reload();
      }
      hadController = true;
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((result) => {
        registration = result;
        // Ask the browser to look for a newly deployed worker once a minute
        // while JAGA is open. Browsers also perform their own update checks.
        void registration.update();
        intervalId = window.setInterval(() => {
          if (document.visibilityState === "visible") void registration?.update();
        }, 60_000);
      })
      .catch((error) => console.error("JAGA service worker registration failed:", error));

    const onVisible = () => {
      if (document.visibilityState === "visible") void registration?.update();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (intervalId) window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
