export const AcruxLogo = ({ className = "" }: { className?: string }) => (
  <div className={`flex items-center ${className}`}>
    <div className="flex flex-col leading-tight">
      <span className="font-display font-semibold text-brand text-base tracking-tight">Flow</span>
      <span className="text-[10px] font-medium text-muted-foreground -mt-0.5 uppercase tracking-wider">Classifica</span>
    </div>
  </div>
);
