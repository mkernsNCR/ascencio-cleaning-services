import { Link } from "wouter";
import { Mail, MapPin, Phone } from "lucide-react";
import { BUSINESS } from "@shared/business";
import { Logo } from "@/components/brand/logo";
import { SOCIAL_LINKS } from "@/content/site";
import { useLocale, useMessages, intlLocale } from "@/i18n";
import { commonMessages } from "@/i18n/common";
import { usePublicConfig } from "@/lib/queries";
import { track } from "@/lib/analytics";

function formatWall(time: string, locale: "en" | "es") {
  const [h, m] = time.split(":").map(Number);
  return new Intl.DateTimeFormat(intlLocale(locale), { hour: "numeric", minute: m ? "2-digit" : undefined, timeZone: "UTC" })
    .format(new Date(Date.UTC(2000, 0, 1, h, m)));
}

/** Opening hours from the live business settings (rendered client-side only). */
function Hours() {
  const { locale } = useLocale();
  const t = useMessages(commonMessages);
  const { data } = usePublicConfig();
  if (!data) return null;
  const order = [1, 2, 3, 4, 5, 6, 0] as const;
  // Group consecutive days with identical hours: "Monday–Friday 8 AM–6 PM".
  const rows: { from: number; to: number; text: string }[] = [];
  for (const d of order) {
    const windows = data.weeklyHours[String(d) as keyof typeof data.weeklyHours];
    const text = windows.length ? windows.map((w) => `${formatWall(w.open, locale)}–${formatWall(w.close, locale)}`).join(", ") : t.footer.closed;
    const last = rows[rows.length - 1];
    if (last && last.text === text) last.to = d;
    else rows.push({ from: d, to: d, text });
  }
  return (
    <div>
      <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-[0.12em] text-background/70">{t.footer.hours}</h2>
      <dl className="space-y-1 text-sm">
        {rows.map((r) => (
          <div key={r.from} className="flex gap-2">
            <dt className="min-w-28">{r.from === r.to ? t.days[r.from] : `${t.days[r.from]}–${t.days[r.to]}`}</dt>
            <dd className="text-background/85">{r.text}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function SiteFooter() {
  const t = useMessages(commonMessages);
  const { locale } = useLocale();
  const year = new Date().getFullYear();
  return (
    <footer className="mt-auto bg-foreground text-background">
      <div className="container-page grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-4">
          <Logo inverted />
          <p className="max-w-xs text-sm text-background/85">{t.footer.tagline}</p>
          <p className="text-sm text-background/85">{t.footer.bilingual}</p>
        </div>

        <div>
          <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-[0.12em] text-background/70">{t.footer.contact}</h2>
          <ul className="space-y-2 text-sm">
            <li>
              <a href={`tel:${BUSINESS.phoneE164}`} onClick={() => track("call_link_clicked", { locale })} className="inline-flex min-h-11 items-center gap-2 hover:underline">
                <Phone aria-hidden="true" className="h-4 w-4 text-accent" />
                {BUSINESS.phoneDisplay}
              </a>
            </li>
            <li>
              <a href={`mailto:${BUSINESS.email}`} className="inline-flex min-h-11 items-center gap-2 break-all hover:underline">
                <Mail aria-hidden="true" className="h-4 w-4 shrink-0 text-accent" />
                {BUSINESS.email}
              </a>
            </li>
            <li className="flex items-start gap-2 pt-2">
              <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <span>
                <span className="sr-only">{t.footer.coverage}: </span>
                {t.footer.coverageValue}
              </span>
            </li>
          </ul>
        </div>

        <Hours />

        <div>
          <h2 className="mb-3 font-sans text-sm font-semibold uppercase tracking-[0.12em] text-background/70">{t.footer.explore}</h2>
          <ul className="space-y-1 text-sm">
            {[
              ["/services", t.nav.services],
              ["/commercial", t.nav.commercial],
              ["/service-areas", t.nav.serviceAreas],
              ["/our-work", t.nav.ourWork],
              ["/about", t.nav.about],
              ["/contact", t.nav.contact],
              ["/privacy", t.footer.privacy],
              ["/terms", t.footer.terms],
            ].map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="inline-flex min-h-9 items-center hover:underline">{label}</Link>
              </li>
            ))}
          </ul>
          {SOCIAL_LINKS.length > 0 && (
            <ul className="mt-4 flex gap-3">
              {SOCIAL_LINKS.map((s) => (
                <li key={s.href}>
                  <a href={s.href} rel="noopener noreferrer" className="hover:underline">{s.label}</a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="border-t border-background/15">
        <p className="container-page py-6 text-xs text-background/70">
          © {year} {BUSINESS.legalName}. {t.footer.rights}
        </p>
      </div>
    </footer>
  );
}
