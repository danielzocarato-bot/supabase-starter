import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusCompetenciaBadge, CompetenciaStatus } from "@/components/StatusCompetenciaBadge";
import { toast } from "sonner";

const MESES_PT = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];
function formatPeriodo(p: string) {
  const m = p.match(/^(\d{4})-(\d{2})$/);
  if (!m) return p;
  return `${MESES_PT[parseInt(m[2], 10) - 1]} / ${m[1]}`;
}
function formatDateBR(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
  } catch {
    return "—";
  }
}

type Competencia = {
  id: string;
  periodo: string;
  status: CompetenciaStatus;
  total_notas: number;
  notas_classificadas: number;
  created_at: string;
};

export default function ClienteCompetencias() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [competencias, setCompetencias] = useState<Competencia[]>([]);

  useEffect(() => {
    if (!profile?.cliente_id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("competencias")
        .select("id, periodo, status, total_notas, notas_classificadas, created_at")
        .eq("cliente_id", profile.cliente_id)
        .order("periodo", { ascending: false });
      if (cancelled) return;
      if (error) {
        toast.error("Algo precisa de atenção", { description: error.message });
        setCompetencias([]);
      } else {
        setCompetencias((data ?? []) as Competencia[]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [profile?.cliente_id]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-semibold">Minhas Competências</h1>
        <p className="text-muted-foreground mt-1">
          Classifique as notas fiscais enviadas pela sua contabilidade.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-6 rounded-xl space-y-4">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-1.5 w-full" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
            </Card>
          ))}
        </div>
      ) : competencias.length === 0 ? (
        <Card className="p-12 rounded-xl text-center">
          <p className="text-muted-foreground max-w-md mx-auto">
            Por aqui ainda não há nada para classificar. Assim que sua contabilidade enviar a planilha do mês, ela aparece aqui.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {competencias.map((c, i) => {
            const total = c.total_notas ?? 0;
            const feitas = c.notas_classificadas ?? 0;
            const pct = total > 0 ? (feitas / total) * 100 : 0;
            const isExportada = c.status === "exportada";
            const isConcluida = c.status === "concluida";
            const cardBorder = isExportada
              ? "border-success/30 bg-success/5"
              : isConcluida
              ? "border-brand-soft"
              : "";
            const isAberta = c.status === "aberta";
            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: i * 0.03, ease: "easeOut" }}
              >
                <Card className={`p-6 rounded-xl flex flex-col gap-4 h-full ${cardBorder}`}>
                  <div className="space-y-2">
                    <h3 className="text-xl font-display font-semibold leading-tight">
                      {formatPeriodo(c.periodo)}
                    </h3>
                    <StatusCompetenciaBadge status={c.status} />
                  </div>

                  <div className="space-y-1.5">
                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {Math.round(pct)}% · {feitas} de {total} notas classificadas
                    </p>
                  </div>

                  <div className="flex-1" />

                  <Button
                    onClick={() => nav(`/app/cliente/competencias/${c.id}`)}
                    variant={isAberta ? "default" : "outline"}
                    className={isAberta ? "bg-brand text-brand-foreground hover:bg-brand/90 w-full" : "w-full"}
                  >
                    {isAberta ? "Classificar" : "Ver detalhes"}
                  </Button>

                  <p className="text-xs text-muted-foreground">
                    Importada em {formatDateBR(c.created_at)}
                  </p>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
