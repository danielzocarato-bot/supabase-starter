import logoSrc from "@/assets/acrux-logo.jpeg";

export const AcruxLogo = ({ className = "" }: { className?: string }) => (
  <div className={`flex items-center gap-2 ${className}`}>
    <img
      src={logoSrc}
      alt="Acrux"
      width={32}
      height={32}
      className="h-8 w-8 object-contain"
    />
    <div className="flex flex-col leading-tight">
      <span className="font-display font-semibold text-brand text-base tracking-tight">Acrux</span>
      <span className="text-[10px] font-medium text-muted-foreground -mt-0.5 uppercase tracking-wider">Classifica</span>
    </div>
  </div>
);
