import React from 'react';

interface LogoMarkProps {
  size?: number;
  className?: string;
}

/**
 * Original PDFNestly geometric document symbol:
 * - Premium dark red (#B91C1C) rounded precision container
 * - Crisp white folded-page silhouette with subtle nested depth
 * - Precision vector node detail representing document engineering & editing
 */
export function PdfNestlyMark({ size = 28, className = '' }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <rect width="32" height="32" rx="8" fill="#B91C1C" />
      {/* Subtle nested sheet behind primary document */}
      <path
        d="M7.5 10.5C7.5 9.67157 8.17157 9 9 9H19.5V24.5C19.5 25.3284 18.8284 26 18 26H9C8.17157 26 7.5 25.3284 7.5 24.5V10.5Z"
        fill="#FFFFFF"
        fillOpacity="0.22"
      />
      {/* Primary folded document silhouette */}
      <path
        d="M10 7.5C10 6.67157 10.6716 6 11.5 6H18.3787C18.9091 6 19.4178 6.21071 19.7929 6.58579L23.9142 10.7071C24.2893 11.0822 24.5 11.5909 24.5 12.1213V23.5C24.5 24.3284 23.8284 25 23 25H11.5C10.6716 25 10 24.3284 10 23.5V7.5Z"
        fill="#B91C1C"
        stroke="#FFFFFF"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      {/* Folded top-right page corner */}
      <path
        d="M18.5 6.5V11C18.5 11.5523 18.9477 12 19.5 12H24"
        stroke="#FFFFFF"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Precision editing rule & vector node */}
      <path
        d="M13 16H20.5M13 19.5H17.25"
        stroke="#FFFFFF"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <rect x="18.75" y="18" width="3" height="3" rx="0.75" fill="#FFFFFF" />
    </svg>
  );
}

interface PdfNestlyLogoProps {
  iconSize?: number;
  showWordmark?: boolean;
  forceDarkText?: boolean;
  className?: string;
}

export function PdfNestlyLogo({
  iconSize = 28,
  showWordmark = true,
  forceDarkText = false,
  className = '',
}: PdfNestlyLogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <PdfNestlyMark size={iconSize} />
      {showWordmark && (
        <span
          className={`text-lg font-bold tracking-tight leading-none ${
            forceDarkText
              ? 'text-[#FAFAFA]'
              : 'text-[#18181B] dark:text-[#FAFAFA]'
          }`}
        >
          PDF<span className="text-[#B91C1C] dark:text-[#EF4444]">Nestly</span>
        </span>
      )}
    </span>
  );
}
