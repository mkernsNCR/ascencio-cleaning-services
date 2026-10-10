import { useMessages } from "@/i18n";
import { cn } from "@/lib/utils";

const en = {
  steps: [
    {
      title: "Choose a service",
      body: "Pick standard, deep, or move-in/move-out cleaning and tell us the number of bedrooms and bathrooms.",
    },
    {
      title: "Request an available time",
      body: "Enter your ZIP code to see open times, then send your request with your contact details.",
    },
    {
      title: "Receive owner confirmation",
      body: "Your request is not instant. The owner reviews it and you receive an email when the appointment is confirmed.",
    },
  ],
};
const es: typeof en = {
  steps: [
    {
      title: "Elija un servicio",
      body: "Escoja limpieza estándar, profunda o de mudanza e indíquenos la cantidad de dormitorios y baños.",
    },
    {
      title: "Solicite un horario disponible",
      body: "Ingrese su código postal para ver los horarios disponibles y envíe su solicitud con sus datos de contacto.",
    },
    {
      title: "Reciba la confirmación del propietario",
      body: "Su solicitud no es inmediata. El propietario la revisa y usted recibe un correo electrónico cuando la cita queda confirmada.",
    },
  ],
};
export const bookingStepsMessages = { en, es };

/** The three-step booking process as a numbered list with H3 step titles. */
export function BookingSteps({ className, tone = "light" }: { className?: string; tone?: "light" | "sunken" }) {
  const t = useMessages(bookingStepsMessages);
  return (
    <ol className={cn("grid gap-8 md:grid-cols-3 md:gap-10", className)}>
      {t.steps.map((step, i) => (
        <li key={step.title} className="relative flex gap-5 md:flex-col md:gap-4">
          <span
            aria-hidden="true"
            className={cn(
              "flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-primary font-display text-2xl font-semibold text-primary",
              tone === "sunken" ? "bg-surface" : "bg-background",
            )}
          >
            {i + 1}
          </span>
          <div>
            <h3 className="text-xl font-semibold">
              <span className="sr-only">{`${i + 1}. `}</span>
              {step.title}
            </h3>
            <p className="mt-2 text-muted-foreground">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
