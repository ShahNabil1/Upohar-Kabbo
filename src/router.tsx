import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, gcTime: 5 * 60_000, refetchOnWindowFocus: false },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadDelay: 20,
    // Keep hover/touch-preloaded data usable so the actual click is instant.
    defaultPreloadStaleTime: 60_000,
    defaultStaleTime: 30_000,
    defaultGcTime: 5 * 60_000,
    // Never freeze on the old page silently: show feedback fast.
    defaultPendingMs: 120,
    defaultPendingMinMs: 0,
  });

  return router;
};


