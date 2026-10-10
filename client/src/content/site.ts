// Content registry for facts and media that require business verification.
// Leave arrays empty until the owner supplies verified, consented material: the UI omits empty
// sections instead of showing placeholders presented as real.

export interface VerifiedPhoto {
  /** Locally served optimized image (AVIF/WebP) in client/public/images. */
  src: string;
  width: number;
  height: number;
  alt: { en: string; es: string };
  caption: { en: string; es: string };
  /** Optional before image for a user-controlled comparison. */
  beforeSrc?: string;
  /** Confirmation that the customer consented to publication. */
  consentRecorded: true;
}

/** Project photos from real Ascencio jobs. None have been supplied yet. */
export const PROJECT_PHOTOS: VerifiedPhoto[] = [];

/**
 * Credentials shown in the evidence strip and About page (e.g. "Insured with ..."). The original site
 * claimed licensing, insurance, eco-friendly products, and a satisfaction guarantee without
 * documentation, so nothing is listed until verified.
 */
export const VERIFIED_CREDENTIALS: { en: string; es: string }[] = [];

/** Real social profiles only. */
export const SOCIAL_LINKS: { label: string; href: string }[] = [];
