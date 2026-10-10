import { Mail, Phone } from "lucide-react";
import { BUSINESS } from "@shared/business";
import { useLocale } from "@/i18n";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/** Phone and email alternatives. `tone="dark"` is for use on forest-green bands. */
export function ContactLinks({ className, tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  const { locale } = useLocale();
  const link = cn(
    "inline-flex min-h-11 items-center gap-2.5 rounded-md font-semibold underline-offset-4 hover:underline",
    tone === "dark" ? "text-primary-foreground focus-visible:outline-background" : "text-primary",
  );
  const icon = cn("h-5 w-5 shrink-0", tone === "dark" ? "text-accent" : "text-primary");
  return (
    <ul className={cn("flex flex-col gap-1", className)}>
      <li>
        <a href={`tel:${BUSINESS.phoneE164}`} className={link} onClick={() => track("call_link_clicked", { locale })}>
          <Phone aria-hidden="true" className={icon} />
          {BUSINESS.phoneDisplay}
        </a>
      </li>
      <li>
        <a href={`mailto:${BUSINESS.email}`} className={cn(link, "break-all")}>
          <Mail aria-hidden="true" className={icon} />
          {BUSINESS.email}
        </a>
      </li>
    </ul>
  );
}
