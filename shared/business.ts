// Business identity used by the site and emails. Values come from the original site; confirm each
// before launch. Social links stay empty until real profiles are supplied.
export const BUSINESS = {
  legalName: "Ascencio Cleaning Services LLC",
  shortName: "Ascencio Cleaning",
  phoneDisplay: "(240) 355-3108",
  phoneE164: "+12403553108",
  email: "ascenciocleaning@gmail.com",
  areaServed: ["Washington, DC", "Maryland", "Virginia"],
  socialLinks: [] as { label: string; href: string }[],
} as const;
