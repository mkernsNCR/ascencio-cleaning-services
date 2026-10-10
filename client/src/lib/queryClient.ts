import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        staleTime: 30_000,
        // Retry transient network failures once; never retry client errors.
        retry: (count, error) => error instanceof ApiError && error.isNetwork && count < 1,
      },
      mutations: { retry: false },
    },
  });
}
