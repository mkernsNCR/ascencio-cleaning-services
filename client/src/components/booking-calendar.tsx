import React, { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Clock, MapPin, Phone, Mail, User } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { InsertBooking } from "@shared/schema";

interface BookingCalendarProps {
  onBookingComplete?: () => void;
}

interface BookingForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  serviceType: string;
  propertySize: string;
  address: string;
  time: string;
  duration: number;
  notes: string;
}

const serviceTypes = [
  { name: "Standard Cleaning", duration: 3, basePrice: 120 },
  { name: "Deep Cleaning", duration: 5, basePrice: 200 },
  { name: "Move-in/Move-out", duration: 6, basePrice: 250 },
  { name: "Post-Construction", duration: 8, basePrice: 350 },
  { name: "Office Cleaning", duration: 4, basePrice: 150 }
];

const propertySizes = [
  { name: "Studio/1BR", multiplier: 1 },
  { name: "2 Bedroom", multiplier: 1.3 },
  { name: "3 Bedroom", multiplier: 1.6 },
  { name: "4+ Bedroom", multiplier: 2 },
  { name: "Small Office", multiplier: 1.2 },
  { name: "Large Office", multiplier: 1.8 }
];

export function BookingCalendar({ onBookingComplete }: BookingCalendarProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [currentStep, setCurrentStep] = useState<'date' | 'time' | 'details'>('date');
  const [formData, setFormData] = useState<BookingForm>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    serviceType: "",
    propertySize: "",
    address: "",
    time: "",
    duration: 3,
    notes: ""
  });

  const queryClient = useQueryClient();

  // Get available time slots for selected date
  const { data: availability, isLoading: loadingSlots } = useQuery({
    queryKey: ['/api/bookings/availability', selectedDate?.toISOString().split('T')[0]],
    queryFn: async () => {
      if (!selectedDate) return null;
      const dateStr = selectedDate.toISOString().split('T')[0];
      const response = await fetch(`/api/bookings/availability/${dateStr}`);
      if (!response.ok) throw new Error('Failed to fetch availability');
      return response.json();
    },
    enabled: !!selectedDate && currentStep === 'time'
  });

  // Create booking mutation
  const createBookingMutation = useMutation({
    mutationFn: async (data: InsertBooking) => {
      const response = await fetch("/api/bookings", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" }
      });
      if (!response.ok) throw new Error('Failed to create booking');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bookings'] });
      onBookingComplete?.();
      setCurrentStep('date');
      setSelectedDate(undefined);
      setSelectedTime("");
      setFormData({
        firstName: "", lastName: "", email: "", phone: "",
        serviceType: "", propertySize: "", address: "",
        time: "", duration: 3, notes: ""
      });
    }
  });

  const calculatePrice = () => {
    const service = serviceTypes.find(s => s.name === formData.serviceType);
    const size = propertySizes.find(s => s.name === formData.propertySize);
    if (!service || !size) return 0;
    return Math.round(service.basePrice * size.multiplier);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(':');
    const hour24 = parseInt(hours, 10);
    const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
    const ampm = hour24 >= 12 ? 'PM' : 'AM';
    return `${hour12}:${minutes} ${ampm}`;
  };

  const handleServiceChange = (serviceType: string) => {
    const service = serviceTypes.find(s => s.name === serviceType);
    setFormData(prev => ({
      ...prev,
      serviceType,
      duration: service?.duration || 3
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !selectedTime) return;

    const bookingData: InsertBooking = {
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      phone: formData.phone,
      serviceType: formData.serviceType,
      propertySize: formData.propertySize,
      address: formData.address,
      date: selectedDate.toISOString().split('T')[0],
      time: selectedTime,
      duration: formData.duration,
      estimatedPrice: calculatePrice() * 100, // Convert to cents
      notes: formData.notes || null
    };

    createBookingMutation.mutate(bookingData);
  };

  // Step 1: Date Selection
  if (currentStep === 'date') {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Select a Date
          </CardTitle>
          <CardDescription>
            Choose your preferred cleaning date
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            disabled={(date) => 
              date < new Date() || 
              date.getDay() === 0 || 
              date.getDay() === 6
            }
            className="rounded-md border"
          />
          {selectedDate && (
            <div className="mt-4 space-y-2">
              <div className="text-sm font-medium">
                Selected: {formatDate(selectedDate)}
              </div>
              <Button 
                onClick={() => setCurrentStep('time')}
                className="w-full"
              >
                Choose Time
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Step 2: Time Selection
  if (currentStep === 'time') {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Select Time
          </CardTitle>
          <CardDescription>
            {selectedDate && formatDate(selectedDate)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingSlots ? (
            <div className="text-center py-4">Loading available times...</div>
          ) : availability?.availableSlots && availability.availableSlots.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {availability.availableSlots.map((time: string) => (
                <Button
                  key={time}
                  variant={selectedTime === time ? "default" : "outline"}
                  onClick={() => setSelectedTime(time)}
                  className="text-sm"
                >
                  {formatTime(time)}
                </Button>
              ))}
            </div>
          ) : availability ? (
            <div className="text-center py-4 text-gray-500">
              No available times for this date
            </div>
          ) : null}

          <div className="flex gap-2 pt-4">
            <Button 
              variant="outline" 
              onClick={() => setCurrentStep('date')}
              className="flex-1"
            >
              Back
            </Button>
            {selectedTime && (
              <Button 
                onClick={() => setCurrentStep('details')}
                className="flex-1"
              >
                Continue
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Step 3: Booking Details
  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Booking Details</CardTitle>
        <CardDescription>
          {selectedDate && formatDate(selectedDate)} at {selectedTime && formatTime(selectedTime)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">First Name</label>
              <input
                type="text"
                required
                value={formData.firstName}
                onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Last Name</label>
              <input
                type="text"
                required
                value={formData.lastName}
                onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Email</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Phone</label>
              <input
                type="tel"
                required
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Service Address</label>
            <input
              type="text"
              required
              placeholder="Full address where cleaning will take place"
              value={formData.address}
              onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Service Type</label>
              <select
                required
                value={formData.serviceType}
                onChange={(e) => handleServiceChange(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Select service type</option>
                {serviceTypes.map(service => (
                  <option key={service.name} value={service.name}>
                    {service.name} ({service.duration}h)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Property Size</label>
              <select
                required
                value={formData.propertySize}
                onChange={(e) => setFormData(prev => ({ ...prev, propertySize: e.target.value }))}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Select property size</option>
                {propertySizes.map(size => (
                  <option key={size.name} value={size.name}>
                    {size.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Additional Notes (Optional)</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Any special instructions or requests..."
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md h-20"
            />
          </div>

          {formData.serviceType && formData.propertySize && (
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="font-semibold text-blue-900">
                Estimated Price: ${calculatePrice()}
              </div>
              <div className="text-sm text-blue-700">
                Duration: {formData.duration} hours • Final price confirmed before service
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button 
              type="button"
              variant="outline" 
              onClick={() => setCurrentStep('time')}
              className="flex-1"
            >
              Back
            </Button>
            <Button 
              type="submit"
              disabled={createBookingMutation.isPending}
              className="flex-1"
            >
              {createBookingMutation.isPending ? "Booking..." : "Book Service"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}