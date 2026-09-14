export function Logo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="50,5 38,16 38,28 62,28 62,16" fill="white" opacity="0.95"/>
      <rect x="44" y="18" width="12" height="10" rx="0.5" fill="#0C1A2E"/>
      <line x1="38" y1="20" x2="18" y2="42" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="62" y1="20" x2="82" y2="42" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="13" cy="48" r="11" fill="white"/>
      <text x="13" y="53" textAnchor="middle" fill="#0C1A2E" fontSize="11" fontFamily="Inter,sans-serif" fontWeight="800">$</text>
      <circle cx="84" cy="46" r="9" fill="none" stroke="white" strokeWidth="3"/>
      <circle cx="83.5" cy="45.5" r="5" fill="none" stroke="white" strokeWidth="2.5"/>
      <line x1="87" y1="49.5" x2="92" y2="55" stroke="white" strokeWidth="3" strokeLinecap="round"/>
      <circle cx="50" cy="44" r="8" fill="white"/>
      <path d="M34 56 Q42 51 50 51 Q58 51 66 56 L68 78 H32 Z" fill="white"/>
      <polygon points="50,53 48,60 50,62 52,60" fill="#0A7B7E"/>
      <path d="M36 59 Q26 54 20 50" stroke="white" strokeWidth="4" strokeLinecap="round" fill="none"/>
      <path d="M64 59 Q74 54 80 50" stroke="white" strokeWidth="4" strokeLinecap="round" fill="none"/>
      <rect x="38" y="78" width="9" height="18" rx="4" fill="white"/>
      <rect x="53" y="78" width="9" height="18" rx="4" fill="white"/>
    </svg>
  )
}
