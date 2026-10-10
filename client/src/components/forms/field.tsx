import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: ReactNode;
  /** Shown under the label; linked with aria-describedby. */
  hint?: ReactNode;
  error?: string | null;
  optionalLabel?: string;
  className?: string;
  /** A single form control; receives id, aria-invalid, and aria-describedby. */
  children: ReactElement;
}

/** Accessible label + hint + error wrapper. Errors are announced via the control's description. */
export function Field({ label, hint, error, optionalLabel, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })
    : children;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-semibold text-foreground">
        {label}
        {optionalLabel && <span className="ml-1 font-normal text-muted-foreground">({optionalLabel})</span>}
      </label>
      {hint && <p id={hintId} className="text-sm text-muted-foreground">{hint}</p>}
      {control}
      {error && (
        <p id={errorId} className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Polite live region for status changes (loading → results, submission outcomes). */
export function LiveRegion({ children, className, assertive = false }: { children: ReactNode; className?: string; assertive?: boolean }) {
  return (
    <div role={assertive ? "alert" : "status"} aria-live={assertive ? "assertive" : "polite"} className={className}>
      {children}
    </div>
  );
}
