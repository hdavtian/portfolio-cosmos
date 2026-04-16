import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { useState, type PropsWithChildren } from "react";
import { ThemeProvider } from "../../theme/ThemeProvider";

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(() =>
    new QueryClient({
      defaultOptions: {
        queries: {
          retry: 1,
          refetchOnWindowFocus: false,
        },
      },
    }),
  );

  const [persister] = useState(() =>
    createSyncStoragePersister({
      storage: window.localStorage,
      key: "fast-experience:query-cache:v1",
    }),
  );

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24,
      }}
    >
      <ThemeProvider>{children}</ThemeProvider>
    </PersistQueryClientProvider>
  );
}
