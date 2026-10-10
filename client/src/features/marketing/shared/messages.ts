// Shared copy for the marketing pages. All copy is PROPOSED and needs business approval;
// Spanish is a proposed translation for native-speaker review.

const en = {
  cta: {
    checkAvailability: "Check availability",
    bookService: (name: string) => `Check availability for ${name.toLowerCase()}`,
    bookShort: "Check availability",
    requestQuote: "Request a quote",
    requestCommercialQuote: "Request a commercial quote",
    viewDetails: "View details",
    viewDetailsFor: (name: string) => `View details: ${name}`,
    allServices: "Compare all services",
    contactUs: "Contact us",
    callUs: (phone: string) => `Call ${phone}`,
    emailUs: "Email us",
  },
  mode: {
    bookable: "Request a time online",
    quote_required: "Quote required",
  },
  pricing: {
    fromPrice: (price: string) => `From ${price}`,
    typicalDuration: (duration: string) => `Typically from ${duration}`,
    estimatePending: "Your estimate is shown during booking and confirmed by our team.",
    quotePending: "Priced after we understand the scope of the job.",
    basis: "Estimates are based on the number of bedrooms and bathrooms and are confirmed with you before service.",
  },
  lists: {
    included: "What's included",
    excluded: "Not included",
  },
  regions: {
    dc: "Washington, DC",
    md: "Maryland",
    va: "Virginia",
    all: "Washington, DC, Maryland, and Virginia",
  },
  bilingual: "Service in English and Spanish",
  form: {
    submit: "Send",
    sending: "Sending…",
    invalidValue: "Check this entry.",
    requiredNote: "Fields marked with * are required.",
    requiredMark: "required",
    firstName: "First name",
    lastName: "Last name",
    email: "Email",
    phone: "Phone",
    postalCode: "ZIP code",
    message: "Message",
    selectPlaceholder: "Select an option",
  },
};

const es: typeof en = {
  cta: {
    checkAvailability: "Ver disponibilidad",
    bookService: (name: string) => `Ver disponibilidad para ${name.toLowerCase()}`,
    bookShort: "Ver disponibilidad",
    requestQuote: "Solicitar cotización",
    requestCommercialQuote: "Solicitar cotización comercial",
    viewDetails: "Ver detalles",
    viewDetailsFor: (name: string) => `Ver detalles: ${name.toLowerCase()}`,
    allServices: "Comparar todos los servicios",
    contactUs: "Contáctenos",
    callUs: (phone: string) => `Llamar al ${phone}`,
    emailUs: "Escríbanos",
  },
  mode: {
    bookable: "Solicite un horario en línea",
    quote_required: "Requiere cotización",
  },
  pricing: {
    fromPrice: (price: string) => `Desde ${price}`,
    typicalDuration: (duration: string) => `Normalmente desde ${duration}`,
    estimatePending: "Su estimado se muestra durante la reservación y nuestro equipo lo confirma.",
    quotePending: "Se cotiza después de conocer el alcance del trabajo.",
    basis: "Los estimados se basan en la cantidad de dormitorios y baños, y se confirman con usted antes del servicio.",
  },
  lists: {
    included: "Qué incluye",
    excluded: "No incluye",
  },
  regions: {
    dc: "Washington, DC",
    md: "Maryland",
    va: "Virginia",
    all: "Washington, DC, Maryland y Virginia",
  },
  bilingual: "Atención en inglés y español",
  form: {
    submit: "Enviar",
    sending: "Enviando…",
    invalidValue: "Revise este dato.",
    requiredNote: "Los campos marcados con * son obligatorios.",
    requiredMark: "obligatorio",
    firstName: "Nombre",
    lastName: "Apellido",
    email: "Correo electrónico",
    phone: "Teléfono",
    postalCode: "Código postal",
    message: "Mensaje",
    selectPlaceholder: "Seleccione una opción",
  },
};

export const marketingMessages = { en, es };
export type MarketingMessages = typeof en;
