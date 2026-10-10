import { Link } from "wouter";
import { ArrowRight, Languages, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMessages } from "@/i18n";
import { HeroIllustration } from "../shared/hero-illustration";

const en = {
  eyebrow: "Home and workplace cleaning",
  title: "A cleaner space. More time for what matters.",
  lead: "Standard, deep, and move-in/move-out cleaning for homes, plus tailored cleaning for businesses. Request a time that works for you and we'll confirm it personally.",
  coverage: "Serving Washington, DC, Maryland, and Virginia",
  bilingual: "Service in English and Spanish",
  primary: "Check availability",
  secondary: "Request a commercial quote",
};
const es: typeof en = {
  eyebrow: "Limpieza de hogares y lugares de trabajo",
  title: "Un espacio más limpio. Más tiempo para lo que importa.",
  lead: "Limpieza estándar, profunda y de mudanza para hogares, y limpieza a la medida para negocios. Solicite el horario que le convenga y se lo confirmaremos personalmente.",
  coverage: "Servimos Washington, DC, Maryland y Virginia",
  bilingual: "Atención en inglés y español",
  primary: "Ver disponibilidad",
  secondary: "Solicitar cotización comercial",
};
export const heroMessages = { en, es };

export function Hero() {
  const t = useMessages(heroMessages);
  return (
    <section className="overflow-hidden bg-background">
      <div className="container-page grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:py-24">
        <div>
          <p className="eyebrow mb-5">{t.eyebrow}</p>
          <h1 className="text-display-xl font-semibold">{t.title}</h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">{t.lead}</p>
          <ul className="mt-6 space-y-2 text-base font-medium">
            <li className="flex items-start gap-2.5">
              <MapPin aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-primary" />
              {t.coverage}
            </li>
            <li className="flex items-start gap-2.5">
              <Languages aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-primary" />
              {t.bilingual}
            </li>
          </ul>
          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
            <Button asChild size="lg" className="whitespace-normal text-center">
              <Link href="/booking">{t.primary}</Link>
            </Button>
            <Link
              href="/commercial"
              className="inline-flex min-h-11 items-center gap-2 rounded-md font-semibold text-primary underline underline-offset-4 hover:no-underline"
            >
              {t.secondary}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <span aria-hidden="true" className="absolute -right-4 -top-4 hidden h-24 w-24 rounded-full border-2 border-accent sm:block" />
          <div className="relative overflow-hidden rounded-2xl shadow-lift">
            <HeroIllustration />
          </div>
        </div>
      </div>
    </section>
  );
}
