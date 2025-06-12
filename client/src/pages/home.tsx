import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Home, 
  Building, 
  Sparkles, 
  Phone, 
  Mail, 
  MapPin, 
  Shield, 
  Leaf, 
  Clock, 
  Heart,
  Menu,
  X,
  Facebook,
  Instagram,
  Globe
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Carousel } from "@/components/carousel";
import { StarRating } from "@/components/star-rating";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Review, InsertReview, InsertContactRequest } from "@shared/schema";

// Language translations
const translations = {
  en: {
    nav: {
      home: "Home",
      services: "Services",
      gallery: "Our Work",
      reviews: "Reviews",
      bookNow: "Book Now"
    },
    hero: {
      title: "Professional Cleaning Services You Can Trust",
      subtitle: "Experience the difference with Ascencio Cleaning Services LLC. We provide thorough, reliable cleaning services for your home and office with attention to every detail.",
      bilingualNote: "Servicio bilingüe disponible - Bilingual service available",
      getQuote: "Get Free Quote",
      ourServices: "Our Services",
      customerRating: "Customer Rating"
    },
    services: {
      title: "Our Cleaning Services",
      subtitle: "We offer comprehensive cleaning solutions tailored to your needs, using eco-friendly products and professional techniques.",
      residential: {
        title: "Residential Cleaning",
        description: "Complete home cleaning services including kitchens, bathrooms, bedrooms, and living areas. Weekly, bi-weekly, or monthly options available.",
        features: ["Deep cleaning services", "Regular maintenance cleaning", "Move-in/move-out cleaning"]
      },
      commercial: {
        title: "Commercial Cleaning",
        description: "Professional office and commercial space cleaning services to maintain a clean, healthy work environment for your business.",
        features: ["Office cleaning", "Retail space cleaning", "Post-construction cleanup"]
      },
      deep: {
        title: "Deep Cleaning",
        description: "Thorough, detailed cleaning service that goes beyond regular maintenance to tackle hard-to-reach areas and built-up grime.",
        features: ["Inside appliances cleaning", "Baseboard and trim cleaning", "Window interior cleaning"]
      }
    },
    gallery: {
      title: "Our Work in Action",
      subtitle: "See the difference our professional cleaning services make"
    },
    reviews: {
      title: "What Our Customers Say",
      subtitle: "Don't just take our word for it - hear from our satisfied clients",
      submitTitle: "Share Your Experience",
      submitSubtitle: "We'd love to hear about your experience with our cleaning services",
      name: "Your Name",
      email: "Your Email",
      rating: "Your Rating",
      review: "Your Review",
      submit: "Submit Review"
    },
    contact: {
      title: "Ready to Book Your Cleaning Service?",
      subtitle: "Get your free quote today! We'll contact you within 24 hours.",
      firstName: "First Name",
      lastName: "Last Name",
      email: "Email Address",
      phone: "Phone Number",
      serviceType: "Service Type",
      propertySize: "Property Size",
      preferredDate: "Preferred Date",
      message: "Additional Message (Optional)",
      submit: "Get Free Quote"
    }
  },
  es: {
    nav: {
      home: "Inicio",
      services: "Servicios",
      gallery: "Nuestro Trabajo",
      reviews: "Reseñas",
      bookNow: "Reservar Ahora"
    },
    hero: {
      title: "Servicios de Limpieza Profesional en los que Puedes Confiar",
      subtitle: "Experimenta la diferencia con Ascencio Cleaning Services LLC. Proporcionamos servicios de limpieza completos y confiables para tu hogar y oficina con atención a cada detalle.",
      bilingualNote: "Bilingual service available - Servicio bilingüe disponible",
      getQuote: "Cotización Gratuita",
      ourServices: "Nuestros Servicios",
      customerRating: "Calificación del Cliente"
    },
    services: {
      title: "Nuestros Servicios de Limpieza",
      subtitle: "Ofrecemos soluciones de limpieza integrales adaptadas a tus necesidades, utilizando productos ecológicos y técnicas profesionales.",
      residential: {
        title: "Limpieza Residencial",
        description: "Servicios completos de limpieza del hogar incluyendo cocinas, baños, dormitorios y áreas de estar. Opciones semanales, quincenales o mensuales disponibles.",
        features: ["Servicios de limpieza profunda", "Limpieza de mantenimiento regular", "Limpieza de mudanza"]
      },
      commercial: {
        title: "Limpieza Comercial",
        description: "Servicios profesionales de limpieza de oficinas y espacios comerciales para mantener un ambiente de trabajo limpio y saludable para tu negocio.",
        features: ["Limpieza de oficinas", "Limpieza de espacios comerciales", "Limpieza post-construcción"]
      },
      deep: {
        title: "Limpieza Profunda",
        description: "Servicio de limpieza detallado y completo que va más allá del mantenimiento regular para abordar áreas difíciles de alcanzar y suciedad acumulada.",
        features: ["Limpieza interior de electrodomésticos", "Limpieza de zócalos y molduras", "Limpieza interior de ventanas"]
      }
    },
    gallery: {
      title: "Nuestro Trabajo en Acción",
      subtitle: "Ve la diferencia que hacen nuestros servicios de limpieza profesional"
    },
    reviews: {
      title: "Lo que Dicen Nuestros Clientes",
      subtitle: "No solo confíes en nuestra palabra - escucha a nuestros clientes satisfechos",
      submitTitle: "Comparte Tu Experiencia",
      submitSubtitle: "Nos encantaría saber sobre tu experiencia con nuestros servicios de limpieza",
      name: "Tu Nombre",
      email: "Tu Correo",
      rating: "Tu Calificación",
      review: "Tu Reseña",
      submit: "Enviar Reseña"
    },
    contact: {
      title: "¿Listo para Reservar tu Servicio de Limpieza?",
      subtitle: "¡Obtén tu cotización gratuita hoy! Te contactaremos dentro de 24 horas.",
      firstName: "Nombre",
      lastName: "Apellido",
      email: "Correo Electrónico",
      phone: "Número de Teléfono",
      serviceType: "Tipo de Servicio",
      propertySize: "Tamaño de Propiedad",
      preferredDate: "Fecha Preferida",
      message: "Mensaje Adicional (Opcional)",
      submit: "Obtener Cotización Gratuita"
    }
  }
};

