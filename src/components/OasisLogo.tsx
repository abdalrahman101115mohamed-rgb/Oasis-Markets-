import React from 'react';

interface OasisLogoProps {
  size?: number;
  className?: string;
}

export const OasisLogo: React.FC<OasisLogoProps> = ({ size = 40, className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="64" height="64" rx="16" fill="#15803D" />
      <rect x="3" y="3" width="58" height="58" rx="13" stroke="#D4AF37" strokeOpacity="0.45" strokeWidth="1.5" />
      {/* Stylized oasis palm leaves */}
      <path
        d="M32 45V26"
        stroke="#D4AF37"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M32 26C32 19 24 14 16 16C20 22 25 26 32 26Z"
        fill="#FFFFFF"
      />
      <path
        d="M32 26C32 19 40 14 48 16C44 22 39 26 32 26Z"
        fill="#FFFFFF"
      />
      <path
        d="M32 25C29 17 31 11 32 10C33 11 35 17 32 25Z"
        fill="#D4AF37"
      />
      {/* Gentle oasis arc */}
      <path
        d="M17 48C21.5 44.5 26.5 43 32 43C37.5 43 42.5 44.5 47 48"
        stroke="#D4AF37"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
};
