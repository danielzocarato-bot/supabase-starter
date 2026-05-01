import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useVirtualizer } from "@tanstack/react-virtual";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft, Check, CheckCircle2, ChevronLeft, ChevronRight, ChevronsUpDown,
  Download, FileText, Loader2, Search, Undo2, X,
} from "lucide-react";
import { formatCNPJ } from "@/lib/format";
import { StatusCompetenciaBadge } from "@/components/StatusCompetenciaBadge";

const MESES_PT = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];
function formatPeriodo(p: string) {
  const m = p.match(/^(\d{4})-(\d{2})$/);
  if (!m) return p;
  return `${MESES_PT[parseInt(m[2], 10) - 1]} / ${m[1]}`;
}
function formatBRL(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));
}
function formatDateBR(d: string | null | undefined) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}
function formatDateTimeBR(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} às ${hh}:${mi}`;
}
function normalize(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const PAGE_SIZE = 50;

type CompetenciaStatus = "aberta" | "concluida" | "exportada";

type Competencia = {
  id: string;
  cliente_id: string;
  periodo: string;
  status: CompetenciaStatus;
  total_notas: number;
  notas_classificadas: number;
  arquivo_origem: string | null;
  exportada_em: string | null;
};
type Cliente = { id: string; razao_social: string; cnpj: string };

type Acumulador = {
  id: string;
  codigo: number;
  descricao: string;
};

type Nota = {
  id: string;
  numero_nfe: string | null;
  emissao_nfe: string | null;
  data_competencia: string | null;
  prestador_razao: string | null;
  prestador_cnpj: string | null;
  prestador_municipio: string | null;
  prestador_uf: string | null;
  prestador_endereco: string | null;
  cnae_descricao: string | null;
  servico_municipal: string | null;
  valor_nfe: number | null;
  desconto: number | null;
  valor_contabil: number | null;
  observacao: string | null;
  cancelada: boolean;
  acumulador_id: string | null;
  raw_data: any;
};


export default function Classificacao() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [competencia, setCompetencia] = useState<Competencia | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [acumuladores, setAcumuladores] = useState<Acumulador[]>([]);
  const [notas, setNotas] = useState<Nota[]>([]);

  // UI state
  const [filtro, setFiltro] = useState<"todas" | "aguardando" | "classificadas">("todas");
  const [buscaInput, setBuscaInput] = useState("");
  const [busca, setBusca] = useState("");
  const [mostrarCanceladas, setMostrarCanceladas] = useState(false);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [bulkAcumulador, setBulkAcumulador] = useState<string>("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [drawerNotaId, setDrawerNotaId] = useState<string | null>(null);
  const [pisca, setPisca] = useState<Set<string>>(new Set());
  const [ultimoSave, setUltimoSave] = useState<number | null>(null);
  const [showSaveIndicator, setShowSaveIndicator] = useState(false);
  const [confirmConcluirOpen, setConfirmConcluirOpen] = useState(false);
  const [confirmReabrirOpen, setConfirmReabrirOpen] = useState(false);
  const [acaoLoading, setAcaoLoading] = useState(false);
  const [exportandoLoading, setExportandoLoading] = useState(false);
  const [pendentes, setPendentes] = useState<string[] | null>(null);
  const [tipoPendencia, setTipoPendencia] = useState<"classificacao" | "ibge" | null>(null);

  // Debounce busca
  useEffect(() => {
    const t = setTimeout(() => setBusca(buscaInput), 200);
    return () => clearTimeout(t);
  }, [buscaInput]);

  // Página persistida em ?page
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const setPage = (p: number) => {
    const sp = new URLSearchParams(searchParams);
    if (p === 1) sp.delete("page"); else sp.set("page", String(p));
    setSearchParams(sp, { replace: true });
  };

  // Carga inicial
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const compReq = supabase
        .from("competencias")
        .select("id, cliente_id, periodo, status, total_notas, notas_classificadas, arquivo_origem, exportada_em, clientes(id, razao_social, cnpj)")
        .eq("id", id)
        .maybeSingle();
      const notasReq = supabase
        .from("notas_fiscais")
        .select("id, numero_nfe, emissao_nfe, data_competencia, prestador_razao, prestador_cnpj, prestador_municipio, prestador_uf, prestador_endereco, cnae_descricao, servico_municipal, valor_nfe, desconto, valor_contabil, observacao, cancelada, acumulador_id, raw_data")
        .eq("competencia_id", id)
        .order("emissao_nfe", { ascending: true });

      const [compRes, notasRes] = await Promise.all([compReq, notasReq]);
      if (cancelled) return;

      if (compRes.error || !compRes.data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const cd: any = compRes.data;
      const comp: Competencia = {
        id: cd.id,
        cliente_id: cd.cliente_id,
        periodo: cd.periodo,
        status: cd.status,
        total_notas: cd.total_notas,
        notas_classificadas: cd.notas_classificadas,
        arquivo_origem: cd.arquivo_origem,
        exportada_em: cd.exportada_em,
      };
      const cli: Cliente | null = cd.clientes
        ? { id: cd.clientes.id, razao_social: cd.clientes.razao_social, cnpj: cd.clientes.cnpj }
        : null;
      setCompetencia(comp);
      setCliente(cli);

      // Acumuladores ATIVOS do cliente
      const { data: acumData, error: acumErr } = await supabase
        .from("acumuladores")
        .select("id, codigo, descricao")
        .eq("cliente_id", comp.cliente_id)
        .eq("ativo", true)
        .order("descricao", { ascending: true });
      if (cancelled) return;
      if (acumErr) {
        toast.error("Algo precisa de atenção", { description: acumErr.message });
      }
      setAcumuladores((acumData ?? []) as Acumulador[]);

      if (notasRes.error) {
        toast.error("Algo precisa de atenção", { description: notasRes.error.message });
        setNotas([]);
      } else {
        setNotas((notasRes.data ?? []) as Nota[]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  // Mapa acumuladores
  const acumMap = useMemo(() => {
    const m = new Map<string, Acumulador>();
    acumuladores.forEach((a) => m.set(a.id, a));
    return m;
  }, [acumuladores]);

  // Contadores e progresso
  const totalClassificavel = useMemo(() => notas.filter((n) => !n.cancelada).length, [notas]);
  const totalClassificadas = useMemo(
    () => notas.filter((n) => !n.cancelada && n.acumulador_id).length,
    [notas],
  );
  const aguardandoCount = totalClassificavel - totalClassificadas;
  const pct = totalClassificavel > 0 ? (totalClassificadas / totalClassificavel) * 100 : 0;
  const podeConcluir = totalClassificavel > 0 && totalClassificadas === totalClassificavel && competencia?.status === "aberta";
  const readOnly = !!competencia && competencia.status !== "aberta";

  // Filtragem
  const filtradas = useMemo(() => {
    const q = normalize(busca);
    return notas.filter((n) => {
      if (n.cancelada && !mostrarCanceladas) return false;
      if (filtro === "aguardando" && (n.cancelada || n.acumulador_id)) return false;
      if (filtro === "classificadas" && (n.cancelada || !n.acumulador_id)) return false;
      if (q) {
        const haystack = normalize(
          `${n.prestador_razao ?? ""} ${n.numero_nfe ?? ""} ${n.valor_nfe ?? ""}`,
        );
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [notas, busca, filtro, mostrarCanceladas]);

  // Reset página se ficar fora do range
  useEffect(() => {
    const totalPag = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
    if (page > totalPag) setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtradas.length]);

  const totalPag = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  const pageItems = useMemo(
    () => filtradas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtradas, page],
  );

  // Auto-save indicator
  const saveTimerRef = useRef<number | null>(null);
  const triggerSaveIndicator = () => {
    setUltimoSave(Date.now());
    setShowSaveIndicator(true);
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => setShowSaveIndicator(false), 2000) as any;
  };

  // Pisca verde após save
  const flashRow = (notaId: string) => {
    setPisca((prev) => {
      const next = new Set(prev);
      next.add(notaId);
      return next;
    });
    window.setTimeout(() => {
      setPisca((prev) => {
        const next = new Set(prev);
        next.delete(notaId);
        return next;
      });
    }, 600);
  };

  // Persistência (otimista)
  const persistAcumulador = useCallback(
    async (notaIds: string[], acumuladorId: string | null, snapshot: Nota[]) => {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("notas_fiscais")
        .update({
          acumulador_id: acumuladorId,
          classificado_em: acumuladorId ? now : null,
          classificado_por: acumuladorId ? profile?.id ?? null : null,
        })
        .in("id", notaIds);

      if (error) {
        // reverter
        setNotas(snapshot);
        toast.error("Algo precisa de atenção", { description: error.message });
        return false;
      }
      notaIds.forEach(flashRow);
      triggerSaveIndicator();
      return true;
    },
    [profile?.id],
  );

  const aplicarAcumulador = (notaId: string, acumuladorId: string | null) => {
    if (readOnly) return;
    const snapshot = notas;
    setNotas((prev) =>
      prev.map((n) =>
        n.id === notaId
          ? { ...n, acumulador_id: acumuladorId, }
          : n,
      ),
    );
    persistAcumulador([notaId], acumuladorId, snapshot);
  };

  const aplicarAcumuladorBulk = async (acumuladorId: string) => {
    if (readOnly) return;
    const ids = Array.from(selecionadas);
    if (ids.length === 0) return;
    const snapshot = notas;
    setNotas((prev) =>
      prev.map((n) => (selecionadas.has(n.id) ? { ...n, acumulador_id: acumuladorId } : n)),
    );
    const ok = await persistAcumulador(ids, acumuladorId, snapshot);
    if (ok) {
      toast.success(`${ids.length} ${ids.length === 1 ? "nota classificada" : "notas classificadas"} em massa.`);
      setSelecionadas(new Set());
      setBulkAcumulador("");
    }
  };

  // Seleção
  const togglePageAll = () => {
    const elegiveis = pageItems.filter((n) => !n.cancelada).map((n) => n.id);
    const todasMarcadas = elegiveis.every((id) => selecionadas.has(id));
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (todasMarcadas) elegiveis.forEach((i) => next.delete(i));
      else elegiveis.forEach((i) => next.add(i));
      return next;
    });
  };
  const toggleOne = (notaId: string) => {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(notaId)) next.delete(notaId);
      else next.add(notaId);
      return next;
    });
  };

  const drawerNota = useMemo(
    () => (drawerNotaId ? notas.find((n) => n.id === drawerNotaId) ?? null : null),
    [drawerNotaId, notas],
  );

  // Concluir / Reabrir competência
  const handleConcluir = async () => {
    if (!competencia) return;
    setAcaoLoading(true);
    const { error } = await supabase
      .from("competencias")
      .update({ status: "concluida", concluida_em: new Date().toISOString() })
      .eq("id", competencia.id);
    setAcaoLoading(false);
    if (error) {
      toast.error("Algo precisa de atenção", { description: error.message });
      return;
    }
    setCompetencia({ ...competencia, status: "concluida" });
    setConfirmConcluirOpen(false);
    if (profile?.role === "cliente") {
      toast.success("Classificação validada com segurança.");
    } else {
      toast.success("Competência marcada como concluída.");
    }
  };

  const handleReabrir = async () => {
    if (!competencia) return;
    setAcaoLoading(true);
    const { error } = await supabase
      .from("competencias")
      .update({ status: "aberta", concluida_em: null })
      .eq("id", competencia.id);
    setAcaoLoading(false);
    if (error) {
      toast.error("Algo precisa de atenção", { description: error.message });
      return;
    }
    setCompetencia({ ...competencia, status: "aberta" });
    setConfirmReabrirOpen(false);
    toast.success("Competência reaberta.");
  };

  // Exportar TXT Domínio (somente escritório)
  const handleExportar = async () => {
    if (!competencia || !cliente) return;
    setExportandoLoading(true);
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
      const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const { data: sessionRes } = await supabase.auth.getSession();
      const token = sessionRes.session?.access_token;
      if (!token) {
        toast.error("Algo precisa de atenção", { description: "Sessão expirada." });
        return;
      }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/gerar-txt-dominio`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "apikey": SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ competencia_id: competencia.id }),
      });
      if (!res.ok) {
        let body: any = null;
        try { body = await res.json(); } catch {}
        if (body?.pendentes?.length) {
          setPendentes(body.pendentes);
          setTipoPendencia(body.tipo_pendencia ?? "classificacao");
          return;
        }
        toast.error("Algo precisa de atenção", {
          description: body?.error ?? "Falha na exportação.",
        });
        return;
      }
      const blob = await res.blob();
      const cnpjDigits = (cliente.cnpj ?? "").replace(/\D/g, "");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dominio_${cnpjDigits}_${competencia.periodo}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setCompetencia({
        ...competencia,
        status: "exportada",
        exportada_em: new Date().toISOString(),
      });
      toast.success("Arquivo gerado e pronto para importação no Domínio.");
    } catch (e: any) {
      toast.error("Algo precisa de atenção", { description: e?.message ?? "Falha na exportação." });
    } finally {
      setExportandoLoading(false);
    }
  };

  // -------- Render --------
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Card className="rounded-xl overflow-hidden">
          <div className="divide-y">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className={`flex items-center gap-4 p-4 ${i % 2 ? "bg-muted/30" : ""}`}
              >
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-48 flex-1" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-56" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (notFound || !competencia || !cliente) {
    return (
      <div className="max-w-md mx-auto py-24 text-center space-y-4">
        <h2 className="text-xl font-display font-semibold">Competência não encontrada.</h2>
        <p className="text-muted-foreground">Verifique se o link está correto.</p>
        <Button onClick={() => nav(-1)} className="bg-brand text-brand-foreground hover:bg-brand/90">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </div>
    );
  }

  const voltarUrl =
    profile?.role === "escritorio"
      ? `/app/escritorio/clientes/${cliente.id}?tab=competencias`
      : `/app/cliente`;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5">
        {/* Header sticky */}
        <div className="sticky top-0 z-30 -mx-8 px-8 py-4 bg-background/85 backdrop-blur-md border-b">
          <div className="space-y-3">
            <Link
              to={voltarUrl}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Link>

            <div className="flex items-start justify-between gap-4 flex-wrap">
              <h1 className="text-2xl font-display font-semibold">
                {cliente.razao_social} <span className="text-muted-foreground font-normal">·</span>{" "}
                {formatPeriodo(competencia.periodo)}
              </h1>
              <div className="flex items-center gap-3">
                <StatusCompetenciaBadge status={competencia.status} />
                <AnimatePresence>
                  {showSaveIndicator && competencia.status === "aberta" && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-1.5 text-xs text-success"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Tudo salvo
                    </motion.div>
                  )}
                </AnimatePresence>
                {competencia.status === "concluida" && profile?.role === "escritorio" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmReabrirOpen(true)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    Reabrir competência
                  </Button>
                )}
                {profile?.role === "escritorio" && competencia.status === "concluida" && (
                  <Button
                    size="sm"
                    onClick={handleExportar}
                    disabled={exportandoLoading}
                    className="bg-brand text-brand-foreground hover:bg-brand/90"
                  >
                    {exportandoLoading
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <FileText className="h-4 w-4" />}
                    Exportar TXT Domínio
                  </Button>
                )}
                {profile?.role === "escritorio" && competencia.status === "exportada" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportar}
                    disabled={exportandoLoading}
                  >
                    {exportandoLoading
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Download className="h-4 w-4" />}
                    Re-exportar TXT
                  </Button>
                )}
              </div>
            </div>

            {competencia.status === "exportada" && competencia.exportada_em && (
              <p className="text-xs text-muted-foreground">
                Última exportação: {formatDateTimeBR(competencia.exportada_em)}
              </p>
            )}

            {competencia.status !== "exportada" && (
              <div className="flex items-end justify-between gap-6">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-brand"
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {totalClassificadas} de {totalClassificavel} classificadas
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-3xl font-display font-semibold tabular-nums leading-none">
                    {Math.round(pct)}%
                  </div>
                  {podeConcluir && (
                    <motion.div
                      initial={{ scale: 0.85, opacity: 0 }}
                      animate={{ scale: [0.85, 1.05, 1], opacity: 1 }}
                      transition={{ duration: 0.4 }}
                    >
                      <Button
                        size="lg"
                        className="bg-brand text-brand-foreground hover:bg-brand/90"
                        onClick={() => setConfirmConcluirOpen(true)}
                      >
                        Concluir competência
                      </Button>
                    </motion.div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Filtros + busca */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <FiltroChip
              ativo={filtro === "todas"}
              label="Todas"
              count={notas.filter((n) => mostrarCanceladas || !n.cancelada).length}
              onClick={() => setFiltro("todas")}
            />
            <FiltroChip
              ativo={filtro === "aguardando"}
              label="Aguardando classificação"
              count={aguardandoCount}
              onClick={() => setFiltro("aguardando")}
            />
            <FiltroChip
              ativo={filtro === "classificadas"}
              label="Classificadas"
              count={totalClassificadas}
              onClick={() => setFiltro("classificadas")}
            />
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Switch
                id="ver-canceladas"
                checked={mostrarCanceladas}
                onCheckedChange={setMostrarCanceladas}
              />
              <Label htmlFor="ver-canceladas" className="text-sm font-normal text-muted-foreground cursor-pointer">
                Mostrar canceladas
              </Label>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={buscaInput}
                onChange={(e) => setBuscaInput(e.target.value)}
                placeholder="Buscar por prestador, número ou valor"
                className="pl-9 w-80"
              />
            </div>
          </div>
        </div>

        {/* Bulk action bar */}
        <AnimatePresence>
          {selecionadas.size > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="sticky top-[180px] z-20"
            >
              <Card className="p-3 rounded-xl flex items-center gap-3 flex-wrap bg-brand-soft/40 border-brand/20">
                <span className="text-sm font-medium">
                  {selecionadas.size} {selecionadas.size === 1 ? "selecionada" : "selecionadas"}
                </span>
                <div className="flex-1" />
                <Popover open={bulkOpen} onOpenChange={setBulkOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="min-w-[280px] justify-between font-normal">
                      <span className={bulkAcumulador ? "" : "text-muted-foreground"}>
                        {bulkAcumulador
                          ? acumMap.get(bulkAcumulador)?.descricao ?? "Acumulador"
                          : "Aplicar acumulador às selecionadas"}
                      </span>
                      <ChevronsUpDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <AcumuladorList
                      acumuladores={acumuladores}
                      mostrarLimpar={false}
                      onSelect={(aid) => {
                        setBulkOpen(false);
                        if (aid) {
                          setBulkAcumulador(aid);
                          aplicarAcumuladorBulk(aid);
                        }
                      }}
                    />
                  </PopoverContent>
                </Popover>
                <Button
                  variant="ghost"
                  onClick={() => { setSelecionadas(new Set()); setBulkAcumulador(""); }}
                >
                  Limpar seleção
                </Button>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tabela */}
        {filtradas.length === 0 ? (
          <Card className="p-12 rounded-xl text-center space-y-3">
            {notas.length === 0 ? (
              <>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Esta competência ainda não tem notas. Verifique o upload da planilha.
                </p>
                <Button variant="outline" onClick={() => nav(voltarUrl)}>
                  Voltar para o cliente
                </Button>
              </>
            ) : (
              <p className="text-muted-foreground">Nenhuma nota encontrada com esses filtros.</p>
            )}
          </Card>
        ) : (
          <Card className="rounded-xl overflow-hidden">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={
                        pageItems.filter((n) => !n.cancelada).length > 0 &&
                        pageItems
                          .filter((n) => !n.cancelada)
                          .every((n) => selecionadas.has(n.id))
                      }
                      onCheckedChange={togglePageAll}
                      disabled={readOnly}
                      aria-label="Selecionar todas da página"
                    />
                  </TableHead>
                  <TableHead>Nº NFe</TableHead>
                  <TableHead>Emissão</TableHead>
                  <TableHead>Prestador</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Município</TableHead>
                  <TableHead>CNAE</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="w-[300px]">Acumulador</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((n) => {
                  const isPiscando = pisca.has(n.id);
                  return (
                    <motion.tr
                      key={n.id}
                      animate={
                        isPiscando
                          ? { backgroundColor: ["hsl(var(--success) / 0.15)", "hsl(var(--success) / 0)"] }
                          : { backgroundColor: "hsl(var(--success) / 0)" }
                      }
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      className={`border-b last:border-b-0 transition-opacity hover:bg-muted/30 cursor-pointer ${
                        n.cancelada ? "opacity-60" : ""
                      }`}
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest("[data-no-row-click]")) return;
                        setDrawerNotaId(n.id);
                      }}
                    >
                      <TableCell data-no-row-click onClick={(e) => e.stopPropagation()}>
                        {!n.cancelada && (
                          <Checkbox
                            checked={selecionadas.has(n.id)}
                            onCheckedChange={() => toggleOne(n.id)}
                            disabled={readOnly}
                            aria-label="Selecionar nota"
                          />
                        )}
                      </TableCell>
                      <TableCell className="font-medium tabular-nums">{n.numero_nfe ?? "—"}</TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">{formatDateBR(n.emissao_nfe)}</TableCell>
                      <TableCell className="max-w-[260px]">
                        <span className="truncate block">{n.prestador_razao ?? "—"}</span>
                      </TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">{formatCNPJ(n.prestador_cnpj)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {n.prestador_municipio ? `${n.prestador_municipio}${n.prestador_uf ? "/" + n.prestador_uf : ""}` : "—"}
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        <CnaeCell value={n.cnae_descricao} />
                      </TableCell>
                      <TableCell className={`text-right tabular-nums whitespace-nowrap ${n.cancelada ? "line-through" : ""}`}>
                        {formatBRL(n.valor_nfe)}
                      </TableCell>
                      <TableCell data-no-row-click onClick={(e) => e.stopPropagation()}>
                        {n.cancelada ? (
                          <Badge variant="outline" className="bg-muted text-muted-foreground">CANCELADA</Badge>
                        ) : (
                          <AcumuladorCombobox
                            valueId={n.acumulador_id}
                            acumuladores={acumuladores}
                            disabled={readOnly}
                            onChange={(aid) => aplicarAcumulador(n.id, aid)}
                          />
                        )}
                      </TableCell>
                    </motion.tr>
                  );
                })}
              </TableBody>
            </Table>

            {/* Paginação */}
            {totalPag > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
                <p className="text-xs text-muted-foreground tabular-nums">
                  Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtradas.length)} de {filtradas.length}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page - 1)}
                    disabled={page <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" /> Anterior
                  </Button>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {page} / {totalPag}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={page >= totalPag}
                  >
                    Próxima <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Drawer */}
        <NotaDrawer
          nota={drawerNota}
          onClose={() => setDrawerNotaId(null)}
        />

        {/* Confirmar conclusão */}
        <AlertDialog open={confirmConcluirOpen} onOpenChange={setConfirmConcluirOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Concluir competência?</AlertDialogTitle>
              <AlertDialogDescription>
                {profile?.role === "cliente"
                  ? "Ao marcar como concluída, sua contabilidade será notificada para gerar o arquivo de importação. Quer prosseguir?"
                  : "Ao concluir, esta competência ficará disponível para exportação no formato Domínio. Você poderá reabrir caso precise ajustar."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={acaoLoading}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={acaoLoading}
                onClick={(e) => { e.preventDefault(); handleConcluir(); }}
                className="bg-brand text-brand-foreground hover:bg-brand/90"
              >
                {acaoLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Concluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Confirmar reabertura (escritório) */}
        <AlertDialog open={confirmReabrirOpen} onOpenChange={setConfirmReabrirOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reabrir esta competência?</AlertDialogTitle>
              <AlertDialogDescription>
                Os usuários cliente poderão classificar novamente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={acaoLoading}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={acaoLoading}
                onClick={(e) => { e.preventDefault(); handleReabrir(); }}
                className="bg-brand text-brand-foreground hover:bg-brand/90"
              >
                {acaoLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Reabrir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* NFs pendentes (export) */}
        <Dialog
          open={!!pendentes}
          onOpenChange={(o) => { if (!o) { setPendentes(null); setTipoPendencia(null); } }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {tipoPendencia === "ibge"
                  ? "Há prestadores sem código IBGE"
                  : "Há notas pendentes de classificação"}
              </DialogTitle>
              <DialogDescription>
                {tipoPendencia === "ibge"
                  ? "Re-importe a planilha ou edite os prestadores abaixo antes de exportar."
                  : "Classifique as notas abaixo antes de exportar."}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-80 overflow-auto rounded-lg border bg-muted/20 p-3 space-y-1">
              {(pendentes ?? []).map((p, i) => (
                <p key={i} className="text-sm font-mono">{p}</p>
              ))}
            </div>
            <DialogFooter>
              <Button
                onClick={() => { setPendentes(null); setTipoPendencia(null); }}
                className="bg-brand text-brand-foreground hover:bg-brand/90"
              >
                Voltar à classificação
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

// ============================================================
// Subcomponentes
// ============================================================

function FiltroChip({
  ativo, label, count, onClick,
}: { ativo: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors ${
        ativo
          ? "bg-brand text-brand-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
      }`}
    >
      {label}
      <span className={`tabular-nums text-xs ${ativo ? "opacity-90" : "opacity-70"}`}>({count})</span>
    </button>
  );
}

function CnaeCell({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  if (value.length <= 40) return <span className="text-sm">{value}</span>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-sm truncate block cursor-help">{value.slice(0, 40)}…</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">{value}</TooltipContent>
    </Tooltip>
  );
}

function AcumuladorList({
  acumuladores, mostrarLimpar, onSelect,
}: {
  acumuladores: Acumulador[];
  mostrarLimpar: boolean;
  onSelect: (id: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const filtrados = useMemo(() => {
    const q = normalize(query);
    if (!q) return acumuladores;
    return acumuladores.filter((a) => normalize(a.descricao).includes(q));
  }, [acumuladores, query]);

  const useVirtual = acumuladores.length > 50;
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: filtrados.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 8,
  });

  return (
    <Command shouldFilter={false}>
      <CommandInput
        autoFocus
        value={query}
        onValueChange={setQuery}
        placeholder="Buscar acumulador…"
      />
      {useVirtual ? (
        <>
          {mostrarLimpar && (
            <div className="px-1 pt-1">
              <button
                onClick={() => onSelect(null)}
                className="w-full text-left px-2 py-1.5 text-sm rounded text-muted-foreground hover:bg-muted"
              >
                Limpar classificação
              </button>
            </div>
          )}
          <div ref={parentRef} className="max-h-[320px] overflow-auto">
            {filtrados.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum acumulador.</p>
            ) : (
              <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                {virtualizer.getVirtualItems().map((vi) => {
                  const a = filtrados[vi.index];
                  return (
                    <button
                      key={a.id}
                      onClick={() => onSelect(a.id)}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: vi.size,
                        transform: `translateY(${vi.start}px)`,
                      }}
                      className="text-left px-3 py-2 text-sm hover:bg-muted truncate"
                    >
                      {a.descricao}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : (
        <CommandList>
          <CommandEmpty>Nenhum acumulador encontrado.</CommandEmpty>
          {mostrarLimpar && (
            <CommandGroup>
              <CommandItem
                value="__limpar__"
                onSelect={() => onSelect(null)}
                className="text-muted-foreground"
              >
                Limpar classificação
              </CommandItem>
            </CommandGroup>
          )}
          <CommandGroup>
            {filtrados.map((a) => (
              <CommandItem
                key={a.id}
                value={a.id}
                onSelect={() => onSelect(a.id)}
              >
                {a.descricao}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      )}
    </Command>
  );
}

function AcumuladorCombobox({
  valueId, acumuladores, disabled, onChange,
}: {
  valueId: string | null;
  acumuladores: Acumulador[];
  disabled?: boolean;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const atual = valueId ? acumuladores.find((a) => a.id === valueId) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={`w-72 justify-between font-normal ${atual ? "" : "text-muted-foreground"}`}
        >
          <span className="truncate">
            {atual ? atual.descricao : "Selecione um acumulador…"}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <AcumuladorList
          acumuladores={acumuladores}
          mostrarLimpar={!!valueId}
          onSelect={(aid) => {
            setOpen(false);
            onChange(aid);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

// ---------- Drawer ----------
function NotaDrawer({ nota, onClose }: { nota: Nota | null; onClose: () => void }) {
  return (
    <Sheet open={!!nota} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] overflow-y-auto">
        {nota && (
          <>
            <SheetHeader>
              <SheetTitle className="font-display">
                NF {nota.numero_nfe ?? "—"}
                <span className="text-muted-foreground font-normal"> · </span>
                <span className="font-normal">{nota.prestador_razao ?? "—"}</span>
              </SheetTitle>
            </SheetHeader>
            <Tabs defaultValue="resumo" className="mt-6">
              <TabsList className="w-full">
                <TabsTrigger value="resumo" className="flex-1">Resumo</TabsTrigger>
                <TabsTrigger value="tributacao" className="flex-1">Tributação</TabsTrigger>
                <TabsTrigger value="bruto" className="flex-1">Bruto</TabsTrigger>
              </TabsList>
              <TabsContent value="resumo" className="space-y-4 pt-4">
                {nota.cancelada && (
                  <Badge variant="outline" className="bg-muted text-muted-foreground">CANCELADA</Badge>
                )}
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <Field label="Emissão" value={formatDateBR(nota.emissao_nfe)} />
                  <Field label="Data Competência" value={formatDateBR(nota.data_competencia)} />
                  <Field label="Prestador" value={nota.prestador_razao} fullCol />
                  <Field label="CNPJ" value={formatCNPJ(nota.prestador_cnpj)} />
                  <Field label="Município" value={nota.prestador_municipio} />
                  <Field label="UF" value={nota.prestador_uf} />
                  <Field label="Endereço" value={nota.prestador_endereco} fullCol />
                  <Field label="CNAE" value={nota.cnae_descricao} fullCol />
                  <Field label="Serviço Municipal" value={nota.servico_municipal} fullCol />
                  <Field label="Valor NFe" value={formatBRL(nota.valor_nfe)} />
                  <Field label="Desconto" value={formatBRL(nota.desconto)} />
                  <Field label="Valor Contábil" value={formatBRL(nota.valor_contabil)} />
                </div>
                {nota.observacao && (
                  <div className="mt-4 p-3 rounded-lg bg-brand-soft/40 border border-brand/15">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Observação</p>
                    <p className="text-sm whitespace-pre-wrap">{nota.observacao}</p>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="tributacao" className="pt-4">
                <TributacaoTab raw={nota.raw_data} />
              </TabsContent>
              <TabsContent value="bruto" className="pt-4">
                <pre className="font-mono text-xs bg-muted/40 rounded-lg p-3 overflow-auto max-h-[calc(100vh-200px)]">
{JSON.stringify(nota.raw_data ?? {}, null, 2)}
                </pre>
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value, fullCol }: { label: string; value: any; fullCol?: boolean }) {
  return (
    <div className={fullCol ? "col-span-2" : ""}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm mt-0.5 break-words">{value ?? "—"}</p>
    </div>
  );
}

const TRIBUTOS: { nome: string; base?: string; aliq?: string; valor: string }[] = [
  { nome: "ISS", base: "Base de Cálculo ISS", aliq: "% ISS Dentro do Município", valor: "Valor ISS Dentro do Município" },
  { nome: "PIS", aliq: "% PIS", valor: "Valor PIS" },
  { nome: "COFINS", aliq: "% COFINS", valor: "Valor COFINS" },
  { nome: "IRRF", aliq: "% IRRF", valor: "Valor IRRF" },
  { nome: "CSLL", aliq: "% CSLL", valor: "Valor CSLL" },
  { nome: "INSS", aliq: "% INSS", valor: "Valor INSS" },
  { nome: "CSRF", aliq: "% CSRF", valor: "Valor CSRF" },
];

function getRaw(raw: any, key: string): number | null {
  if (!raw) return null;
  const v = raw[key];
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function TributacaoTab({ raw }: { raw: any }) {
  const linhas = TRIBUTOS.map((t) => ({
    nome: t.nome,
    base: t.base ? getRaw(raw, t.base) : null,
    aliq: t.aliq ? getRaw(raw, t.aliq) : null,
    valor: getRaw(raw, t.valor),
  }));
  const algoComValor = linhas.some((l) => (l.valor ?? 0) > 0 || (l.base ?? 0) > 0);
  if (!algoComValor) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">Sem retenção</p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tributo</TableHead>
          <TableHead className="text-right">Base</TableHead>
          <TableHead className="text-right">Alíquota</TableHead>
          <TableHead className="text-right">Valor</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {linhas.map((l) => (
          <TableRow key={l.nome}>
            <TableCell className="font-medium">{l.nome}</TableCell>
            <TableCell className="text-right tabular-nums">{l.base != null ? formatBRL(l.base) : "—"}</TableCell>
            <TableCell className="text-right tabular-nums">{l.aliq != null ? `${l.aliq.toLocaleString("pt-BR")}%` : "—"}</TableCell>
            <TableCell className="text-right tabular-nums">{l.valor != null ? formatBRL(l.valor) : "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