export default function HomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [language, setLanguage] = useState<'en' | 'es'>('en');
  const { toast } = useToast();

  const t = translations[language];

  // Fetch reviews
  const { data: reviews = [], isLoading: reviewsLoading } = useQuery<Review[]>({
    queryKey: ["/api/reviews"],
  });

  // Submit review mutation
  const submitReviewMutation = useMutation({
    mutationFn: async (data: InsertReview) => {
      const response = await apiRequest("POST", "/api/reviews", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Review Submitted",
        description: "Thank you for your review! It will be published after moderation.",
      });
      setSelectedRating(0);
      queryClient.invalidateQueries({ queryKey: ["/api/reviews"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to submit review. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Submit contact request mutation
  const submitContactMutation = useMutation({
    mutationFn: async (data: InsertContactRequest) => {
      const response = await apiRequest("POST", "/api/contact", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Request Submitted",
        description: "We will contact you within 24 hours with your free quote!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to submit your request. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleReviewSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    if (selectedRating === 0) {
      toast({
        title: "Rating Required",
        description: "Please select a rating before submitting your review.",
        variant: "destructive",
      });
      return;
    }

    const reviewData: InsertReview = {
      name: formData.get("name") as string,
      email: formData.get("email") as string,
      rating: selectedRating,
      review: formData.get("review") as string,
    };

    submitReviewMutation.mutate(reviewData);
    (e.target as HTMLFormElement).reset();
  };

  const handleContactSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const contactData: InsertContactRequest = {
      firstName: formData.get("firstName") as string,
      lastName: formData.get("lastName") as string,
      email: formData.get("email") as string,
      phone: formData.get("phone") as string,
      serviceType: formData.get("serviceType") as string,
      propertySize: formData.get("propertySize") as string,
      preferredDate: formData.get("preferredDate") as string,
      message: formData.get("message") as string,
    };

    submitContactMutation.mutate(contactData);
    (e.target as HTMLFormElement).reset();
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      // Get the actual navigation header element to calculate its height dynamically
      const navElement = document.querySelector('nav');
      const headerHeight = navElement ? navElement.offsetHeight : 64;
      
      // Add extra padding for mobile to account for mobile menu space
      const isMobile = window.innerWidth < 768;
      const extraPadding = isMobile ? 20 : 10;
      
      const elementPosition = element.offsetTop - headerHeight - extraPadding;
      window.scrollTo({
        top: Math.max(0, elementPosition), // Ensure we don't scroll to negative position
        behavior: "smooth"
      });
    }
    setMobileMenuOpen(false);
  };

  const averageRating = reviews.length > 0 
    ? (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1)
    : "5.0";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navigation */}
      <nav className="bg-white shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <h1 className="text-2xl font-bold text-primary">Ascencio Cleaning Services</h1>
                <p className="text-xs text-slate-600">LLC</p>
              </div>
            </div>
            <div className="hidden md:flex items-center space-x-4">
              <div className="flex items-baseline space-x-8">
                <button onClick={() => scrollToSection("home")} className="text-slate-700 hover:text-primary px-3 py-2 text-sm font-medium transition-colors">{t.nav.home}</button>
                <button onClick={() => scrollToSection("services")} className="text-slate-700 hover:text-primary px-3 py-2 text-sm font-medium transition-colors">{t.nav.services}</button>
                <button onClick={() => scrollToSection("gallery")} className="text-slate-700 hover:text-primary px-3 py-2 text-sm font-medium transition-colors">{t.nav.gallery}</button>
                <button onClick={() => scrollToSection("reviews")} className="text-slate-700 hover:text-primary px-3 py-2 text-sm font-medium transition-colors">{t.nav.reviews}</button>
                <Button onClick={() => scrollToSection("contact")} className="bg-primary text-white hover:bg-blue-700">{t.nav.bookNow}</Button>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setLanguage(language === 'en' ? 'es' : 'en')}
                className="flex items-center gap-2 ml-8"
              >
                <Globe className="h-4 w-4" />
                {language === 'en' ? 'ES' : 'EN'}
              </Button>
            </div>
            <div className="md:hidden flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setLanguage(language === 'en' ? 'es' : 'en')}
                className="flex items-center gap-1"
              >
                <Globe className="h-3 w-3" />
                {language === 'en' ? 'ES' : 'EN'}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </Button>
            </div>
          </div>
        </div>
        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-slate-200">
            <div className="px-2 pt-2 pb-3 space-y-1">
              <button onClick={() => scrollToSection("home")} className="block w-full text-left px-3 py-2 text-slate-700 hover:text-primary text-sm font-medium">{t.nav.home}</button>
              <button onClick={() => scrollToSection("services")} className="block w-full text-left px-3 py-2 text-slate-700 hover:text-primary text-sm font-medium">{t.nav.services}</button>
              <button onClick={() => scrollToSection("gallery")} className="block w-full text-left px-3 py-2 text-slate-700 hover:text-primary text-sm font-medium">{t.nav.gallery}</button>
              <button onClick={() => scrollToSection("reviews")} className="block w-full text-left px-3 py-2 text-slate-700 hover:text-primary text-sm font-medium">{t.nav.reviews}</button>
              <Button onClick={() => scrollToSection("contact")} className="block mx-3 mt-2 bg-primary text-white hover:bg-blue-700 w-auto">{t.nav.bookNow}</Button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section id="home" className="bg-gradient-to-br from-primary to-blue-700 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl lg:text-6xl font-bold mb-6 leading-tight">
                {t.hero.title}
              </h2>
              <p className="text-xl mb-6 text-blue-100">
                {t.hero.subtitle}
              </p>
              <div className="bg-blue-800/30 border border-blue-500/50 rounded-lg p-4 mb-8">
                <p className="text-blue-100 text-center font-medium flex items-center justify-center gap-2">
                  <Globe className="h-5 w-5" />
                  {t.hero.bilingualNote}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  onClick={() => scrollToSection("contact")} 
                  className="bg-accent text-white hover:bg-yellow-500 px-8 py-4 text-lg font-semibold"
                >
                  {t.hero.getQuote}
                </Button>
                <Button 
                  onClick={() => scrollToSection("services")} 
                  variant="outline" 
                  className="border-2 border-white text-white bg-transparent hover:bg-white hover:text-primary px-8 py-4 text-lg font-semibold"
                >
                  {t.hero.ourServices}
                </Button>
              </div>
            </div>
            <div className="relative">
              <img 
                src="https://images.unsplash.com/photo-1581578731548-c64695cc6952?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=800&h=600" 
                alt="Professional cleaning team" 
                className="rounded-2xl shadow-2xl w-full" 
              />
              <div className="absolute -bottom-4 -left-4 bg-white p-6 rounded-xl shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="bg-secondary text-white p-3 rounded-full">
                    <StarRating rating={5} size="sm" />
                  </div>
                  <div>
                    <div className="text-slate-900 font-bold text-lg">{averageRating}</div>
                    <div className="text-slate-600 text-sm">{t.hero.customerRating}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section id="services" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-slate-900 mb-4">{t.services.title}</h2>
            <p className="text-xl text-slate-600 max-w-3xl mx-auto">{t.services.subtitle}</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="bg-slate-50 hover:shadow-lg transition-shadow border border-slate-200">
              <CardContent className="p-8">
                <div className="bg-primary text-white p-4 rounded-full w-16 h-16 flex items-center justify-center mb-6">
                  <Home className="h-8 w-8" />
                </div>
                <h3 className="text-2xl font-semibold text-slate-900 mb-4">{t.services.residential.title}</h3>
                <p className="text-slate-600 mb-6">{t.services.residential.description}</p>
                <ul className="text-slate-600 space-y-2">
                  {t.services.residential.features.map((feature, index) => (
                    <li key={index} className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-secondary rounded-full"></div>
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-slate-50 hover:shadow-lg transition-shadow border border-slate-200">
              <CardContent className="p-8">
                <div className="bg-secondary text-white p-4 rounded-full w-16 h-16 flex items-center justify-center mb-6">
                  <Building className="h-8 w-8" />
                </div>
                <h3 className="text-2xl font-semibold text-slate-900 mb-4">{t.services.commercial.title}</h3>
                <p className="text-slate-600 mb-6">{t.services.commercial.description}</p>
                <ul className="text-slate-600 space-y-2">
                  {t.services.commercial.features.map((feature, index) => (
                    <li key={index} className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-secondary rounded-full"></div>
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-slate-50 hover:shadow-lg transition-shadow border border-slate-200">
              <CardContent className="p-8">
                <div className="bg-accent text-white p-4 rounded-full w-16 h-16 flex items-center justify-center mb-6">
                  <Sparkles className="h-8 w-8" />
                </div>
                <h3 className="text-2xl font-semibold text-slate-900 mb-4">{t.services.deep.title}</h3>
                <p className="text-slate-600 mb-6">{t.services.deep.description}</p>
                <ul className="text-slate-600 space-y-2">
                  {t.services.deep.features.map((feature, index) => (
                    <li key={index} className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-secondary rounded-full"></div>
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Work Gallery Carousel */}
      <section id="gallery" className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-slate-900 mb-4">{t.gallery.title}</h2>
            <p className="text-xl text-slate-600">{t.gallery.subtitle}</p>
          </div>
          <Carousel />
        </div>
      </section>

      {/* Customer Reviews */}
      <section id="reviews" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-slate-900 mb-4">{t.reviews.title}</h2>
            <p className="text-xl text-slate-600">{t.reviews.subtitle}</p>
          </div>

          {reviewsLoading ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="bg-slate-50 border border-slate-200">
                  <CardContent className="p-8">
                    <div className="animate-pulse space-y-4">
                      <div className="h-6 bg-slate-300 rounded w-1/2"></div>
                      <div className="h-20 bg-slate-300 rounded"></div>
                      <div className="h-12 bg-slate-300 rounded w-3/4"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {reviews.map((review) => (
                <Card key={review.id} className="bg-slate-50 border border-slate-200">
                  <CardContent className="p-8">
                    <div className="flex items-center mb-4">
                      <StarRating rating={review.rating} />
                      <span className="ml-2 text-sm text-slate-600">{review.rating}.0</span>
                    </div>
                    <p className="text-slate-700 mb-6 italic">"{review.review}"</p>
                    <div className="flex items-center">
                      <div className="w-12 h-12 bg-slate-300 rounded-full flex items-center justify-center">
                        <span className="text-slate-600 font-semibold">
                          {review.name.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <div className="ml-4">
                        <h4 className="font-semibold text-slate-900">{review.name}</h4>
                        <p className="text-sm text-slate-600">Customer</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Rating Submission Form */}
          <div className="mt-16 max-w-2xl mx-auto">
            <Card className="bg-slate-50 border border-slate-200">
              <CardContent className="p-8">
                <h3 className="text-2xl font-semibold text-slate-900 mb-6 text-center">{t.reviews.submitTitle}</h3>
                <form onSubmit={handleReviewSubmit} className="space-y-6">
                  <div>
                    <Label className="text-sm font-medium text-slate-700 mb-2">{t.reviews.rating}</Label>
                    <div className="mt-2">
                      <StarRating 
                        rating={selectedRating} 
                        onRatingChange={setSelectedRating} 
                        interactive 
                        size="lg"
                      />
                    </div>
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="review-name">{t.reviews.name}</Label>
                      <Input type="text" id="review-name" name="name" required />
                    </div>
                    <div>
                      <Label htmlFor="review-email">{t.reviews.email}</Label>
                      <Input type="email" id="review-email" name="email" required />
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="review-text">{t.reviews.review}</Label>
                    <Textarea 
                      id="review-text" 
                      name="review" 
                      rows={4} 
                      required 
                      placeholder={language === 'en' ? "Tell us about your experience..." : "Cuéntanos sobre tu experiencia..."}
                    />
                  </div>
                  
                  <Button 
                    type="submit" 
                    className="w-full bg-primary hover:bg-blue-700"
                    disabled={submitReviewMutation.isPending}
                  >
                    {submitReviewMutation.isPending ? (language === 'en' ? "Submitting..." : "Enviando...") : t.reviews.submit}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-slate-900 mb-4">{t.contact.title}</h2>
            <p className="text-xl text-slate-600">{t.contact.subtitle}</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12">
            {/* Contact Form */}
            <Card className="bg-white shadow-lg border border-slate-200">
              <CardContent className="p-8">
                <h3 className="text-2xl font-semibold text-slate-900 mb-6">{t.contact.submit}</h3>
                <form onSubmit={handleContactSubmit} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="first-name">{t.contact.firstName}</Label>
                      <Input type="text" id="first-name" name="firstName" required />
                    </div>
                    <div>
                      <Label htmlFor="last-name">{t.contact.lastName}</Label>
                      <Input type="text" id="last-name" name="lastName" required />
                    </div>
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="email">{t.contact.email}</Label>
                      <Input type="email" id="email" name="email" required />
                    </div>
                    <div>
                      <Label htmlFor="phone">{t.contact.phone}</Label>
                      <Input type="tel" id="phone" name="phone" required />
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="service-type">{t.contact.serviceType}</Label>
                    <Select name="serviceType" required>
                      <SelectTrigger>
                        <SelectValue placeholder={language === 'en' ? "Select a service" : "Selecciona un servicio"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="residential">{t.services.residential.title}</SelectItem>
                        <SelectItem value="commercial">{t.services.commercial.title}</SelectItem>
                        <SelectItem value="deep-clean">{t.services.deep.title}</SelectItem>
                        <SelectItem value="move-in-out">{language === 'en' ? 'Move-in/Move-out' : 'Mudanza'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="property-size">{t.contact.propertySize}</Label>
                    <Select name="propertySize" required>
                      <SelectTrigger>
                        <SelectValue placeholder={language === 'en' ? "Select size" : "Selecciona tamaño"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">{language === 'en' ? 'Small (1-2 bedrooms)' : 'Pequeño (1-2 dormitorios)'}</SelectItem>
                        <SelectItem value="medium">{language === 'en' ? 'Medium (3-4 bedrooms)' : 'Mediano (3-4 dormitorios)'}</SelectItem>
                        <SelectItem value="large">{language === 'en' ? 'Large (5+ bedrooms)' : 'Grande (5+ dormitorios)'}</SelectItem>
                        <SelectItem value="commercial">{language === 'en' ? 'Commercial Space' : 'Espacio Comercial'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="preferred-date">{t.contact.preferredDate}</Label>
                    <Input type="date" id="preferred-date" name="preferredDate" required />
                  </div>
                  
                  <div>
                    <Label htmlFor="message">{t.contact.message}</Label>
                    <Textarea 
                      id="message" 
                      name="message" 
                      rows={4}
                      placeholder={language === 'en' ? "Tell us about any specific cleaning needs or requirements..." : "Cuéntanos sobre necesidades específicas de limpieza..."}
                    />
                  </div>
                  
                  <Button 
                    type="submit" 
                    className="w-full bg-primary hover:bg-blue-700 py-4 text-lg font-semibold"
                    disabled={submitContactMutation.isPending}
                  >
                    {submitContactMutation.isPending ? (language === 'en' ? "Submitting..." : "Enviando...") : t.contact.submit}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Contact Information */}
            <div className="space-y-8">
              <Card className="bg-white shadow-lg border border-slate-200">
                <CardContent className="p-8">
                  <h3 className="text-2xl font-semibold text-slate-900 mb-6">Contact Information</h3>
                  <div className="space-y-6">
                    <div className="flex items-start gap-4">
                      <div className="bg-primary text-white p-3 rounded-full flex-shrink-0">
                        <Phone className="h-6 w-6" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-900">Phone</h4>
                        <p className="text-slate-600">(555) 123-4567</p>
                        <p className="text-sm text-slate-500">Available Mon-Sat, 8AM-6PM</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-4">
                      <div className="bg-secondary text-white p-3 rounded-full flex-shrink-0">
                        <Mail className="h-6 w-6" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-900">Email</h4>
                        <p className="text-slate-600">info@ascenciocleaning.com</p>
                        <p className="text-sm text-slate-500">We'll respond within 24 hours</p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-4">
                      <div className="bg-accent text-white p-3 rounded-full flex-shrink-0">
                        <MapPin className="h-6 w-6" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-900">Service Area</h4>
                        <p className="text-slate-600">Greater Metro Area</p>
                        <p className="text-sm text-slate-500">Free quotes within 30 miles</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white shadow-lg border border-slate-200">
                <CardContent className="p-8">
                  <h3 className="text-2xl font-semibold text-slate-900 mb-6">Why Choose Us?</h3>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Shield className="text-secondary h-6 w-6" />
                      <span className="text-slate-700">Fully Licensed & Insured</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Leaf className="text-secondary h-6 w-6" />
                      <span className="text-slate-700">Eco-Friendly Products</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Clock className="text-secondary h-6 w-6" />
                      <span className="text-slate-700">Flexible Scheduling</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Heart className="text-secondary h-6 w-6" />
                      <span className="text-slate-700">100% Satisfaction Guarantee</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <h3 className="text-2xl font-bold mb-4">Ascencio Cleaning Services LLC</h3>
              <p className="text-slate-300 mb-4">Professional, reliable cleaning services for your home and business. We pride ourselves on attention to detail and customer satisfaction.</p>
              <div className="flex space-x-4">
                <a href="#" className="text-slate-300 hover:text-white transition-colors">
                  <Facebook className="h-6 w-6" />
                </a>
                <a href="#" className="text-slate-300 hover:text-white transition-colors">
                  <Instagram className="h-6 w-6" />
                </a>
              </div>
            </div>
            
            <div>
              <h4 className="text-lg font-semibold mb-4">Quick Links</h4>
              <ul className="space-y-2 text-slate-300">
                <li><button onClick={() => scrollToSection("home")} className="hover:text-white transition-colors">Home</button></li>
                <li><button onClick={() => scrollToSection("services")} className="hover:text-white transition-colors">Services</button></li>
                <li><button onClick={() => scrollToSection("gallery")} className="hover:text-white transition-colors">Our Work</button></li>
                <li><button onClick={() => scrollToSection("reviews")} className="hover:text-white transition-colors">Reviews</button></li>
                <li><button onClick={() => scrollToSection("contact")} className="hover:text-white transition-colors">Contact</button></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-lg font-semibold mb-4">Contact</h4>
              <div className="space-y-2 text-slate-300">
                <p>(555) 123-4567</p>
                <p>info@ascenciocleaning.com</p>
                <p>Greater Metro Area</p>
              </div>
            </div>
          </div>
          
          <div className="border-t border-slate-700 mt-8 pt-8 text-center text-slate-400">
            <p>&copy; 2024 Ascencio Cleaning Services LLC. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
