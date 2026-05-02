import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  StatusCompetenciaBadge, type CompetenciaStatus,
} from "@/components/StatusCompetenciaBadge";
import {
  Users, FileClock, ClipboardList, FileDown, AlertCircle, Clock,
  AlertTriangle, ChevronRight, UserPlus, Upload, FileCode2,
} from "lucide-react";

type TipoOp = "nfse_tomada" | "nfe_entrada" | "nfe_saida";

interface AtencaoRow {
  competencia_id: string;
  cliente_id: string;
  cliente_razao: string;
  periodo: string;
  tipo: TipoOp;
  status: CompetenciaStatus;
  total_notas: number;
  notas_classificadas: number;
  pct: number;
  motivo: "pronta_exportar" | "parada_sem_progresso" | "parada_progresso_parcial" | null;
  dias_parado: number;
  ultima_atividade: string;
}

interface AndamentoRow {
  competencia_id: string;
  cliente_id: string;
  cliente_razao: string;
  periodo: string;
  tipo: TipoOp;
  status: CompetenciaStatus;
  total_notas: number;
  notas_classificadas: number;
  pct: number;
  created_at: string;
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function periodoHumano(p: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  if (!m) return p;
  const mes = parseInt(m[2], 10);
  return `${MESES[mes - 1] ?? m[2]} / ${m[1]}`;
}

function tipoLabel(t: TipoOp) {
  if (t === "nfse_tomada") return "NFSe";
  if (t === "nfe_entrada") return "NFe Entrada";
  if (t === "nfe_saida") return "NFe Saída";
  return t;
}

function tipoBadgeClasses(t: TipoOp) {
  if (t === "nfse_tomada") return "bg-brand-soft text-brand border-brand/20";
  if (t === "nfe_entrada") return "bg-info/10 text-info border-info/30";
  return "bg-warning/10 text-warning border-warning/30";
}

function saudacao() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function StatCard({
  icon: Icon, label, value, highlight,
}: { icon: any; label: string; value: number; highlight?: boolean }) {
  return (
    <Card
      className={`p-6 rounded-xl ${
        highlight ? "bg-brand-soft border-brand/30" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className={`text-sm ${highlight ? "text-brand" : "text-muted-foreground"}`}>{label}</span>
        <Icon className={`h-4 w-4 ${highlight ? "text-brand" : "text-brand"}`} strokeWidth={1.5} />
      </div>
      <p className={`text-3xl font-display font-semibold tabular-nums ${highlight ? "text-brand" : ""}`}>
        {value}
      </p>
    </Card>
  );
}

function motivoTexto(a: AtencaoRow) {
  if (a.motivo === "pronta_exportar") return "Pronta para gerar TXT do Domínio";
  if (a.motivo === "parada_sem_progresso") return `Aguardando classificação há ${a.dias_parado} dias`;
  if (a.motivo === "parada_progresso_parcial")
    return `Sem atividade há ${a.dias_parado} dias (${a.pct}% classificado)`;
  return "";
}

function MotivoIcon({ motivo }: { motivo: AtencaoRow["motivo"] }) {
  if (motivo === "pronta_exportar") return <FileDown className="h-5 w-5 text-success" strokeWidth={1.5} />;
  if (motivo === "parada_sem_progresso") return <AlertCircle className="h-5 w-5 text-warning" strokeWidth={1.5} />;
  return <Clock className="h-5 w-5 text-warning" strokeWidth={1.5} />;
}

function AtencaoRowItem({ row, onClick }: { row: AtencaoRow; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-muted/50 transition-colors text-left border border-transparent hover:border-border"
    >
      <MotivoIcon motivo={row.motivo} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{row.cliente_razao}</span>
          <span className="text-sm text-muted-foreground">· {periodoHumano(row.periodo)}</span>
          <Badge variant="outline" className={`text-xs ${tipoBadgeClasses(row.tipo)}`}>
            {tipoLabel(row.tipo)}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{motivoTexto(row)}</p>
      </div>
      <StatusCompetenciaBadge status={row.status} />
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

function AndamentoRowItem({ row, onClick }: { row: AndamentoRow; onClick: () => void }) {
  return (
    <TableRow className="cursor-pointer" onClick={onClick}>
      <TableCell className="font-medium">{row.cliente_razao}</TableCell>
      <TableCell>{periodoHumano(row.periodo)}</TableCell>
      <TableCell>
        <Badge variant="outline" className={`text-xs ${tipoBadgeClasses(row.tipo)}`}>
          {tipoLabel(row.tipo)}
        </Badge>
      </TableCell>
      <TableCell className="w-[200px]">
        <Progress value={Number(row.pct) || 0} className="h-1.5" />
        <p className="text-xs text-muted-foreground mt-1 tabular-nums">
          {row.notas_classificadas}/{row.total_notas}
        </p>
      </TableCell>
      <TableCell><StatusCompetenciaBadge status={row.status} /></TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onClick(); }}>
          Abrir
        </Button>
      </TableCell>
    </TableRow>
  );
}

function ShortcutCard({
  icon: Icon, title, desc, onClick,
}: { icon: any; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left p-5 rounded-xl border bg-card hover:border-brand/40 hover:shadow-sm transition-all flex items-start gap-4 group"
    >
      <div className="h-10 w-10 rounded-lg bg-brand-soft flex items-center justify-center flex-shrink-0 group-hover:bg-brand/15">
        <Icon className="h-5 w-5 text-brand" strokeWidth={1.5} />
      </div>
      <div className="min-w-0">
        <h3 className="font-medium text-sm">{title}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
    </button>
  );
}

export default function DashboardEscritorio() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const [stats, setStats] = useState({ clientes: 0, abertas: 0, aguardando: 0, pronta_exportar: 0 });
  const [atencao, setAtencao] = useState<AtencaoRow[]>([]);
  const [andamento, setAndamento] = useState<AndamentoRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [c, a, n, e, atRpc, andRpc] = await Promise.all([
        supabase.from("clientes").select("id", { count: "exact", head: true }).eq("ativo", true),
        supabase.from("competencias").select("id", { count: "exact", head: true }).eq("status", "aberta"),
        supabase.from("notas_fiscais").select("id", { count: "exact", head: true }).is("acumulador_id", null).eq("cancelada", false),
        supabase.from("competencias").select("id", { count: "exact", head: true }).eq("status", "concluida"),
        supabase.rpc("dashboard_atencao"),
        supabase.rpc("dashboard_em_andamento"),
      ]);
      setStats({
        clientes: c.count || 0,
        abertas: a.count || 0,
        aguardando: n.count || 0,
        pronta_exportar: e.count || 0,
      });
      setAtencao((atRpc.data ?? []) as AtencaoRow[]);
      setAndamento((andRpc.data ?? []) as AndamentoRow[]);
      setLoading(false);
    })();
  }, []);

  const primeiroNome = (profile?.nome || profile?.email || "").split(" ")[0].split("@")[0];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-display font-semibold">{saudacao()}, {primeiroNome}</h1>
        <p className="text-muted-foreground mt-1">Visão geral do escritório.</p>
      </div>

      {/* Stat cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[112px] rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users} label="Clientes ativos" value={stats.clientes} />
          <StatCard icon={FileClock} label="Competências em aberto" value={stats.abertas} />
          <StatCard icon={ClipboardList} label="Notas aguardando classificação" value={stats.aguardando} />
          <StatCard icon={FileDown} label="Prontas para exportar" value={stats.pronta_exportar} highlight={stats.pronta_exportar > 0} />
        </div>
      )}

      {/* Precisam de atenção */}
      {loading ? (
        <Skeleton className="h-[200px] rounded-xl" />
      ) : atencao.length > 0 && (
        <Card className="p-6 rounded-xl">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-warning" strokeWidth={1.5} />
            <h2 className="font-display font-semibold text-lg">Precisam de atenção</h2>
            <Badge variant="secondary" className="ml-1">{atencao.length}</Badge>
          </div>
          <div className="space-y-1">
            {atencao.map((a) => (
              <AtencaoRowItem
                key={a.competencia_id}
                row={a}
                onClick={() => nav(`/app/escritorio/competencias/${a.competencia_id}`)}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Em andamento */}
      <Card className="p-6 rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="font-display font-semibold text-lg">Competências em andamento</h2>
          {andamento.length > 0 && <Badge variant="secondary">{andamento.length}</Badge>}
        </div>
        {loading ? (
          <Skeleton className="h-[180px] rounded-md" />
        ) : andamento.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            Comece cadastrando seu primeiro cliente. Em poucos passos, você organiza a estrutura completa pra que a classificação flua todo mês com segurança.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Progresso</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {andamento.map((c) => (
                <AndamentoRowItem
                  key={c.competencia_id}
                  row={c}
                  onClick={() => nav(`/app/escritorio/competencias/${c.competencia_id}`)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Atalhos rápidos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ShortcutCard
          icon={UserPlus}
          title="Novo cliente"
          desc="Cadastre uma empresa e libere a classificação."
          onClick={() => nav("/app/escritorio/clientes/novo")}
        />
        <ShortcutCard
          icon={Upload}
          title="Importar planilha"
          desc="Suba a planilha de NFSe tomadas do mês."
          onClick={() => nav("/app/escritorio/importar")}
        />
        <ShortcutCard
          icon={FileCode2}
          title="Importar XMLs"
          desc="Carregue os XMLs de NFe de entrada e saída."
          onClick={() => nav("/app/escritorio/importar-xmls")}
        />
      </div>
    </div>
  );
}
