import type { ReactNode } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useMessages } from "@/i18n";
import { ContactLinks } from "./contact-links";
import { marketingMessages } from "./messages";

const en = {
  title: "Ready when you are",
  body: "Choose a service, pick an available time, and we'll confirm your appointment by email. Prefer to talk first? Call or email us.",
};
const es: typeof en = {
  title: "Listos cuando usted lo esté",
  body: "Elija un servicio, escoja un horario disponible y le confirmaremos su cita por correo electrónico. ¿Prefiere hablar primero? Llámenos o escríbanos.",
};
export const ctaBandMessages = { en, es };

/** Closing booking call-to-action on a forest-green band. */
export function CtaBand({ id, title, body, href = "/booking", actionLabel }: { id?: string; title?: string; body?: ReactNode; href?: string; actionLabel?: string }) {
  const t = useMessages(ctaBandMessages);
  const m = useMessages(marketingMessages);
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className="scroll-mt-24 bg-primary text-primary-foreground">
      <div className="container-page grid gap-8 py-16 sm:py-20 md:grid-cols-[1.4fr_1fr] md:items-center">
        <div>
          <span aria-hidden="true" className="mb-5 block h-1 w-12 rounded-full bg-accent" />
          <h2 id={id ? `${id}-title` : undefined} className="text-display-lg text-primary-foreground">{title ?? t.title}</h2>
          <p className="mt-4 max-w-xl text-lg leading-8 text-primary-foreground/90">{body ?? t.body}</p>
        </div>
        <div className="flex flex-col gap-4 md:items-start">
          <Button asChild size="lg" className="bg-background text-primary hover:bg-primary-soft focus-visible:outline-background">
            <Link href={href}>{actionLabel ?? m.cta.checkAvailability}</Link>
          </Button>
          <ContactLinks tone="dark" />
        </div>
      </div>
    </section>
  );
}
