import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useMessages } from "@/i18n";

const en = {
  eyebrow: "For businesses",
  title: "Cleaning built around your workplace",
  body: "Offices, shops, and shared spaces need a plan, not a bedroom count. Tell us about your space and we'll put together a proposal.",
  points: [
    { title: "Your schedule", body: "Before opening, after hours, or between shifts." },
    { title: "Your frequency", body: "Daily, weekly, every two weeks, monthly, or one time." },
    { title: "Your scope", body: "Workspaces, restrooms, break rooms, and the areas you choose." },
  ],
  cta: "Request a commercial quote",
};
const es: typeof en = {
  eyebrow: "Para negocios",
  title: "Limpieza pensada para su lugar de trabajo",
  body: "Las oficinas, tiendas y espacios compartidos necesitan un plan, no un conteo de dormitorios. Cuéntenos sobre su espacio y le prepararemos una propuesta.",
  points: [
    { title: "Su horario", body: "Antes de abrir, después del cierre o entre turnos." },
    { title: "Su frecuencia", body: "Diaria, semanal, cada dos semanas, mensual o una sola vez." },
    { title: "Su alcance", body: "Espacios de trabajo, baños, salas de descanso y las áreas que usted elija." },
  ],
  cta: "Solicitar cotización comercial",
};
export const commercialFeatureMessages = { en, es };

export function CommercialFeature() {
  const t = useMessages(commercialFeatureMessages);
  return (
    <section aria-labelledby="commercial-title" className="bg-background pb-16 sm:pb-24">
      <div className="container-page">
        <div className="relative overflow-hidden rounded-2xl bg-foreground text-background">
          <span aria-hidden="true" className="absolute -right-16 -top-16 h-56 w-56 rounded-full border-[14px] border-accent/40" />
          <div className="relative grid gap-10 p-8 sm:p-12 lg:grid-cols-[1fr_1fr] lg:gap-16 lg:p-16">
            <div>
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-accent">{t.eyebrow}</p>
              <h2 id="commercial-title" className="text-display-lg text-background">{t.title}</h2>
              <p className="mt-4 text-lg leading-8 text-background/85">{t.body}</p>
              <Button asChild size="lg" className="mt-8 whitespace-normal bg-background text-center text-foreground hover:bg-primary-soft focus-visible:outline-background">
                <Link href="/commercial">{t.cta}</Link>
              </Button>
            </div>
            <dl className="grid content-center gap-6">
              {t.points.map((p) => (
                <div key={p.title} className="border-l-2 border-accent pl-5">
                  <dt className="font-display text-xl font-semibold">{p.title}</dt>
                  <dd className="mt-1 text-background/85">{p.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}
