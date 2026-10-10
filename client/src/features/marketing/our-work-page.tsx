import { useState } from "react";
import { Link } from "wouter";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PROJECT_PHOTOS, type VerifiedPhoto } from "@/content/site";
import { useLocale, useMessages } from "@/i18n";
import { usePageMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { CtaBand } from "./shared/cta-band";
import { PageIntro } from "./shared/page-intro";

const en = {
  metaTitle: "Our work",
  metaDescription: "Verified photos from real Ascencio Cleaning jobs in Washington, DC, Maryland, and Virginia, shared with customer permission.",
  title: "Our work",
  lead: "Photos here come from real Ascencio jobs and are published only with the customer's permission.",
  galleryTitle: "Recent projects",
  emptyTitle: "Verified photos are coming soon",
  emptyBody: [
    "We're collecting photos from real jobs, with our customers' permission. Until they're ready, we'd rather show nothing than use stock images that aren't our work.",
    "In the meantime, you can see exactly what each service includes, or request a time and see the results in your own space.",
  ],
  services: "See what each service includes",
  book: "Check availability",
  before: "Before",
  after: "After",
  compareLabel: "Show photo",
};
const es: typeof en = {
  metaTitle: "Nuestro trabajo",
  metaDescription: "Fotos verificadas de trabajos reales de Ascencio Cleaning en Washington, DC, Maryland y Virginia, compartidas con permiso de los clientes.",
  title: "Nuestro trabajo",
  lead: "Las fotos de esta página provienen de trabajos reales de Ascencio y se publican solo con el permiso del cliente.",
  galleryTitle: "Proyectos recientes",
  emptyTitle: "Pronto tendremos fotos verificadas",
  emptyBody: [
    "Estamos reuniendo fotos de trabajos reales, con el permiso de nuestros clientes. Mientras tanto, preferimos no mostrar nada antes que usar imágenes de archivo que no son nuestro trabajo.",
    "Mientras tanto, puede ver exactamente qué incluye cada servicio o solicitar un horario y ver los resultados en su propio espacio.",
  ],
  services: "Vea qué incluye cada servicio",
  book: "Ver disponibilidad",
  before: "Antes",
  after: "Después",
  compareLabel: "Mostrar foto",
};
export const ourWorkMessages = { en, es };

/** User-controlled before/after toggle. No autoplay; state changes only on button press. */
function BeforeAfter({ photo }: { photo: VerifiedPhoto & { beforeSrc: string } }) {
  const t = useMessages(ourWorkMessages);
  const { locale } = useLocale();
  const [showBefore, setShowBefore] = useState(false);
  const alt = `${photo.alt[locale]} (${showBefore ? t.before : t.after})`;
  return (
    <div>
      <img
        src={showBefore ? photo.beforeSrc : photo.src}
        width={photo.width}
        height={photo.height}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="h-auto w-full rounded-xl object-cover"
      />
      <div role="group" aria-label={t.compareLabel} className="mt-3 inline-flex rounded-lg border-2 border-primary p-0.5">
        {[
          { value: true, label: t.before },
          { value: false, label: t.after },
        ].map((opt) => (
          <button
            key={opt.label}
            type="button"
            aria-pressed={showBefore === opt.value}
            onClick={() => setShowBefore(opt.value)}
            className={cn(
              "min-h-11 min-w-24 rounded-md px-4 text-sm font-semibold",
              showBefore === opt.value ? "bg-primary text-primary-foreground" : "text-primary hover:bg-primary-soft",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Gallery() {
  const t = useMessages(ourWorkMessages);
  const { locale } = useLocale();
  return (
    <section aria-labelledby="gallery-title" className="bg-background py-14 sm:py-20">
      <div className="container-page">
        <h2 id="gallery-title" className="text-display-lg">{t.galleryTitle}</h2>
        <ul className="mt-10 grid gap-10 md:grid-cols-2">
          {PROJECT_PHOTOS.map((p) => (
            <li key={p.src}>
              <figure>
                {p.beforeSrc ? (
                  <BeforeAfter photo={{ ...p, beforeSrc: p.beforeSrc }} />
                ) : (
                  <img
                    src={p.src}
                    width={p.width}
                    height={p.height}
                    alt={p.alt[locale]}
                    loading="lazy"
                    decoding="async"
                    className="h-auto w-full rounded-xl object-cover"
                  />
                )}
                <figcaption className="mt-3 text-muted-foreground">{p.caption[locale]}</figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function EmptyState() {
  const t = useMessages(ourWorkMessages);
  return (
    <section aria-labelledby="empty-title" className="bg-background py-14 sm:py-20">
      <div className="container-page">
        <div className="grid max-w-4xl gap-8 rounded-2xl border border-dashed border-input bg-surface-sunken p-8 sm:p-12 md:grid-cols-[auto_1fr]">
          <span aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-primary shadow-soft">
            <Camera className="h-8 w-8" />
          </span>
          <div>
            <h2 id="empty-title" className="text-display-md">{t.emptyTitle}</h2>
            {t.emptyBody.map((p) => (
              <p key={p} className="mt-3 text-lg leading-8">{p}</p>
            ))}
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="whitespace-normal text-center">
                <Link href="/booking">{t.book}</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="whitespace-normal text-center">
                <Link href="/services">{t.services}</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function OurWorkPage() {
  const t = useMessages(ourWorkMessages);
  usePageMeta({ title: t.metaTitle, description: t.metaDescription, path: "/our-work" });
  return (
    <>
      <PageIntro title={t.title} lead={t.lead} />
      {PROJECT_PHOTOS.length > 0 ? <Gallery /> : <EmptyState />}
      <CtaBand />
    </>
  );
}
