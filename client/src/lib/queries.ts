import { useQuery } from "@tanstack/react-query";
import type { PublicReviewSummary } from "@shared/api";
import type { BusinessSettings, ServiceDefinition } from "@shared/domain";
import { api } from "./api";

export interface PublicConfig {
  bookingEnabled: boolean;
  calendarConnected: boolean;
  timezone: string;
  weeklyHours: BusinessSettings["weeklyHours"];
  responsePromise: BusinessSettings["responsePromise"];
  settingsApproved: boolean;
  pricesApproved: boolean;
  cancellationCutoffHours: number;
  rescheduleCutoffHours: number;
}

export interface PublicService extends ServiceDefinition {
  fromPriceCents: number | null;
  baseDurationMinutes: number | null;
}

export function usePublicConfig() {
  return useQuery({ queryKey: ["public-config"], queryFn: () => api<PublicConfig>("/api/public-config"), staleTime: 5 * 60_000 });
}

export function useServices() {
  return useQuery({
    queryKey: ["services"],
    queryFn: () => api<{ pricesApproved: boolean; services: PublicService[] }>("/api/services"),
    staleTime: 5 * 60_000,
  });
}

export function useReviews() {
  return useQuery({ queryKey: ["reviews"], queryFn: () => api<PublicReviewSummary>("/api/reviews"), staleTime: 5 * 60_000 });
}
