import { 
  users, 
  contactRequests,
  reviews,
  bookings,
  type User, 
  type InsertUser,
  type ContactRequest,
  type InsertContactRequest,
  type Review,
  type InsertReview,
  type Booking,
  type InsertBooking
} from "@shared/schema";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  createContactRequest(request: InsertContactRequest): Promise<ContactRequest>;
  getContactRequests(): Promise<ContactRequest[]>;
  
  createReview(review: InsertReview): Promise<Review>;
  getApprovedReviews(): Promise<Review[]>;
  getAllReviews(): Promise<Review[]>;
  approveReview(id: number): Promise<Review | undefined>;
  deleteReview(id: number): Promise<boolean>;
  
  createBooking(booking: InsertBooking): Promise<Booking>;
  getBookings(): Promise<Booking[]>;
  getBookingsByDate(date: string): Promise<Booking[]>;
  updateBookingStatus(id: number, status: string): Promise<Booking | undefined>;
  getAvailableTimeSlots(date: string): Promise<string[]>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private contactRequests: Map<number, ContactRequest>;
  private reviews: Map<number, Review>;
  private currentUserId: number;
  private currentContactRequestId: number;
  private currentReviewId: number;

  constructor() {
    this.users = new Map();
    this.contactRequests = new Map();
    this.reviews = new Map();
    this.currentUserId = 1;
    this.currentContactRequestId = 1;
    this.currentReviewId = 1;
    
    // Add some sample approved reviews
    this.createReview({
      name: "Sarah Johnson",
      email: "sarah@example.com",
      rating: 5,
      review: "Exceptional service! The team was professional, thorough, and left my home spotless. I've been using Ascencio Cleaning Services for 6 months now and couldn't be happier."
    }).then(review => {
      review.approved = true;
      this.reviews.set(review.id, review);
    });
    
    this.createReview({
      name: "Michael Rodriguez",
      email: "michael@example.com",
      rating: 5,
      review: "Outstanding commercial cleaning service for our office. The team is reliable, efficient, and pays attention to every detail. Highly recommend for any business."
    }).then(review => {
      review.approved = true;
      this.reviews.set(review.id, review);
    });
    
    this.createReview({
      name: "Emily Chen",
      email: "emily@example.com",
      rating: 5,
      review: "Amazing deep cleaning service! They transformed my home and the attention to detail was incredible. Will definitely use their services again."
    }).then(review => {
      review.approved = true;
      this.reviews.set(review.id, review);
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createContactRequest(insertRequest: InsertContactRequest): Promise<ContactRequest> {
    const id = this.currentContactRequestId++;
    const request: ContactRequest = { 
      id,
      firstName: insertRequest.firstName,
      lastName: insertRequest.lastName,
      email: insertRequest.email,
      phone: insertRequest.phone,
      serviceType: insertRequest.serviceType,
      propertySize: insertRequest.propertySize,
      preferredDate: insertRequest.preferredDate,
      message: insertRequest.message ?? null
    };
    this.contactRequests.set(id, request);
    return request;
  }

  async getContactRequests(): Promise<ContactRequest[]> {
    return Array.from(this.contactRequests.values());
  }

  async createReview(insertReview: InsertReview): Promise<Review> {
    const id = this.currentReviewId++;
    const review: Review = { ...insertReview, id, approved: false };
    this.reviews.set(id, review);
    return review;
  }

  async getApprovedReviews(): Promise<Review[]> {
    return Array.from(this.reviews.values()).filter(review => review.approved);
  }

  async getAllReviews(): Promise<Review[]> {
    return Array.from(this.reviews.values());
  }

  async approveReview(id: number): Promise<Review | undefined> {
    const review = this.reviews.get(id);
    if (review) {
      review.approved = true;
      this.reviews.set(id, review);
    }
    return review;
  }

  async deleteReview(id: number): Promise<boolean> {
    return this.reviews.delete(id);
  }
}

export const storage = new MemStorage();
