import { useState } from "react";
import { BookingCalendar } from "@/components/booking-calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Calendar, Clock, DollarSign, Shield, Phone } from "lucide-react";

export default function BookingPage() {
  const [showCalendar, setShowCalendar] = useState(false);
  const [bookingComplete, setBookingComplete] = useState(false);

  if (bookingComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md mx-auto text-center">
          <CardHeader>
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-green-900">Booking Confirmed!</CardTitle>
            <CardDescription>
              Thank you for choosing Ascencio Cleaning Services
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              We've received your booking request and will confirm your appointment within 2 hours.
            </p>
            <p className="text-sm text-gray-600">
              You'll receive a confirmation email with all the details shortly.
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-blue-600">
              <Phone className="h-4 w-4" />
              Questions? Call us: +1-240-355-3108
            </div>
            <Button 
              onClick={() => {
                setBookingComplete(false);
                setShowCalendar(false);
              }}
              className="w-full"
            >
              Book Another Service
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showCalendar) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">Book Your Cleaning Service</h1>
            <p className="text-slate-600">Schedule your appointment in just a few steps</p>
          </div>
          
          <BookingCalendar onBookingComplete={() => setBookingComplete(true)} />
          
          <div className="text-center mt-8">
            <Button variant="outline" onClick={() => setShowCalendar(false)}>
              ← Back to Service Info
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Book Your Cleaning Service
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Professional cleaning services in the DMV area. Easy online booking with instant confirmation.
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <Card className="text-center">
            <CardContent className="pt-6">
              <Calendar className="h-12 w-12 text-blue-600 mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Easy Scheduling</h3>
              <p className="text-sm text-gray-600">Pick your preferred date and time from available slots</p>
            </CardContent>
          </Card>
          
          <Card className="text-center">
            <CardContent className="pt-6">
              <Clock className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Flexible Hours</h3>
              <p className="text-sm text-gray-600">Monday-Friday, 8AM-6PM to fit your schedule</p>
            </CardContent>
          </Card>
          
          <Card className="text-center">
            <CardContent className="pt-6">
              <DollarSign className="h-12 w-12 text-yellow-600 mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Transparent Pricing</h3>
              <p className="text-sm text-gray-600">See estimated costs upfront before booking</p>
            </CardContent>
          </Card>
          
          <Card className="text-center">
            <CardContent className="pt-6">
              <Shield className="h-12 w-12 text-purple-600 mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Insured & Bonded</h3>
              <p className="text-sm text-gray-600">Fully licensed, insured, and background-checked team</p>
            </CardContent>
          </Card>
        </div>

        {/* Services */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          <Card>
            <CardHeader>
              <CardTitle>Residential Services</CardTitle>
              <CardDescription>Professional home cleaning services</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                <li className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Standard Cleaning (3 hours) - From $120</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Deep Cleaning (5 hours) - From $200</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Move-in/Move-out (6 hours) - From $250</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Post-Construction (8 hours) - From $350</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Commercial Services</CardTitle>
              <CardDescription>Office and business cleaning solutions</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                <li className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Office Cleaning (4 hours) - From $150</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Medical Facility Cleaning</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Retail Space Cleaning</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Regular Maintenance Plans</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle>Ready to Book Your Service?</CardTitle>
              <CardDescription>
                Get started with our easy 3-step booking process
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 text-sm">
                <div className="text-center">
                  <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-2 font-semibold">
                    1
                  </div>
                  <p>Choose Date & Time</p>
                </div>
                <div className="text-center">
                  <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-2 font-semibold">
                    2
                  </div>
                  <p>Enter Service Details</p>
                </div>
                <div className="text-center">
                  <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-2 font-semibold">
                    3
                  </div>
                  <p>Confirm Booking</p>
                </div>
              </div>
              
              <Button 
                onClick={() => setShowCalendar(true)}
                size="lg"
                className="w-full md:w-auto"
              >
                Start Booking Process
              </Button>
              
              <p className="text-sm text-gray-500 mt-4">
                Need help? Call us at <span className="font-semibold">+1-240-355-3108</span>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}