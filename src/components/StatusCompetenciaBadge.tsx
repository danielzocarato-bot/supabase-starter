import { Badge } from "@/components/ui/badge";

export type CompetenciaStatus = "aberta" | "concluida" | "exportada";

export function StatusCompetenciaBadge({ status }: { status: CompetenciaStatus }) {
  if (status === "exportada") {
    return (
      <Badge variant="outline" className="bg-success/10 text-success border-success/30">
        Exportada
      </Badge>
    );
  }
  if (status === "concluida") {
    return (
      <Badge variant="outline" className="bg-brand-soft text-brand border-brand/20">
        Classificação validada
      </Badge>
    );
  }
  return <Badge variant="secondary">Aberta</Badge>;
}
