export const AcruxLogo = ({ className = "" }: { className?: string }) => (
  <div className={`flex items-center gap-2 ${className}`}>
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 3L29 27H3L16 3Z" stroke="hsl(var(--brand))" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="16" cy="19" r="3" fill="hsl(var(--brand))" />
    </svg>
    <div className="flex flex-col leading-tight">
      <span className="font-display font-semibold text-brand text-base tracking-tight">Acrux</span>
      <span className="text-[10px] font-medium text-muted-foreground -mt-0.5 uppercase tracking-wider">Classifica</span>
    </div>
  </div>
);
