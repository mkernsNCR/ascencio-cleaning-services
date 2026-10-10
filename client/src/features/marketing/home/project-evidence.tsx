import { Link } from "wouter";
import { ArrowRight, Camera } from "lucide-react";
import { PROJECT_PHOTOS } from "@/content/site";
import { useLocale, useMessages } from "@/i18n";
import { cn } from "@/lib/utils";

const en = {
  eyebrow: "Our work",
  title: "Real results, shown honestly",
  comingSoon: "Verified photos from real Ascencio jobs, shared with customer permission, are on the way. We won't use stock images to stand in for our work.",
  link: "Visit Our Work",
  viewAll: "See more of our work",
};
const es: typeof en = {
  eyebrow: "Nuestro trabajo",
  title: "Resultados reales, mostrados con honestidad",
  comingSoon: "Pronto compartiremos fotos verificadas de trabajos reales de Ascencio, con el permiso de nuestros clientes. No usaremos imágenes de archivo para representar nuestro trabajo.",
  link: "Visite Nuestro trabajo",
  viewAll: "Ver más de nuestro trabajo",
};
export const projectEvidenceMessages = { en, es };

/** Static editorial layout of verified photos; an honest note when none exist yet. */
export function ProjectEvidence() {
  const t = useMessages(projectEvidenceMessages);
  const { locale } = useLocale();
  const photos = PROJECT_PHOTOS.slice(0, 3);

  return (
    <section id="gallery" aria-labelledby="gallery-title" className="scroll-mt-24 bg-background py-16 sm:py-24">
      <div className="container-page">
        {photos.length === 0 ? (
          <div className="grid gap-8 md:grid-cols-[auto_1fr] md:items-start">
            <span aria-hidden="true" className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Camera className="h-7 w-7" />
            </span>
            <div className="max-w-2xl">
              <p className="eyebrow mb-3">{t.eyebrow}</p>
              <h2 id="gallery-title" className="text-display-lg">{t.title}</h2>
              <p className="mt-4 text-lg leading-8 text-muted-foreground">{t.comingSoon}</p>
              <Link href="/our-work" className="mt-6 inline-flex min-h-11 items-center gap-2 font-semibold text-primary underline underline-offset-4 hover:no-underline">
                {t.link}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="max-w-2xl">
              <p className="eyebrow mb-3">{t.eyebrow}</p>
              <h2 id="gallery-title" className="text-display-lg">{t.title}</h2>
            </div>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {photos.map((p, i) => (
                <figure key={p.src} className={cn(i === 0 && "md:col-span-2 md:row-span-2")}>
                  <img
                    src={p.src}
                    width={p.width}
                    height={p.height}
                    alt={p.alt[locale]}
                    loading="lazy"
                    decoding="async"
                    className="h-auto w-full rounded-xl object-cover"
                  />
                  <figcaption className="mt-2 text-sm text-muted-foreground">{p.caption[locale]}</figcaption>
                </figure>
              ))}
            </div>
            <Link href="/our-work" className="mt-8 inline-flex min-h-11 items-center gap-2 font-semibold text-primary underline underline-offset-4 hover:no-underline">
              {t.viewAll}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
