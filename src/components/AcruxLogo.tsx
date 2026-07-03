export const AcruxLogo = ({
  className = "",
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) => {
  const sizes = {
    sm: {
      main: "text-lg",
      sub: "text-[10px]",
      gap: "-mt-0.5",
      mainExtra: "text-brand-navy",
    },
    md: {
      main: "text-2xl",
      sub: "text-[11px]",
      gap: "-mt-1",
      mainExtra: "text-brand-navy",
    },
    lg: {
      main: "text-5xl",
      sub: "text-sm",
      gap: "-mt-2",
      mainExtra: "bg-gradient-gold bg-clip-text text-transparent",
    },
  };

  const s = sizes[size];

  return (
    <div className={`flex items-center ${className}`}>
      <div className="flex flex-col leading-[0.95]">
        <span className={`font-display font-bold tracking-tight ${s.main} ${s.mainExtra}`}>
          Flow
        </span>
        <span
          className={`${s.sub} font-semibold text-brand-gold-dark ${s.gap} uppercase`}
          style={{ letterSpacing: "0.2em" }}
        >
          CLASSIFICA
        </span>
      </div>
    </div>
  );
};
