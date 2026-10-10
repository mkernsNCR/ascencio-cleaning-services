// Small presentational building blocks shared by the dashboard views.
import { forwardRef, useState, type ComponentProps, type ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LiveRegion } from "@/components/forms/field";
import { cn } from "@/lib/utils";
import { errorMessage } from "./admin-api";
import type { Tone } from "./admin-format";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-muted text-foreground border-border",
  info: "bg-primary-soft text-primary border-primary/20",
  success: "bg-success-soft text-success border-success/25",
  warning: "bg-warning-soft text-warning border-warning/25",
  danger: "bg-destructive-soft text-destructive border-destructive/25",
};

const toneMarker: Record<Tone, string> = {
  neutral: "○",
  info: "●",
  success: "✓",
  warning: "!",
  danger: "×",
};

/** Status label: text carries the meaning; color and the marker glyph are supplementary. */
export function Pill({ tone = "neutral", children, title, className }: { tone?: Tone; children: ReactNode; title?: string; className?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold", toneClasses[tone], className)}>
      <span aria-hidden="true">{toneMarker[tone]}</span>
      {children}
    </span>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        <h1 className="text-display-md font-semibold">{title}</h1>
        {description && <div className="mt-1 text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, description, actions, children, className, as: As = "section" }: {
  title?: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; as?: "section" | "div" | "article" | "li";
}) {
  return (
    <As className={cn("rounded-xl border bg-surface p-5 shadow-soft", className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="font-sans text-lg font-semibold">{title}</h2>}
            {description && <div className="mt-0.5 text-sm text-muted-foreground">{description}</div>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </As>
  );
}

const noticeIcon: Record<Tone, typeof Info> = { neutral: Info, info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle };

export function Notice({ tone = "info", title, children, className, role }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string; role?: "alert" | "status" }) {
  const Icon = noticeIcon[tone];
  return (
    <div role={role} className={cn("flex gap-3 rounded-lg border p-4 text-sm", toneClasses[tone], className)}>
      <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 text-foreground">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-1")}>{children}</div>}
      </div>
    </div>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <LiveRegion className="flex items-center gap-2 py-8 text-muted-foreground">
      <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" />
      {label}
    </LiveRegion>
  );
}

export function ErrorState({ error, onRetry, label = "Could not load this data." }: { error: unknown; onRetry?: () => void; label?: string }) {
  return (
    <Notice tone="danger" role="alert" title={label}>
      <p>{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Notice>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed bg-surface-sunken/50 px-4 py-8 text-center text-muted-foreground">{children}</p>;
}

/** Renders loading / error-with-retry / content for a React Query result. */
export function QueryState<T>({ query, children, loadingLabel }: { query: UseQueryResult<T>; children: (data: T) => ReactNode; loadingLabel?: string }) {
  if (query.isPending) return <Loading label={loadingLabel} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  return <>{children(query.data)}</>;
}

export function DataList({ items, className }: { items: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 sm:grid-cols-[minmax(9rem,auto)_1fr]", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-sm font-semibold text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export const NativeSelect = forwardRef<HTMLSelectElement, ComponentProps<"select">>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "flex min-h-11 w-full rounded-md border-2 border-input bg-surface px-3 py-2 text-base text-foreground focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring aria-[invalid=true]:border-destructive disabled:opacity-60",
      className,
    )}
    {...props}
  />
));
NativeSelect.displayName = "NativeSelect";

/** Table styles kept local so the semantic <table>/<th scope> markup stays explicit in each view. */
export const tableCls = {
  wrap: "overflow-x-auto rounded-xl border bg-surface shadow-soft",
  table: "w-full min-w-[720px] text-left text-sm",
  th: "border-b bg-surface-sunken px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
  td: "border-b px-3 py-3 align-top",
};

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /** Should throw on failure; the error is shown inside the dialog. Return value closes the dialog when true/undefined. */
  onConfirm: () => Promise<boolean | void>;
  children?: ReactNode;
  errorOverrides?: Record<string, string>;
}

/** Confirmation dialog that stays open while the action runs and shows failures inline. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, destructive, onConfirm, children, errorOverrides }: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const change = (next: boolean) => {
    if (pending) return;
    if (!next) setError(null);
    onOpenChange(next);
  };
  const run = async () => {
    setPending(true);
    setError(null);
    try {
      const close = await onConfirm();
      if (close !== false) onOpenChange(false);
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="bg-surface">
        <DialogHeader>
          <DialogTitle className="font-sans">{title}</DialogTitle>
          {description && <DialogDescription asChild><div className="text-sm text-muted-foreground">{description}</div></DialogDescription>}
        </DialogHeader>
        {children}
        {error != null && (
          <Notice tone="danger" role="alert">
            {errorMessage(error, errorOverrides)}
          </Notice>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => change(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={run} disabled={pending}>
            {pending && <Loader2 aria-hidden="true" className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
