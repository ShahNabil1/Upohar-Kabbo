import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

/** Thin top progress bar shown while a navigation is in flight. */
export function RoutePending() {
  const [mounted, setMounted] = useState(false);
  const isLoading = useRouterState({ select: (s) => s.status === "pending" || s.isLoading });

  useEffect(() => setMounted(true), []);

  if (!mounted || !isLoading) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[200]">
      <div className="h-[3px] w-full overflow-hidden bg-primary/15">
        <div className="route-progress-bar h-full w-1/3 rounded-full bg-primary" />
      </div>
    </div>
  );
}
