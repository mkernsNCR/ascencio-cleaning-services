import nodemailer from 'nodemailer';
import type { Review, Booking } from '../shared/schema';

// Gmail SMTP configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'ascenciocleaning@gmail.com',
    pass: process.env.GMAIL_APP_PASSWORD || 'your-app-password-here'
  }
});

const BUSINESS_EMAIL = 'ascenciocleaning@gmail.com';
const BASE_URL = process.env.NODE_ENV === 'production' 
  ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
  : 'http://localhost:5000';

export async function sendReviewNotification(review: Review): Promise<boolean> {
  try {
    const approveUrl = `${BASE_URL}/api/reviews/${review.id}/approve`;
    const declineUrl = `${BASE_URL}/api/reviews/${review.id}/decline`;
    
    const starRating = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
    
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1e40af;">New Customer Review Submitted</h2>
        
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Review Details</h3>
          <p><strong>Customer:</strong> ${review.name}</p>
          <p><strong>Email:</strong> ${review.email}</p>
          <p><strong>Rating:</strong> ${starRating} (${review.rating}/5)</p>
          <p><strong>Review:</strong></p>
          <blockquote style="background: white; padding: 15px; border-left: 4px solid #1e40af; margin: 10px 0;">
            ${review.review}
          </blockquote>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${approveUrl}" 
             style="background: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 0 10px; display: inline-block;">
            ✓ Approve Review
          </a>
          <a href="${declineUrl}" 
             style="background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 0 10px; display: inline-block;">
            ✗ Decline Review
          </a>
        </div>
        
        <p style="color: #64748b; font-size: 14px;">
          Click the buttons above to approve or decline this review. Once approved, it will appear on your website.
        </p>
        
        <hr style="border: 1px solid #e2e8f0; margin: 20px 0;">
        <p style="color: #64748b; font-size: 12px;">
          This notification was sent for Ascencio Cleaning Services LLC
        </p>
      </div>
    `;

    const emailText = `
New Customer Review Submitted

Customer: ${review.name}
Email: ${review.email}
Rating: ${review.rating}/5 stars
Review: ${review.review}

To approve this review, visit: ${approveUrl}
To decline this review, visit: ${declineUrl}

Once approved, the review will appear on your website.
    `;

    await transporter.sendMail({
      to: BUSINESS_EMAIL,
      from: BUSINESS_EMAIL,
      subject: `New Review: ${review.rating}⭐ from ${review.name}`,
      text: emailText,
      html: emailHtml,
    });

    return true;
  } catch (error) {
    console.error('Failed to send review notification:', error);
    return false;
  }
}

export async function sendContactNotification(contact: any): Promise<boolean> {
  try {
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1e40af;">New Service Request</h2>
        
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Contact Details</h3>
          <p><strong>Name:</strong> ${contact.firstName} ${contact.lastName}</p>
          <p><strong>Email:</strong> ${contact.email}</p>
          <p><strong>Phone:</strong> ${contact.phone}</p>
          <p><strong>Service Type:</strong> ${contact.serviceType}</p>
          <p><strong>Property Size:</strong> ${contact.propertySize}</p>
          <p><strong>Preferred Date:</strong> ${contact.preferredDate}</p>
          ${contact.message ? `<p><strong>Message:</strong></p><blockquote style="background: white; padding: 15px; border-left: 4px solid #1e40af; margin: 10px 0;">${contact.message}</blockquote>` : ''}
        </div>
        
        <p style="color: #64748b; font-size: 14px;">
          Contact this customer to schedule their cleaning service.
        </p>
        
        <hr style="border: 1px solid #e2e8f0; margin: 20px 0;">
        <p style="color: #64748b; font-size: 12px;">
          This notification was sent for Ascencio Cleaning Services LLC
        </p>
      </div>
    `;

    const emailText = `
New Service Request

Name: ${contact.firstName} ${contact.lastName}
Email: ${contact.email}
Phone: ${contact.phone}
Service Type: ${contact.serviceType}
Property Size: ${contact.propertySize}
Preferred Date: ${contact.preferredDate}
${contact.message ? `Message: ${contact.message}` : ''}

Contact this customer to schedule their cleaning service.
    `;

    await transporter.sendMail({
      to: BUSINESS_EMAIL,
      from: BUSINESS_EMAIL,
      subject: `New Service Request from ${contact.firstName} ${contact.lastName}`,
      text: emailText,
      html: emailHtml,
    });

    return true;
  } catch (error) {
    console.error('Failed to send contact notification:', error);
    return false;
  }
}

export async function sendBookingNotification(booking: Booking): Promise<boolean> {
  try {
    const formatPrice = (cents: number) => {
      return `$${(cents / 100).toFixed(2)}`;
    };

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1e40af;">New Booking Request</h2>
        
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Booking Details</h3>
          <p><strong>Customer:</strong> ${booking.firstName} ${booking.lastName}</p>
          <p><strong>Email:</strong> ${booking.email}</p>
          <p><strong>Phone:</strong> ${booking.phone}</p>
          <p><strong>Service:</strong> ${booking.serviceType}</p>
          <p><strong>Property Size:</strong> ${booking.propertySize}</p>
          <p><strong>Address:</strong> ${booking.address}</p>
          <p><strong>Date & Time:</strong> ${booking.date} at ${booking.time}</p>
          <p><strong>Duration:</strong> ${booking.duration} hours</p>
          <p><strong>Estimated Price:</strong> ${formatPrice(booking.estimatedPrice || 0)}</p>
          ${booking.notes ? `<p><strong>Notes:</strong></p><blockquote style="background: white; padding: 15px; border-left: 4px solid #1e40af; margin: 10px 0;">${booking.notes}</blockquote>` : ''}
        </div>
        
        <div style="background: #fef3c7; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b;">
          <p style="margin: 0; color: #92400e;">
            <strong>⏰ Action Required:</strong> Please confirm this booking within 2 hours by contacting the customer.
          </p>
        </div>
        
        <p style="color: #64748b; font-size: 14px; margin-top: 20px;">
          Contact the customer to confirm the appointment and provide any additional details about the service.
        </p>
        
        <hr style="border: 1px solid #e2e8f0; margin: 20px 0;">
        <p style="color: #64748b; font-size: 12px;">
          This notification was sent for Ascencio Cleaning Services LLC
        </p>
      </div>
    `;

    const emailText = `
New Booking Request

Customer: ${booking.firstName} ${booking.lastName}
Email: ${booking.email}
Phone: ${booking.phone}
Service: ${booking.serviceType}
Property Size: ${booking.propertySize}
Address: ${booking.address}
Date & Time: ${booking.date} at ${booking.time}
Duration: ${booking.duration} hours
Estimated Price: ${formatPrice(booking.estimatedPrice || 0)}
${booking.notes ? `Notes: ${booking.notes}` : ''}

Please confirm this booking within 2 hours by contacting the customer.
    `;

    await transporter.sendMail({
      to: BUSINESS_EMAIL,
      from: BUSINESS_EMAIL,
      subject: `New Booking: ${booking.date} at ${booking.time} - ${booking.firstName} ${booking.lastName}`,
      text: emailText,
      html: emailHtml,
    });

    return true;
  } catch (error) {
    console.error('Failed to send booking notification:', error);
    return false;
  }
}