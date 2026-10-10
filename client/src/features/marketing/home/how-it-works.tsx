import { useMessages } from "@/i18n";
import { BookingSteps } from "../shared/booking-steps";
import { SectionHeading } from "../shared/page-intro";

const en = {
  eyebrow: "How it works",
  title: "Three steps, confirmed by a person",
  intro: "Online requests show real open times, and every appointment is reviewed and confirmed by the owner by email.",
};
const es: typeof en = {
  eyebrow: "Cómo funciona",
  title: "Tres pasos, confirmados por una persona",
  intro: "Las solicitudes en línea muestran horarios realmente disponibles, y el propietario revisa y confirma cada cita por correo electrónico.",
};
export const howItWorksMessages = { en, es };

export function HowItWorks() {
  const t = useMessages(howItWorksMessages);
  return (
    <section aria-labelledby="how-title" className="bg-surface-sunken py-16 sm:py-24">
      <div className="container-page">
        <SectionHeading id="how-title" eyebrow={t.eyebrow} title={t.title} intro={t.intro} />
        <BookingSteps className="mt-12" tone="sunken" />
      </div>
    </section>
  );
}
