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
  Instagram
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

export default function HomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const { toast } = useToast();

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
      element.scrollIntoView({ behavior: "smooth" });
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
            <div className="hidden md:block">
              <div className="ml-10 flex items-baseline space-x-8">
                <button onClick={() => scrollToSection("home")} className="text-slate-700 hover:text-primary px-3 py-2 text-sm font-medium transition-colors">Home</button>
                <button onClick={() => scrollToSection("services")} className="text-slate-700 hover:text-primary px-3 py-2 text-sm font-medium transition-colors">Services</button>
                <button onClick={() => scrollToSection("gallery")} className="text-slate-700 hover:text-primary px-3 py-2 text-sm font-medium transition-colors">Our Work</button>
                <button onClick={() => scrollToSection("reviews")} className="text-slate-700 hover:text-primary px-3 py-2 text-sm font-medium transition-colors">Reviews</button>
                <Button onClick={() => scrollToSection("contact")} className="bg-primary text-white hover:bg-blue-700">Book Now</Button>
              </div>
            </div>
            <div className="md:hidden">
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
              <button onClick={() => scrollToSection("home")} className="block w-full text-left px-3 py-2 text-slate-700 hover:text-primary text-sm font-medium">Home</button>
              <button onClick={() => scrollToSection("services")} className="block w-full text-left px-3 py-2 text-slate-700 hover:text-primary text-sm font-medium">Services</button>
              <button onClick={() => scrollToSection("gallery")} className="block w-full text-left px-3 py-2 text-slate-700 hover:text-primary text-sm font-medium">Our Work</button>
              <button onClick={() => scrollToSection("reviews")} className="block w-full text-left px-3 py-2 text-slate-700 hover:text-primary text-sm font-medium">Reviews</button>
              <Button onClick={() => scrollToSection("contact")} className="block mx-3 mt-2 bg-primary text-white hover:bg-blue-700 w-auto">Book Now</Button>
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
                Professional Cleaning Services You Can Trust
              </h2>
              <p className="text-xl mb-8 text-blue-100">
                Experience the difference with Ascencio Cleaning Services LLC. We provide thorough, reliable cleaning services for your home and office with attention to every detail.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  onClick={() => scrollToSection("contact")} 
                  className="bg-accent text-white hover:bg-yellow-500 px-8 py-4 text-lg font-semibold"
                >
                  Get Free Quote
                </Button>
                <Button 
                  onClick={() => scrollToSection("services")} 
                  variant="outline" 
                  className="border-2 border-white text-white bg-transparent hover:bg-white hover:text-primary px-8 py-4 text-lg font-semibold"
                >
                  Our Services
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
                    <div className="text-slate-600 text-sm">Customer Rating</div>
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
            <h2 className="text-4xl font-bold text-slate-900 mb-4">Our Cleaning Services</h2>
            <p className="text-xl text-slate-600 max-w-3xl mx-auto">We offer comprehensive cleaning solutions tailored to your needs, using eco-friendly products and professional techniques.</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="bg-slate-50 hover:shadow-lg transition-shadow border border-slate-200">
              <CardContent className="p-8">
                <div className="bg-primary text-white p-4 rounded-full w-16 h-16 flex items-center justify-center mb-6">
                  <Home className="h-8 w-8" />
                </div>
                <h3 className="text-2xl font-semibold text-slate-900 mb-4">Residential Cleaning</h3>
                <p className="text-slate-600 mb-6">Complete home cleaning services including kitchens, bathrooms, bedrooms, and living areas. Weekly, bi-weekly, or monthly options available.</p>
                <ul className="text-slate-600 space-y-2">
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-secondary rounded-full"></div>
                    Deep cleaning services
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-secondary rounded-full"></div>
                    Regular maintenance cleaning
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-secondary rounded-full"></div>
                    Move-in/move-out cleaning
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-slate-50 hover:shadow-lg transition-shadow border border-slate-200">
              <CardContent className="p-8">
                <div className="bg-secondary text-white p-4 rounded-full w-16 h-16 flex items-center justify-center mb-6">
                  <Building className="h-8 w-8" />
                </div>
                <h3 className="text-2xl font-semibold text-slate-900 mb-4">Commercial Cleaning</h3>
                <p className="text-slate-600 mb-6">Professional office and commercial space cleaning services to maintain a clean, healthy work environment for your business.</p>
                <ul className="text-slate-600 space-y-2">
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-secondary rounded-full"></div>
                    Office cleaning
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-secondary rounded-full"></div>
                    Retail space cleaning
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-secondary rounded-full"></div>
                    Post-construction cleanup
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card className="bg-slate-50 hover:shadow-lg transition-shadow border border-slate-200">
              <CardContent className="p-8">
                <div className="bg-accent text-white p-4 rounded-full w-16 h-16 flex items-center justify-center mb-6">
                  <Sparkles className="h-8 w-8" />
                </div>
                <h3 className="text-2xl font-semibold text-slate-900 mb-4">Deep Cleaning</h3>
                <p className="text-slate-600 mb-6">Thorough, detailed cleaning service that goes beyond regular maintenance to tackle hard-to-reach areas and built-up grime.</p>
                <ul className="text-slate-600 space-y-2">
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-secondary rounded-full"></div>
                    Inside appliances cleaning
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-secondary rounded-full"></div>
                    Baseboard and trim cleaning
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-secondary rounded-full"></div>
                    Window interior cleaning
                  </li>
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
            <h2 className="text-4xl font-bold text-slate-900 mb-4">Our Work in Action</h2>
            <p className="text-xl text-slate-600">See the difference our professional cleaning services make</p>
          </div>
          <Carousel />
        </div>
      </section>

      {/* Customer Reviews */}
      <section id="reviews" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-slate-900 mb-4">What Our Customers Say</h2>
            <p className="text-xl text-slate-600">Don't just take our word for it - hear from our satisfied clients</p>
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
                <h3 className="text-2xl font-semibold text-slate-900 mb-6 text-center">Leave Us a Review</h3>
                <form onSubmit={handleReviewSubmit} className="space-y-6">
                  <div>
                    <Label className="text-sm font-medium text-slate-700 mb-2">Your Rating</Label>
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
                      <Label htmlFor="review-name">Your Name</Label>
                      <Input type="text" id="review-name" name="name" required />
                    </div>
                    <div>
                      <Label htmlFor="review-email">Email</Label>
                      <Input type="email" id="review-email" name="email" required />
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="review-text">Your Review</Label>
                    <Textarea 
                      id="review-text" 
                      name="review" 
                      rows={4} 
                      required 
                      placeholder="Tell us about your experience..."
                    />
                  </div>
                  
                  <Button 
                    type="submit" 
                    className="w-full bg-primary hover:bg-blue-700"
                    disabled={submitReviewMutation.isPending}
                  >
                    {submitReviewMutation.isPending ? "Submitting..." : "Submit Review"}
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
            <h2 className="text-4xl font-bold text-slate-900 mb-4">Book Your Cleaning Service</h2>
            <p className="text-xl text-slate-600">Ready for a spotless space? Contact us today for a free quote</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12">
            {/* Contact Form */}
            <Card className="bg-white shadow-lg border border-slate-200">
              <CardContent className="p-8">
                <h3 className="text-2xl font-semibold text-slate-900 mb-6">Get Your Free Quote</h3>
                <form onSubmit={handleContactSubmit} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="first-name">First Name</Label>
                      <Input type="text" id="first-name" name="firstName" required />
                    </div>
                    <div>
                      <Label htmlFor="last-name">Last Name</Label>
                      <Input type="text" id="last-name" name="lastName" required />
                    </div>
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input type="email" id="email" name="email" required />
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone</Label>
                      <Input type="tel" id="phone" name="phone" required />
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="service-type">Service Type</Label>
                    <Select name="serviceType" required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a service" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="residential">Residential Cleaning</SelectItem>
                        <SelectItem value="commercial">Commercial Cleaning</SelectItem>
                        <SelectItem value="deep-clean">Deep Cleaning</SelectItem>
                        <SelectItem value="move-in-out">Move-in/Move-out</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="property-size">Property Size</Label>
                    <Select name="propertySize" required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">Small (1-2 bedrooms)</SelectItem>
                        <SelectItem value="medium">Medium (3-4 bedrooms)</SelectItem>
                        <SelectItem value="large">Large (5+ bedrooms)</SelectItem>
                        <SelectItem value="commercial">Commercial Space</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="preferred-date">Preferred Date</Label>
                    <Input type="date" id="preferred-date" name="preferredDate" required />
                  </div>
                  
                  <div>
                    <Label htmlFor="message">Additional Details</Label>
                    <Textarea 
                      id="message" 
                      name="message" 
                      rows={4}
                      placeholder="Tell us about any specific cleaning needs or requirements..."
                    />
                  </div>
                  
                  <Button 
                    type="submit" 
                    className="w-full bg-primary hover:bg-blue-700 py-4 text-lg font-semibold"
                    disabled={submitContactMutation.isPending}
                  >
                    {submitContactMutation.isPending ? "Submitting..." : "Request Free Quote"}
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
