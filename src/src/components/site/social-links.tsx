import { Phone } from "lucide-react";

export const SOCIAL_LINKS = [
  {
    key: "phone",
    href: "tel:+8801338125069",
    label: "Call",
    icon: PhoneIcon,
    colorClass: "text-emerald-600 hover:text-emerald-700",
  },
  {
    key: "facebook",
    href: "https://www.facebook.com/upoharkabbo",
    label: "Facebook",
    icon: FacebookIcon,
    colorClass: "text-[#1877F2] hover:text-[#0d65d9]",
  },
  {
    key: "whatsapp",
    href: "https://wa.me/8801338125069",
    label: "WhatsApp",
    icon: WhatsAppIcon,
    colorClass: "text-[#25D366] hover:text-[#128C7E]",
  },
  {
    key: "instagram",
    href: "https://www.instagram.com/upohar_kabbo",
    label: "Instagram",
    icon: InstagramIcon,
    colorClass: "",
  },
  {
    key: "tiktok",
    href: "https://www.tiktok.com/@upoharkabbo3",
    label: "TikTok",
    icon: TikTokIcon,
    colorClass: "text-[#000000] hover:text-white",
  },
];

function PhoneIcon({ className }: { className?: string }) {
  return <Phone className={className} strokeWidth={2} />;
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.33 4.95L2.05 22l5.25-1.37a9.91 9.91 0 0 0 4.74 1.2c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.66 13.38c-.24.68-1.19 1.25-1.68 1.33-.45.07-1 .1-1.61-.03-.37-.08-.85-.2-1.43-.4-2.69-.93-4.44-3.1-4.57-3.25-.13-.15-1.1-1.46-1.1-2.79 0-1.33.69-1.97.93-2.24.24-.27.53-.34.71-.34.18 0 .36 0 .52.01.17.01.39-.06.61.47.22.55.76 1.91.83 2.05.07.14.12.3.02.48-.1.18-.15.29-.29.45-.14.15-.29.32-.41.43-.12.11-.25.23-.11.45.14.22.63 1.04 1.36 1.69.93.82 1.72 1.08 2.1 1.2.25.08.43.06.59-.09.16-.15.67-.78.85-1.05.18-.27.36-.22.61-.13.25.09 1.58.74 1.85.88.27.13.45.2.52.31.06.11.06.64-.18 1.32z" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M24 12.073C24 5.403 18.627 0 12 0S0 5.403 0 12.073C0 18.098 4.388 23.093 10.125 24v-8.437H7.078v-3.49h3.047v-2.66c0-3.025 1.79-4.697 4.533-4.697 1.313 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.93-1.956 1.887v2.282h3.328l-.532 3.49h-2.796V24C19.612 23.093 24 18.098 24 12.073" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="instagramGradient" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#feda75" />
          <stop offset="25%" stopColor="#fa7e1e" />
          <stop offset="50%" stopColor="#d62976" />
          <stop offset="75%" stopColor="#962fbf" />
          <stop offset="100%" stopColor="#4f5bd5" />
        </linearGradient>
      </defs>
      <path
        fill="url(#instagramGradient)"
        d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881"
      />
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  );
}
