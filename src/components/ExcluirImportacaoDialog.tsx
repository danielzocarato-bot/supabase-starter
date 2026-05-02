import { useEffect, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { excluirCompetencia } from "@/lib/competencias";

type Status = "aberta" | "concluida" | "exportada";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  competenciaId: string;
  periodoLabel: string;       // ex: "Outubro / 2025"
  tipoLabel: string;          // ex: "NF-e Entrada"
  status: Status;
  totalNotas: number;
  onExcluido?: () => void;
};

export function ExcluirImportacaoDialog({
  open, onOpenChange, competenciaId, periodoLabel, tipoLabel,
  status, totalNotas, onExcluido,
}: Props) {
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setConfirmText("");
      setLoading(false);
    }
  }, [open]);

  const podeExcluir = confirmText === "EXCLUIR" && !loading;

  const handleExcluir = async () => {
    setLoading(true);
    try {
      await excluirCompetencia(competenciaId);
      toast.success("Importação excluída.");
      onOpenChange(false);
      onExcluido?.();
    } catch (e: any) {
      toast.error("Algo precisa de atenção", {
        description: e?.message ?? "Não foi possível excluir a importação.",
      });
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => !loading && onOpenChange(v)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir esta importação?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                <span className="font-medium text-foreground">
                  {periodoLabel} — {tipoLabel}
                </span>
              </p>
              <p>
                {totalNotas > 0 ? `${totalNotas} ${totalNotas === 1 ? "nota será apagada" : "notas serão apagadas"} permanentemente, junto com todos os itens e classificações. ` : "Todos os dados desta competência serão removidos. "}
                Esta ação não pode ser desfeita.
              </p>
              {status === "exportada" && (
                <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <p className="text-sm">
                    Esta competência já foi <strong>exportada para o Domínio</strong>.
                    Excluir aqui não desfaz a exportação no sistema contábil.
                  </p>
                </div>
              )}
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="confirm-excluir" className="text-foreground">
                  Para confirmar, digite <span className="font-mono font-semibold">EXCLUIR</span>:
                </Label>
                <Input
                  id="confirm-excluir"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  autoComplete="off"
                  disabled={loading}
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!podeExcluir}
            onClick={(e) => { e.preventDefault(); handleExcluir(); }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {loading ? "Excluindo…" : "Excluir definitivamente"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
