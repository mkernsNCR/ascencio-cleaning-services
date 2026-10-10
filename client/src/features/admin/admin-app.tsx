// Authenticated staff operations dashboard, mounted by App.tsx at <Route path="/admin" nest>.
// Routes below are relative to /admin.
import { useEffect, useState, type FormEvent } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut, Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, LiveRegion } from "@/components/forms/field";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AdminSessionProvider, SESSION_KEY, errorMessage, fetchSession, useAdmin } from "./admin-api";
import type { SessionResponse } from "./types";
import { ErrorState, Loading, Notice } from "./ui";
import OverviewPage from "./overview-page";
import RequestsPage from "./requests-page";
import SchedulePage from "./schedule-page";
import BookingDetailPage from "./booking-detail-page";
import AttentionPage from "./attention-page";
import ReviewsPage from "./reviews-page";
import InquiriesPage from "./inquiries-page";
import IntegrationsPage from "./integrations-page";
import SettingsPage from "./settings-page";

export default function AdminApp() {
  const session = useQuery({ queryKey: SESSION_KEY, queryFn: fetchSession, staleTime: Infinity, retry: false });

  useEffect(() => {
    const previous = document.title;
    document.title = "Operations · Ascencio Cleaning Services";
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const created = !robots;
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.appendChild(robots);
    }
    const prevRobots = robots.content;
    robots.content = "noindex, nofollow";
    return () => {
      document.title = previous;
      if (created) robots?.remove();
      else if (robots) robots.content = prevRobots;
    };
  }, []);

  if (session.isPending) {
    return <div className="container-page"><Loading label="Checking your session…" /></div>;
  }
  if (session.isError) {
    return (
      <div className="container-page py-16">
        <ErrorState error={session.error} onRetry={() => session.refetch()} label="Could not check your staff session." />
      </div>
    );
  }
  if (!session.data) return <LoginScreen />;
  return (
    <AdminSessionProvider session={session.data}>
      <Shell />
    </AdminSessionProvider>
  );
}

function LoginScreen() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await api<SessionResponse>("/api/admin/login", { body: { email: email.trim(), password } });
      qc.setQueryData(SESSION_KEY, res);
    } catch (err) {
      setError(errorMessage(err, {
        invalid_credentials: "That email and password don't match an active staff account.",
        validation_error: "Enter a valid email address and your password.",
      }));
      setPending(false);
    }
  };

  return (
    <main id="main" tabIndex={-1} className="flex min-h-screen items-center justify-center bg-background px-4 py-12 outline-none">
      <div className="w-full max-w-md rounded-xl border bg-surface p-8 shadow-lift">
        <Logo />
        <h1 className="mt-6 text-display-md font-semibold">Staff sign in</h1>
        <p className="mt-1 text-muted-foreground">Operations dashboard for bookings, schedule, and integrations.</p>
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
          <Field label="Email">
            <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password">
            <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <LiveRegion assertive>{error && <Notice tone="danger">{error}</Notice>}</LiveRegion>
          <Button type="submit" size="lg" disabled={pending || !email || !password}>
            {pending && <Loader2 aria-hidden="true" className="animate-spin" />}
            Sign in
          </Button>
        </form>
      </div>
    </main>
  );
}

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/requests", label: "Requests" },
  { href: "/schedule", label: "Schedule" },
  { href: "/attention", label: "Attention" },
  { href: "/reviews", label: "Reviews" },
  { href: "/inquiries", label: "Inquiries" },
  { href: "/integrations", label: "Integrations" },
  { href: "/settings", label: "Settings" },
] as const;

const GOOGLE_NOTICES: Record<string, { tone: "success" | "warning" | "danger"; text: string }> = {
  connected: { tone: "success", text: "Google Calendar connected. A sync has been queued; check Integrations to assign crew calendars." },
  denied: { tone: "warning", text: "Google Calendar was not connected because access was denied on the Google consent screen." },
  state_error: { tone: "danger", text: "Google sign-in expired or could not be verified. Start the connection again from Integrations." },
  exchange_error: { tone: "danger", text: "Google accepted the sign-in but the server could not finish connecting. Try again; if it repeats, check the server logs." },
};

function useGoogleRedirectNotice() {
  const [notice, setNotice] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("google");
  });
  useEffect(() => {
    if (!notice) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("google");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [notice]);
  return [notice ? GOOGLE_NOTICES[notice] ?? null : null, () => setNotice(null)] as const;
}

function isActive(location: string, href: string) {
  if (href === "/") return location === "/" || location === "";
  if (href === "/requests" || href === "/schedule") return location.startsWith(href) || (href === "/schedule" && location.startsWith("/bookings"));
  return location.startsWith(href);
}

function Shell() {
  const { staff, logout } = useAdmin();
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [googleNotice, dismissGoogle] = useGoogleRedirectNotice();

  useEffect(() => setMenuOpen(false), [location]);

  const navLinks = (
    <ul className="flex flex-col gap-1 lg:flex-row lg:flex-wrap">
      {NAV.map((item) => {
        const active = isActive(location, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold transition-colors",
                active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-primary-soft",
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="min-h-screen bg-background">
      <a href="#main" className="sr-only-focusable absolute left-2 top-2 z-50 rounded bg-primary px-3 py-2 text-primary-foreground">Skip to content</a>
      <header className="border-b bg-surface">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="Operations overview"><Logo /></Link>
            <span className="hidden border-l pl-3 font-display text-lg font-semibold sm:inline">Operations</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground md:inline">
              Signed in as <span className="font-semibold text-foreground">{staff.name}</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={loggingOut}
              onClick={async () => {
                setLoggingOut(true);
                await logout().catch(() => undefined);
              }}
            >
              <LogOut aria-hidden="true" /> Sign out
            </Button>
            <Button variant="outline" size="icon" className="lg:hidden" aria-expanded={menuOpen} aria-controls="admin-nav" onClick={() => setMenuOpen((v) => !v)}>
              {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
              <span className="sr-only">{menuOpen ? "Close navigation" : "Open navigation"}</span>
            </Button>
          </div>
        </div>
        <nav id="admin-nav" aria-label="Dashboard" className={cn("mx-auto w-full max-w-7xl px-4 pb-3 sm:px-6", menuOpen ? "block" : "hidden lg:block")}>
          {navLinks}
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 py-8 outline-none sm:px-6">
        {googleNotice && (
          <LiveRegion className="mb-6">
            <div className="flex items-start gap-2">
              <Notice tone={googleNotice.tone} className="flex-1">{googleNotice.text}</Notice>
              <Button variant="ghost" size="icon" onClick={dismissGoogle}>
                <X aria-hidden="true" />
                <span className="sr-only">Dismiss Google Calendar notice</span>
              </Button>
            </div>
          </LiveRegion>
        )}
        <Switch>
          <Route path="/" component={OverviewPage} />
          <Route path="/requests" component={RequestsPage} />
          <Route path="/schedule" component={SchedulePage} />
          <Route path="/bookings/:id">{(params) => <BookingDetailPage id={params.id} />}</Route>
          <Route path="/attention" component={AttentionPage} />
          <Route path="/reviews" component={ReviewsPage} />
          <Route path="/inquiries" component={InquiriesPage} />
          <Route path="/integrations" component={IntegrationsPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route>
            <Notice tone="warning" title="Page not found">
              <Link href="/" className="font-semibold text-primary underline">Back to the overview</Link>
            </Notice>
          </Route>
        </Switch>
      </main>
    </div>
  );
}
