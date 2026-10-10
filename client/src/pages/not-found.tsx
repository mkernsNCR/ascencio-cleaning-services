import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useMessages } from "@/i18n";
import { usePageMeta } from "@/lib/seo";

const messages = {
  en: { title: "Page not found", body: "The page you're looking for doesn't exist or has moved.", home: "Go to the home page", book: "Check availability" },
  es: { title: "Página no encontrada", body: "La página que busca no existe o fue movida.", home: "Ir al inicio", book: "Ver disponibilidad" },
};

export default function NotFound() {
  const t = useMessages(messages);
  usePageMeta({ title: t.title, description: t.body, path: "/404", noindex: true });
  return (
    <section className="container-page py-24">
      <h1 className="text-display-lg">{t.title}</h1>
      <p className="mt-4 max-w-prose text-muted-foreground">{t.body}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild><Link href="/">{t.home}</Link></Button>
        <Button asChild variant="outline"><Link href="/booking">{t.book}</Link></Button>
      </div>
    </section>
  );
}
