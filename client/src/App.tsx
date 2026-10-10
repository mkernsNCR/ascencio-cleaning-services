import { lazy, Suspense, useEffect, useRef } from "react";
import { Redirect, Route, Router, Switch, useLocation } from "wouter";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { LocaleProvider, type Locale } from "@/i18n";
import { PublicLayout } from "@/components/layout/public-layout";
import HomePage from "@/features/marketing/home-page";
import ServicesPage from "@/features/marketing/services-page";
import ServiceDetailPage from "@/features/marketing/service-detail-page";
import CommercialPage from "@/features/marketing/commercial-page";
import ServiceAreasPage from "@/features/marketing/service-areas-page";
import OurWorkPage from "@/features/marketing/our-work-page";
import AboutPage from "@/features/marketing/about-page";
import ContactPage from "@/features/marketing/contact-page";
import { PrivacyPage, TermsPage } from "@/features/marketing/legal-pages";
import BookingPage from "@/features/booking/booking-page";
import ManageBookingPage from "@/features/booking/manage-page";
import ActionPage from "@/features/actions/action-page";
import NotFound from "@/pages/not-found";

// Staff dashboard is client-only and loaded on demand.
const AdminApp = lazy(() => import("@/features/admin/admin-app"));

/** Moves focus to the main landmark on client-side navigation so screen readers announce the new page. */
function RouteFocus() {
  const [location] = useLocation();
  const first = useRef(true);
  useEffect(() => {
    // Leave focus alone on the initial load so the skip link is the first Tab stop.
    if (first.current) {
      first.current = false;
      return;
    }
    if (!window.location.hash) {
      window.scrollTo(0, 0);
      document.getElementById("main")?.focus({ preventScroll: true });
    }
  }, [location]);
  return null;
}

function PublicRoutes() {
  return (
    <PublicLayout>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/services" component={ServicesPage} />
        <Route path="/services/:slug" component={ServiceDetailPage} />
        <Route path="/commercial" component={CommercialPage} />
        <Route path="/service-areas" component={ServiceAreasPage} />
        <Route path="/our-work" component={OurWorkPage} />
        <Route path="/about" component={AboutPage} />
        <Route path="/contact" component={ContactPage} />
        <Route path="/booking" component={BookingPage} />
        <Route path="/booking/manage" component={ManageBookingPage} />
        <Route path="/privacy" component={PrivacyPage} />
        <Route path="/terms" component={TermsPage} />
        {/* Compatibility with links to the old single-page site */}
        <Route path="/gallery">{() => <Redirect to="/our-work" replace />}</Route>
        <Route path="/reviews">{() => <Redirect to="/#reviews" replace />}</Route>
        <Route component={NotFound} />
      </Switch>
    </PublicLayout>
  );
}

export function AppRoutes() {
  return (
    <Switch>
      <Route path="/admin" nest>
        <Suspense fallback={<div className="p-8">Loading…</div>}>
          <AdminApp />
        </Suspense>
      </Route>
      <Route path="/action" component={ActionPage} />
      <Route component={PublicRoutes} />
    </Switch>
  );
}

export default function App({ queryClient, ssrPath, initialLocale }: { queryClient: QueryClient; ssrPath?: string; initialLocale?: Locale }) {
  return (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider initialLocale={initialLocale}>
        <Router ssrPath={ssrPath}>
          {!ssrPath && <RouteFocus />}
          <AppRoutes />
        </Router>
      </LocaleProvider>
    </QueryClientProvider>
  );
}
