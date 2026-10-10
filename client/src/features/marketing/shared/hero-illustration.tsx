import { cn } from "@/lib/utils";

/**
 * Original editorial illustration: an arched window with morning light, a vase of leaves, folded
 * linens, and small sparkles. Purely decorative and clearly an illustration, not a photo of any
 * job. Static (no animation).
 */
export function HeroIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 520"
      aria-hidden="true"
      focusable="false"
      className={cn("h-auto w-full", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id="acs-hero-pane">
          <path d="M150 420V226a90 90 0 0 1 180 0v194z" />
        </clipPath>
      </defs>

      {/* Wall */}
      <rect width="480" height="520" rx="24" fill="#EFEDE4" />
      {/* Soft wall shape */}
      <path d="M0 96C80 60 150 92 220 70s150-50 260 0V0H0z" fill="#E3ECE7" opacity=".7" />

      {/* Arched window frame */}
      <path d="M128 432V226a112 112 0 0 1 224 0v206z" fill="#214F42" />
      {/* Panes with sky light */}
      <g clipPath="url(#acs-hero-pane)">
        <rect x="150" y="110" width="180" height="320" fill="#F7F6F0" />
        <circle cx="286" cy="214" r="42" fill="#D8B66A" />
        <path d="M150 330c40-22 80-26 120-14s44 10 60 4v110H150z" fill="#E3ECE7" />
        <path d="M150 360c50-18 92-16 130-4s36 8 50 2v72H150z" fill="#DCE3DD" />
      </g>
      {/* Mullions */}
      <path d="M240 136v284M150 300h180" stroke="#214F42" strokeWidth="7" strokeLinecap="round" />
      {/* Sill */}
      <rect x="110" y="424" width="260" height="16" rx="6" fill="#1A4036" />

      {/* Floor and light patch */}
      <rect y="440" width="480" height="80" fill="#DCE3DD" />
      <path d="M150 440h180l66 80H84z" fill="#F7F6F0" opacity=".85" />
      <path d="M0 496h480v24H0z" fill="#CBD6CF" />

      {/* Vase with leaves */}
      <path d="M74 440c-8-26-4-50 14-62h28c18 12 22 36 14 62z" fill="#D8B66A" />
      <path d="M88 378h28v-8H88z" fill="#B8954C" />
      <path d="M102 372c-2-40 6-78 30-104" fill="none" stroke="#214F42" strokeWidth="4" strokeLinecap="round" />
      <path d="M102 372c-6-34-22-62-48-80" fill="none" stroke="#214F42" strokeWidth="4" strokeLinecap="round" />
      <path d="M132 268c-20 4-30 22-26 40 18-4 30-20 26-40z" fill="#2F6B5A" />
      <path d="M120 300c-22 0-34 16-32 34 20 0 34-14 32-34z" fill="#214F42" />
      <path d="M54 292c18 0 30 16 28 34-18 0-30-14-28-34z" fill="#2F6B5A" />
      <path d="M76 322c16 6 22 22 16 36-16-6-22-20-16-36z" fill="#214F42" />

      {/* Folded linens */}
      <rect x="362" y="410" width="88" height="30" rx="8" fill="#FFFFFF" />
      <rect x="370" y="384" width="74" height="26" rx="8" fill="#E3ECE7" />
      <rect x="378" y="360" width="60" height="24" rx="8" fill="#FFFFFF" />
      <path d="M362 425h88M370 397h74M378 372h60" stroke="#DCE3DD" strokeWidth="2" />
      <rect x="430" y="410" width="8" height="30" fill="#D8B66A" />

      {/* Sparkles */}
      <g fill="#D8B66A">
        <path d="M392 150c2 12 6 16 18 18-12 2-16 6-18 18-2-12-6-16-18-18 12-2 16-6 18-18z" />
        <path d="M420 240c1.4 8 4 10.6 12 12-8 1.4-10.6 4-12 12-1.4-8-4-10.6-12-12 8-1.4 10.6-4 12-12z" />
        <path d="M70 170c1.4 8 4 10.6 12 12-8 1.4-10.6 4-12 12-1.4-8-4-10.6-12-12 8-1.4 10.6-4 12-12z" />
      </g>
    </svg>
  );
}
