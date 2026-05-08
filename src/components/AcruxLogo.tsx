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
      mainExtra: "",
    },
    md: {
      main: "text-2xl",
      sub: "text-[11px]",
      gap: "-mt-1",
      mainExtra: "",
    },
    lg: {
      main: "text-5xl",
      sub: "text-sm",
      gap: "-mt-2",
      mainExtra: "bg-gradient-to-r from-brand to-info bg-clip-text text-transparent",
    },
  };

  const s = sizes[size];

  return (
    <div className={`flex items-center ${className}`}>
      <div className="flex flex-col leading-[0.95]">
        <span
          className={`font-display font-bold tracking-tighter ${s.main} ${s.mainExtra || "text-brand"}`}
        >
          Flow
        </span>
        <span
          className={`${s.sub} font-semibold text-muted-foreground ${s.gap} uppercase`}
          style={{ letterSpacing: "0.2em" }}
        >
          Classifica
        </span>
      </div>
    </div>
  );
};
