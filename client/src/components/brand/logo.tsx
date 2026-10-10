import { cn } from "@/lib/utils";

/**
 * Interim wordmark: a leaf-and-window monogram. Replace with the approved logo when supplied.
 */
export function Logo({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg aria-hidden="true" viewBox="0 0 40 40" className="h-9 w-9 shrink-0">
        <rect width="40" height="40" rx="10" fill={inverted ? "#F7F6F0" : "#214F42"} />
        <path d="M12 30V17a8 8 0 0 1 16 0v13" fill="none" stroke={inverted ? "#214F42" : "#F7F6F0"} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M20 29c0-6 3-9.5 7.5-10.5C27 23.5 24.5 28 20 29Z" fill="#D8B66A" />
        <path d="M20 29c0-4-1.6-6.6-5-7.6.3 3.6 2 6.6 5 7.6Z" fill="#D8B66A" opacity=".7" />
      </svg>
      <span className="leading-none">
        <span className={cn("block font-display text-lg font-semibold tracking-tight", inverted ? "text-background" : "text-foreground")}>Ascencio</span>
        <span className={cn("block text-[0.7rem] font-semibold uppercase tracking-[0.16em]", inverted ? "text-background/80" : "text-muted-foreground")}>Cleaning Services</span>
      </span>
    </span>
  );
}
