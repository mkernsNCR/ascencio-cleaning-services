import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertContactRequestSchema, insertReviewSchema, insertBookingSchema } from "@shared/schema";
import { z } from "zod";
import { sendReviewNotification, sendContactNotification, sendBookingNotification, sendBookingConfirmation, sendBookingRejection } from "./email";

// Helper functions for formatting
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric'
  });
}

function formatTime(timeString: string): string {
  const [hours, minutes] = timeString.split(':');
  const hour24 = parseInt(hours, 10);
  const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  return `${hour12}:${minutes} ${ampm}`;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Get approved reviews
  app.get("/api/reviews", async (req, res) => {
    try {
      const reviews = await storage.getApprovedReviews();
      res.json(reviews);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch reviews" });
    }
  });

  // Submit a new review
  app.post("/api/reviews", async (req, res) => {
    try {
      const reviewData = insertReviewSchema.parse(req.body);
      const review = await storage.createReview(reviewData);
      
      // Send email notification
      const emailSent = await sendReviewNotification(review);
      if (!emailSent) {
        console.warn('Failed to send review notification email');
      }
      
      res.status(201).json({ message: "Review submitted successfully. It will be published after moderation.", review });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid review data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to submit review" });
      }
    }
  });

  // Submit a contact request
  app.post("/api/contact", async (req, res) => {
    try {
      const contactData = insertContactRequestSchema.parse(req.body);
      const request = await storage.createContactRequest(contactData);
      
      // Send email notification
      const emailSent = await sendContactNotification(request);
      if (!emailSent) {
        console.warn('Failed to send contact notification email');
      }
      
      res.status(201).json({ message: "Your request has been submitted successfully. We will contact you within 24 hours.", request });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid contact data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to submit contact request" });
      }
    }
  });

  // Get contact requests (for admin use)
  app.get("/api/contact", async (req, res) => {
    try {
      const requests = await storage.getContactRequests();
      res.json(requests);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch contact requests" });
    }
  });

  // Approve review via email link
  app.get("/api/reviews/:id/approve", async (req, res) => {
    try {
      const reviewId = parseInt(req.params.id);
      const review = await storage.approveReview(reviewId);
      
      if (!review) {
        return res.status(404).send(`
          <html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2 style="color: #dc2626;">Review Not Found</h2>
            <p>The review you're trying to approve could not be found.</p>
          </body></html>
        `);
      }
      
      res.send(`
        <html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2 style="color: #16a34a;">✓ Review Approved!</h2>
          <p>The review from <strong>${review.name}</strong> has been approved and is now live on your website.</p>
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px auto; max-width: 500px;">
            <p><strong>Rating:</strong> ${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)} (${review.rating}/5)</p>
            <blockquote style="background: white; padding: 15px; border-left: 4px solid #1e40af; margin: 10px 0;">
              ${review.review}
            </blockquote>
          </div>
          <p><a href="/" style="color: #1e40af;">← Back to Website</a></p>
        </body></html>
      `);
    } catch (error) {
      res.status(500).send(`
        <html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2 style="color: #dc2626;">Error</h2>
          <p>Failed to approve review. Please try again.</p>
        </body></html>
      `);
    }
  });

  // Decline review via email link
  app.get("/api/reviews/:id/decline", async (req, res) => {
    try {
      const reviewId = parseInt(req.params.id);
      const success = await storage.deleteReview(reviewId);
      
      if (!success) {
        return res.status(404).send(`
          <html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2 style="color: #dc2626;">Review Not Found</h2>
            <p>The review you're trying to decline could not be found.</p>
          </body></html>
        `);
      }
      
      res.send(`
        <html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2 style="color: #dc2626;">✗ Review Declined</h2>
          <p>The review has been declined and will not appear on your website.</p>
          <p><a href="/" style="color: #1e40af;">← Back to Website</a></p>
        </body></html>
      `);
    } catch (error) {
      res.status(500).send(`
        <html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2 style="color: #dc2626;">Error</h2>
          <p>Failed to decline review. Please try again.</p>
        </body></html>
      `);
    }
  });

  // Create a new booking
  app.post("/api/bookings", async (req, res) => {
    try {
      const bookingData = insertBookingSchema.parse(req.body);
      const booking = await storage.createBooking(bookingData);
      
      // Send email notification
      console.log('Sending booking notification email...');
      const emailSent = await sendBookingNotification(booking);
      if (emailSent) {
        console.log('✅ Booking notification email sent successfully');
      } else {
        console.warn('❌ Failed to send booking notification email');
      }
      
      res.status(201).json({ 
        message: "Booking submitted successfully. We'll confirm your appointment within 2 hours.", 
        booking 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid booking data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create booking" });
      }
    }
  });

  // Get available time slots for a specific date
  app.get("/api/bookings/availability/:date", async (req, res) => {
    try {
      const date = req.params.date;
      const availableSlots = await storage.getAvailableTimeSlots(date);
      res.json({ date, availableSlots });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch availability" });
    }
  });

  // Get all bookings (admin use)
  app.get("/api/bookings", async (req, res) => {
    try {
      const bookings = await storage.getBookings();
      res.json(bookings);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  });

  // Update booking status (confirm/cancel)
  app.patch("/api/bookings/:id/status", async (req, res) => {
    try {
      const bookingId = parseInt(req.params.id);
      const { status } = req.body;
      
      if (!['pending', 'confirmed', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      
      const booking = await storage.updateBookingStatus(bookingId, status);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      
      res.json({ message: "Booking status updated", booking });
    } catch (error) {
      res.status(500).json({ message: "Failed to update booking status" });
    }
  });

  // Approve booking via email link
  app.get("/api/bookings/:id/approve", async (req, res) => {
    try {
      const bookingId = parseInt(req.params.id);
      const booking = await storage.updateBookingStatus(bookingId, 'confirmed');
      
      if (!booking) {
        return res.send(`
          <html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2 style="color: #dc2626;">Booking Not Found</h2>
            <p>The booking you're trying to approve could not be found.</p>
          </body></html>
        `);
      }
      
      // Send confirmation email to customer
      const emailSent = await sendBookingConfirmation(booking);
      if (!emailSent) {
        console.warn('Failed to send booking confirmation email to customer');
      }

      res.send(`
        <html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2 style="color: #16a34a;">✓ Booking Approved</h2>
          <p>The booking for <strong>${booking.firstName} ${booking.lastName}</strong> on <strong>${formatDate(booking.date)} at ${formatTime(booking.time)}</strong> has been confirmed.</p>
          <p>Customer has been notified via email.</p>
          <p><a href="/" style="color: #1e40af;">← Back to Website</a></p>
        </body></html>
      `);
    } catch (error) {
      res.status(500).send(`
        <html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2 style="color: #dc2626;">Error</h2>
          <p>Failed to approve booking. Please try again.</p>
        </body></html>
      `);
    }
  });

  // Reject booking via email link
  app.get("/api/bookings/:id/reject", async (req, res) => {
    try {
      const bookingId = parseInt(req.params.id);
      const booking = await storage.updateBookingStatus(bookingId, 'cancelled');
      
      if (!booking) {
        return res.send(`
          <html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2 style="color: #dc2626;">Booking Not Found</h2>
            <p>The booking you're trying to reject could not be found.</p>
          </body></html>
        `);
      }
      
      // Send rejection email to customer
      const emailSent = await sendBookingRejection(booking);
      if (!emailSent) {
        console.warn('Failed to send booking rejection email to customer');
      }

      res.send(`
        <html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2 style="color: #dc2626;">✗ Booking Rejected</h2>
          <p>The booking for <strong>${booking.firstName} ${booking.lastName}</strong> on <strong>${formatDate(booking.date)} at ${formatTime(booking.time)}</strong> has been cancelled.</p>
          <p>Customer has been notified via email.</p>
          <p><a href="/" style="color: #1e40af;">← Back to Website</a></p>
        </body></html>
      `);
    } catch (error) {
      res.status(500).send(`
        <html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2 style="color: #dc2626;">Error</h2>
          <p>Failed to reject booking. Please try again.</p>
        </body></html>
      `);
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
