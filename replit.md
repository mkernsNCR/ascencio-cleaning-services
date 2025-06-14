# Ascencio Cleaning Services - Full Stack Web Application

## Overview

This is a modern full-stack web application for Ascencio Cleaning Services LLC, a professional cleaning company. The application features a bilingual (English/Spanish) responsive website with customer interaction capabilities including service booking and review submissions.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized production builds
- **Styling**: Tailwind CSS with custom design system
- **UI Components**: shadcn/ui component library with Radix UI primitives
- **State Management**: TanStack React Query for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Forms**: React Hook Form with Zod validation

### Backend Architecture
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js for REST API
- **Database**: PostgreSQL with Drizzle ORM
- **Database Provider**: Neon Database (serverless PostgreSQL)
- **Validation**: Zod schemas for request/response validation
- **Session Management**: Connect-pg-simple for PostgreSQL session storage

### Development Setup
- **Development Server**: tsx for TypeScript execution
- **Hot Reload**: Vite HMR for frontend, nodemon-like behavior for backend
- **Build Process**: Vite for frontend bundling, esbuild for backend compilation
- **Type Safety**: Shared TypeScript schemas between frontend and backend

## Key Components

### Database Schema (`shared/schema.ts`)
- **Users Table**: Basic user authentication system
- **Contact Requests Table**: Customer service inquiries and booking requests
- **Reviews Table**: Customer reviews with approval system

### API Endpoints (`server/routes.ts`)
- `GET /api/reviews` - Fetch approved customer reviews
- `POST /api/reviews` - Submit new customer review (requires moderation)
- `POST /api/contact` - Submit service booking/contact request
- `GET /api/contact` - Retrieve contact requests (admin functionality)

### Frontend Pages
- **Home Page** (`client/src/pages/home.tsx`): Main landing page with services, reviews, and contact form
- **404 Page** (`client/src/pages/not-found.tsx`): Error handling for invalid routes

### Custom Components
- **Carousel** (`client/src/components/carousel.tsx`): Image gallery for showcasing work
- **Star Rating** (`client/src/components/star-rating.tsx`): Interactive rating component
- **UI Components**: Complete shadcn/ui component library implementation

## Data Flow

1. **Customer Interaction**: Users visit the website and can view services, read reviews, and submit contact requests
2. **Form Submission**: Contact forms and review submissions are validated client-side with Zod schemas
3. **API Processing**: Express.js backend processes requests, validates data, and stores in PostgreSQL
4. **Review Moderation**: Reviews are stored with `approved: false` by default, requiring manual approval
5. **Data Retrieval**: Frontend fetches approved reviews and displays them using React Query

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless**: Serverless PostgreSQL connection for Neon Database
- **drizzle-orm**: Type-safe database ORM with PostgreSQL dialect
- **@tanstack/react-query**: Server state management and caching
- **react-hook-form**: Form handling with validation
- **zod**: Runtime type validation and schema definition

### UI Dependencies
- **@radix-ui/***: Headless UI primitives for accessibility
- **tailwindcss**: Utility-first CSS framework
- **class-variance-authority**: Type-safe variant API for components
- **lucide-react**: Modern icon library

### Development Dependencies
- **tsx**: TypeScript execution for development
- **esbuild**: Fast JavaScript bundler for production backend
- **vite**: Frontend build tool and development server

## Deployment Strategy

### Replit Configuration
- **Environment**: Node.js 20, Web, PostgreSQL 16 modules
- **Development**: `npm run dev` - starts both frontend and backend in development mode
- **Production Build**: `npm run build` - builds frontend assets and backend bundle
- **Production Start**: `npm run start` - runs compiled production server
- **Database**: `npm run db:push` - applies schema changes to PostgreSQL

### Environment Variables
- `DATABASE_URL`: PostgreSQL connection string (required)
- `NODE_ENV`: Environment setting (development/production)

### Build Process
1. Frontend assets built with Vite to `dist/public`
2. Backend compiled with esbuild to `dist/index.js`
3. Static files served from built frontend
4. Express server handles API routes and serves SPA

### Scaling Considerations
- Autoscale deployment target configured in Replit
- PostgreSQL connection pooling through Neon Database
- Static asset optimization through Vite build process
- Session storage in PostgreSQL for horizontal scaling

## Changelog

```
Changelog:
- June 14, 2025. Initial setup
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
```