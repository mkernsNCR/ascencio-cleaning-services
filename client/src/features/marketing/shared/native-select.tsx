import { forwardRef, type ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Styled native <select>. Native selects are fully keyboard and screen-reader accessible, work in
 * prerendered HTML, and accept the id/aria props injected by `Field`.
 */
export const NativeSelect = forwardRef<HTMLSelectElement, ComponentProps<"select">>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        "flex min-h-11 w-full appearance-none rounded-md border-2 border-input bg-surface py-2 pl-3 pr-10 text-base text-foreground focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring aria-[invalid=true]:border-destructive disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
  </div>
));
NativeSelect.displayName = "NativeSelect";
