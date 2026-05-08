import { Badge } from "@/components/ui/badge";
import { CheckCircle2, FileCheck2, Clock } from "lucide-react";

export type CompetenciaStatus = "aberta" | "concluida" | "exportada";

export function StatusCompetenciaBadge({ status }: { status: CompetenciaStatus }) {
  if (status === "exportada") {
    return (
      <Badge variant="outline" className="gap-1 bg-accent-deep/10 text-accent-deep border-accent-deep/30">
        <FileCheck2 className="h-3 w-3" strokeWidth={2} />
        Exportada
      </Badge>
    );
  }
  if (status === "concluida") {
    return (
      <Badge variant="outline" className="gap-1 bg-success/10 text-success border-success/30">
        <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
        Validada
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 bg-warning/10 text-warning border-warning/30">
      <Clock className="h-3 w-3" strokeWidth={2} />
      Aberta
    </Badge>
  );
}
