import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, Phone, X } from "lucide-react";
import { BUSINESS } from "@shared/business";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { useLocale, useMessages } from "@/i18n";
import { commonMessages } from "@/i18n/common";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export function LocaleSwitch({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  const t = useMessages(commonMessages);
  const next = locale === "en" ? "es" : "en";
  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      lang={next}
      aria-label={t.language.switchToLabel}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-foreground hover:bg-muted",
        className,
      )}
    >
      <span aria-hidden="true" className="rounded border border-input px-1.5 py-0.5 text-xs">{next.toUpperCase()}</span>
      {t.language.switchTo}
    </button>
  );
}

export function SiteHeader() {
  const t = useMessages(commonMessages);
  const { locale } = useLocale();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const links = [
    { href: "/services", label: t.nav.services },
    { href: "/commercial", label: t.nav.commercial },
    { href: "/our-work", label: t.nav.ourWork },
    { href: "/about", label: t.nav.about },
  ];

  useEffect(() => setOpen(false), [location]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const isActive = (href: string) => location === href || location.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <a href="#main" className="sr-only-focusable absolute left-4 top-2 z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground">
        {t.skipToContent}
      </a>
      <div className="container-page flex h-16 items-center justify-between gap-4 lg:h-20">
        <Link href="/" aria-label={t.nav.home} className="rounded-lg">
          <Logo />
        </Link>

        <nav aria-label={t.nav.label} className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={isActive(l.href) ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center rounded-lg px-3 text-[0.95rem] font-medium text-foreground hover:bg-muted",
                    isActive(l.href) && "text-primary underline decoration-accent decoration-2 underline-offset-8",
                  )}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <a
            href={`tel:${BUSINESS.phoneE164}`}
            onClick={() => track("call_link_clicked", { locale })}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-foreground hover:bg-muted"
          >
            <Phone aria-hidden="true" className="h-4 w-4 text-primary" />
            {BUSINESS.phoneDisplay}
          </a>
          <LocaleSwitch />
          <Button asChild>
            <Link href="/booking">{t.cta.checkAvailability}</Link>
          </Button>
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          <a
            href={`tel:${BUSINESS.phoneE164}`}
            onClick={() => track("call_link_clicked", { locale })}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-primary hover:bg-muted"
            aria-label={`${t.cta.call} ${BUSINESS.phoneDisplay}`}
          >
            <Phone aria-hidden="true" className="h-5 w-5" />
          </a>
          <button
            ref={toggleRef}
            type="button"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-muted"
          >
            {open ? <X aria-hidden="true" className="h-6 w-6" /> : <Menu aria-hidden="true" className="h-6 w-6" />}
            <span className="sr-only">{open ? t.nav.closeMenu : t.nav.menu}</span>
          </button>
        </div>
      </div>

      <div id="mobile-menu" ref={panelRef} hidden={!open} className="border-t border-border bg-background lg:hidden">
        <nav aria-label={t.nav.label} className="container-page py-4">
          <ul className="flex flex-col">
            {[...links, { href: "/service-areas", label: t.nav.serviceAreas }, { href: "/contact", label: t.nav.contact }].map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={isActive(l.href) ? "page" : undefined}
                  className="flex min-h-12 items-center rounded-lg px-2 text-lg font-medium hover:bg-muted"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
            <Button asChild size="lg">
              <Link href="/booking">{t.cta.checkAvailability}</Link>
            </Button>
            <LocaleSwitch className="justify-center" />
          </div>
        </nav>
      </div>
    </header>
  );
}
