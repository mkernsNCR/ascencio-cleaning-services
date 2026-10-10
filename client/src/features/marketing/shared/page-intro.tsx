import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Standard page opening: eyebrow, the page's single H1, a lead paragraph, and optional actions. */
export function PageIntro({
  eyebrow,
  title,
  lead,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  lead?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-b border-border bg-background", className)}>
      <div className="container-page py-14 sm:py-20">
        <div className="max-w-3xl">
          {eyebrow && <p className="eyebrow mb-4">{eyebrow}</p>}
          <h1 className="text-display-xl">{title}</h1>
          {lead && <div className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">{lead}</div>}
          {children && <div className="mt-8 flex flex-wrap gap-3">{children}</div>}
        </div>
      </div>
    </section>
  );
}

/** Section heading block with optional eyebrow and intro, used for H2-level sections. */
export function SectionHeading({
  id,
  eyebrow,
  title,
  intro,
  className,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  intro?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", className)}>
      {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
      <h2 id={id} className="text-display-lg">{title}</h2>
      {intro && <div className="mt-4 text-lg leading-8 text-muted-foreground">{intro}</div>}
    </div>
  );
}
