import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Exportacao = {
  id: string;
  gerado_em: string;
  gerado_por_email: string | null;
  gerado_por_nome: string | null;
  arquivo_nome: string;
  formato: string;
  total_notas: number | null;
  total_itens: number | null;
  bytes_size: number | null;
  hash_sha256: string | null;
};

function formatBytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatDateTimeBR(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatoLabel(f: string): string {
  if (f === "leiaute_18") return "NFSe — Leiaute 18";
  if (f === "dominio_separador") return "NFe — Excel 2.0";
  return f;
}

export function HistoricoExportacoes({
  open,
  onOpenChange,
  competenciaId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  competenciaId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [exportacoes, setExportacoes] = useState<Exportacao[]>([]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("exportacoes_da_competencia", {
        _competencia_id: competenciaId,
      });
      if (error) {
        toast.error("Algo precisa de atenção", { description: error.message });
        setExportacoes([]);
      } else {
        setExportacoes((data ?? []) as Exportacao[]);
      }
      setLoading(false);
    })();
  }, [open, competenciaId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Histórico de exportações
          </DialogTitle>
          <DialogDescription>
            Cada vez que um arquivo TXT é gerado, fica registrado aqui para auditoria fiscal.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processando…
          </div>
        ) : exportacoes.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma exportação registrada ainda para esta competência.
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data e hora</TableHead>
                  <TableHead>Por</TableHead>
                  <TableHead>Formato</TableHead>
                  <TableHead className="text-right">Notas</TableHead>
                  <TableHead className="text-right">Itens</TableHead>
                  <TableHead className="text-right">Tamanho</TableHead>
                  <TableHead>Hash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exportacoes.map((e, idx) => {
                  const isLatest = idx === 0;
                  const isDuplicate =
                    idx > 0 &&
                    e.hash_sha256 &&
                    e.hash_sha256 === exportacoes[idx - 1].hash_sha256;
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span>{formatDateTimeBR(e.gerado_em)}</span>
                          {isLatest && (
                            <Badge variant="secondary" className="text-xs">
                              mais recente
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {e.gerado_por_nome || e.gerado_por_email || "—"}
                      </TableCell>
                      <TableCell className="text-sm">{formatoLabel(e.formato)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {e.total_notas ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {e.total_itens ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatBytes(e.bytes_size)}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <span>{e.hash_sha256 ? e.hash_sha256.slice(0, 12) + "…" : "—"}</span>
                          {isDuplicate && (
                            <Badge variant="outline" className="text-xs">
                              igual à anterior
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
