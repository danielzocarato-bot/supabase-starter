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
import { Skeleton } from "@/components/ui/skeleton";
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
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, ChevronDown,
  ChevronRight, ChevronsUpDown, Download, Eye, Layers, List, Loader2, Search, Undo2,
} from "lucide-react";
import { StatusCompetenciaBadge } from "@/components/StatusCompetenciaBadge";
import { formatCNPJ } from "@/lib/format";
import { useStatusActions } from "@/lib/useStatusActions";
import { NotaDrawerNFe, type DrawerNota, type DrawerItem } from "@/components/NotaDrawerNFe";

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

type CompetenciaStatus = "aberta" | "concluida" | "exportada";
type TipoOperacao = "nfe_entrada" | "nfe_saida" | "nfse_tomada";

type Competencia = {
  id: string;
  cliente_id: string;
  periodo: string;
  status: CompetenciaStatus;
  tipo: TipoOperacao;
  arquivo_origem: string | null;
  exportada_em: string | null;
};
type Cliente = { id: string; razao_social: string; cnpj: string };

type Acumulador = {
  id: string;
  codigo: number;
  descricao: string;
};

type NotaInfo = {
  id: string;
  numero_nfe: string | null;
  chave_nfe: string | null;
  emissao_nfe: string | null;
  valor_nfe: number | null;
  cancelada: boolean;
  observacao: string | null;
  tipo_operacao_nfe: string | null;
  prestador_razao: string | null;
  prestador_cnpj: string | null;
  raw_data: any;
};

type ItemNFe = {
  id: string;
  nota_id: string;
  numero_item: number;
  codigo_produto: string | null;
  descricao_produto: string | null;
  ncm: string | null;
  cfop: string | null;
  valor: number | null;
  acumulador_id: string | null;
  // Joined nota:
  nota_numero: string | null;
  nota_chave: string | null;
  nota_emissao: string | null;
  nota_cancelada: boolean;
  parceiro_razao: string | null;
  parceiro_cnpj: string | null;
};

type Modo = "cfop" | "nota";

export default function ClassificacaoNFe() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [competencia, setCompetencia] = useState<Competencia | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [acumuladores, setAcumuladores] = useState<Acumulador[]>([]);
  const [itens, setItens] = useState<ItemNFe[]>([]);
  const [notasMapState, setNotasMapState] = useState<Map<string, NotaInfo>>(new Map());

  const [filtro, setFiltro] = useState<"todos" | "aguardando" | "classificados">("todos");
  const [buscaInput, setBuscaInput] = useState("");
  const [busca, setBusca] = useState("");
  const [showSaveIndicator, setShowSaveIndicator] = useState(false);
  const [pisca, setPisca] = useState<Set<string>>(new Set());
  const [exportando, setExportando] = useState(false);

  // Drawer state
  const [drawerNotaId, setDrawerNotaId] = useState<string | null>(null);

  // Bulk overwrite confirmation
  const [confirmBulk, setConfirmBulk] = useState<{
    cfop: string;
    grupoIds: string[];
    sobrescritaIds: string[];
    acumuladorIdNovo: string | null;
  } | null>(null);

  // Modo persiste em ?modo=cfop|nota (default cfop)
  const modo: Modo = (searchParams.get("modo") as Modo) === "nota" ? "nota" : "cfop";
  const setModo = (m: Modo) => {
    const sp = new URLSearchParams(searchParams);
    if (m === "cfop") sp.delete("modo"); else sp.set("modo", m);
    setSearchParams(sp, { replace: true });
  };

  // Debounce busca
  useEffect(() => {
    const t = setTimeout(() => setBusca(buscaInput), 200);
    return () => clearTimeout(t);
  }, [buscaInput]);

  // Carga inicial
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const compReq = supabase
        .from("competencias")
        .select("id, cliente_id, periodo, status, tipo, arquivo_origem, exportada_em, clientes(id, razao_social, cnpj)")
        .eq("id", id)
        .maybeSingle();

      const notasReq = supabase
        .from("notas_fiscais")
        .select("id, numero_nfe, chave_nfe, emissao_nfe, valor_nfe, cancelada, observacao, tipo_operacao_nfe, prestador_razao, prestador_cnpj, raw_data")
        .eq("competencia_id", id);

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
        tipo: (cd.tipo ?? "nfe_entrada") as TipoOperacao,
        arquivo_origem: cd.arquivo_origem,
        exportada_em: cd.exportada_em,
      };
      const cli: Cliente | null = cd.clientes
        ? { id: cd.clientes.id, razao_social: cd.clientes.razao_social, cnpj: cd.clientes.cnpj }
        : null;
      setCompetencia(comp);
      setCliente(cli);

      const notasMap = new Map<string, NotaInfo>();
      (notasRes.data ?? []).forEach((n: any) => {
        notasMap.set(n.id, {
          id: n.id,
          numero_nfe: n.numero_nfe,
          chave_nfe: n.chave_nfe,
          emissao_nfe: n.emissao_nfe,
          valor_nfe: n.valor_nfe == null ? null : Number(n.valor_nfe),
          cancelada: !!n.cancelada,
          observacao: n.observacao,
          tipo_operacao_nfe: n.tipo_operacao_nfe,
          prestador_razao: n.prestador_razao,
          prestador_cnpj: n.prestador_cnpj,
          raw_data: n.raw_data,
        });
      });
      setNotasMapState(notasMap);

      const notaIds = Array.from(notasMap.keys());
      let itensData: any[] = [];
      if (notaIds.length > 0) {
        const { data: itensRes, error: itensErr } = await supabase
          .from("notas_fiscais_itens")
          .select("id, nota_id, numero_item, codigo_produto, descricao_produto, ncm, cfop, valor, acumulador_id")
          .in("nota_id", notaIds)
          .order("nota_id", { ascending: true })
          .order("numero_item", { ascending: true });
        if (itensErr) {
          toast.error("Algo precisa de atenção", { description: itensErr.message });
        }
        itensData = itensRes ?? [];
      }

      const merged: ItemNFe[] = itensData.map((i) => {
        const n = notasMap.get(i.nota_id);
        return {
          id: i.id,
          nota_id: i.nota_id,
          numero_item: i.numero_item,
          codigo_produto: i.codigo_produto,
          descricao_produto: i.descricao_produto,
          ncm: i.ncm,
          cfop: i.cfop,
          valor: i.valor == null ? null : Number(i.valor),
          acumulador_id: i.acumulador_id,
          nota_numero: n?.numero_nfe ?? null,
          nota_chave: n?.chave_nfe ?? null,
          nota_emissao: n?.emissao_nfe ?? null,
          nota_cancelada: !!n?.cancelada,
          parceiro_razao: n?.prestador_razao ?? null,
          parceiro_cnpj: n?.prestador_cnpj ?? null,
        };
      });
      setItens(merged);

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
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  const acumMap = useMemo(() => {
    const m = new Map<string, Acumulador>();
    acumuladores.forEach((a) => m.set(a.id, a));
    return m;
  }, [acumuladores]);

  // Itens elegíveis (exclui cancelados)
  const itensElegiveis = useMemo(
    () => itens.filter((i) => !i.nota_cancelada),
    [itens],
  );
  const totalItens = itensElegiveis.length;
  const totalClassificados = useMemo(
    () => itensElegiveis.filter((i) => i.acumulador_id).length,
    [itensElegiveis],
  );
  const aguardandoCount = totalItens - totalClassificados;
  const pct = totalItens > 0 ? (totalClassificados / totalItens) * 100 : 0;
  const readOnly = !!competencia && competencia.status !== "aberta";
  const podeConcluir =
    !!competencia &&
    competencia.status === "aberta" &&
    totalItens > 0 &&
    totalClassificados === totalItens;

  // Filtragem
  const itensFiltrados = useMemo(() => {
    const q = normalize(busca);
    return itensElegiveis.filter((i) => {
      if (filtro === "aguardando" && i.acumulador_id) return false;
      if (filtro === "classificados" && !i.acumulador_id) return false;
      if (q) {
        const haystack = normalize(
          `${i.descricao_produto ?? ""} ${i.codigo_produto ?? ""} ${i.ncm ?? ""} ${i.cfop ?? ""} ${i.parceiro_razao ?? ""} ${i.nota_numero ?? ""}`,
        );
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [itensElegiveis, busca, filtro]);

  // Agrupamento por CFOP
  type GrupoCfop = {
    cfop: string;
    itens: ItemNFe[];
    valorTotal: number;
    classificados: number;
    acumuladorComum: string | null;
  };
  const gruposCfop = useMemo<GrupoCfop[]>(() => {
    const map = new Map<string, ItemNFe[]>();
    itensFiltrados.forEach((i) => {
      const k = i.cfop || "—";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(i);
    });
    const arr: GrupoCfop[] = [];
    map.forEach((lista, cfop) => {
      const valorTotal = lista.reduce((s, x) => s + (Number(x.valor) || 0), 0);
      const classificados = lista.filter((x) => x.acumulador_id).length;
      const ids = new Set(lista.map((x) => x.acumulador_id ?? "__none__"));
      const acumuladorComum =
        ids.size === 1 && !ids.has("__none__")
          ? (lista[0].acumulador_id as string)
          : null;
      arr.push({ cfop, itens: lista, valorTotal, classificados, acumuladorComum });
    });
    arr.sort((a, b) => a.cfop.localeCompare(b.cfop));
    return arr;
  }, [itensFiltrados]);

  // Agrupamento por nota (modo "Por nota") — INCLUI canceladas (visualmente riscadas)
  type GrupoNota = {
    notaId: string;
    info: NotaInfo;
    itensAll: ItemNFe[];
    itensFiltrados: ItemNFe[];
    classificados: number;
    total: number;
  };
  const gruposNota = useMemo<GrupoNota[]>(() => {
    const filtradosPorNota = new Map<string, ItemNFe[]>();
    itensFiltrados.forEach((i) => {
      if (!filtradosPorNota.has(i.nota_id)) filtradosPorNota.set(i.nota_id, []);
      filtradosPorNota.get(i.nota_id)!.push(i);
    });
    const allPorNota = new Map<string, ItemNFe[]>();
    itens.forEach((i) => {
      if (!allPorNota.has(i.nota_id)) allPorNota.set(i.nota_id, []);
      allPorNota.get(i.nota_id)!.push(i);
    });

    // Sempre mostra notas que tem ao menos 1 item depois do filtro,
    // e também notas canceladas se não houver filtro/busca ativa.
    const notaIds = new Set<string>(filtradosPorNota.keys());

    const arr: GrupoNota[] = [];
    notaIds.forEach((notaId) => {
      const info = notasMapState.get(notaId);
      if (!info) return;
      const all = allPorNota.get(notaId) ?? [];
      const filt = filtradosPorNota.get(notaId) ?? [];
      const classificados = all.filter((x) => x.acumulador_id).length;
      arr.push({
        notaId, info,
        itensAll: all,
        itensFiltrados: filt,
        classificados,
        total: all.length,
      });
    });
    arr.sort((a, b) => {
      const da = a.info.emissao_nfe ?? "";
      const db = b.info.emissao_nfe ?? "";
      if (da !== db) return da.localeCompare(db);
      return (a.info.numero_nfe ?? "").localeCompare(b.info.numero_nfe ?? "");
    });
    return arr;
  }, [itens, itensFiltrados, notasMapState]);

  // Save indicator
  const saveTimerRef = useRef<number | null>(null);
  const triggerSaveIndicator = () => {
    setShowSaveIndicator(true);
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => setShowSaveIndicator(false), 2000) as any;
  };

  const flashRows = (ids: string[]) => {
    setPisca((prev) => {
      const next = new Set(prev);
      ids.forEach((i) => next.add(i));
      return next;
    });
    window.setTimeout(() => {
      setPisca((prev) => {
        const next = new Set(prev);
        ids.forEach((i) => next.delete(i));
        return next;
      });
    }, 600);
  };

  const persistAcumulador = useCallback(
    async (itemIds: string[], acumuladorId: string | null, snapshot: ItemNFe[]) => {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("notas_fiscais_itens")
        .update({
          acumulador_id: acumuladorId,
          classificado_em: acumuladorId ? now : null,
          classificado_por: acumuladorId ? profile?.id ?? null : null,
        })
        .in("id", itemIds);

      if (error) {
        setItens(snapshot);
        toast.error("Algo precisa de atenção", { description: error.message });
        return false;
      }
      flashRows(itemIds);
      triggerSaveIndicator();
      return true;
    },
    [profile?.id],
  );

  const aplicarAcumuladorIds = async (itemIds: string[], acumuladorId: string | null, isBulk: boolean) => {
    if (readOnly || itemIds.length === 0) return;
    const snapshot = itens;
    setItens((prev) =>
      prev.map((i) =>
        itemIds.includes(i.id) ? { ...i, acumulador_id: acumuladorId } : i,
      ),
    );
    const ok = await persistAcumulador(itemIds, acumuladorId, snapshot);
    if (ok && acumuladorId && isBulk) {
      toast.success(
        `${itemIds.length} ${itemIds.length === 1 ? "item classificado" : "itens classificados"} em massa.`,
      );
    }
  };

  // Bulk com checagem de sobrescrita
  const aplicarAcumuladorGrupo = (
    grupoCfop: string,
    grupoItens: ItemNFe[],
    acumuladorIdNovo: string | null,
  ) => {
    if (readOnly) return;
    const grupoIds = grupoItens.map((i) => i.id);
    const sobrescritaIds = grupoItens
      .filter((i) => i.acumulador_id && i.acumulador_id !== acumuladorIdNovo)
      .map((i) => i.id);

    if (acumuladorIdNovo && sobrescritaIds.length > 0) {
      setConfirmBulk({
        cfop: grupoCfop,
        grupoIds,
        sobrescritaIds,
        acumuladorIdNovo,
      });
      return;
    }
    aplicarAcumuladorIds(grupoIds, acumuladorIdNovo, true);
  };

  // Status actions (concluir/reabrir)
  const status = useStatusActions({
    competencia: competencia
      ? {
          id: competencia.id,
          cliente_id: competencia.cliente_id,
          periodo: competencia.periodo,
          status: competencia.status,
          exportada_em: competencia.exportada_em,
        }
      : null,
    setCompetencia: (c) => {
      if (!competencia) return;
      setCompetencia({
        ...competencia,
        status: c.status,
        exportada_em: c.exportada_em,
      });
    },
    cliente,
    profile,
    totalClassificavel: totalItens,
  });

  const handleExportarPlaceholder = () => {
    setExportando(true);
    setTimeout(() => setExportando(false), 400);
    toast.info("Exportação NFe será implementada na Fase 4.");
  };

  // -------- Render --------
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
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

  const tipoLabel = competencia.tipo === "nfe_saida" ? "NFe Saída" : "NFe Entrada";
  const TipoIcon = competencia.tipo === "nfe_saida" ? ArrowUpFromLine : ArrowDownToLine;
  const parceiroLabel = competencia.tipo === "nfe_saida" ? "Destinatário" : "Emitente";

  // Drawer current
  const drawerNota: DrawerNota | null = drawerNotaId
    ? (notasMapState.get(drawerNotaId) as DrawerNota | undefined) ?? null
    : null;
  const drawerItens: DrawerItem[] = drawerNotaId
    ? itens
        .filter((i) => i.nota_id === drawerNotaId)
        .map((i) => ({
          id: i.id,
          numero_item: i.numero_item,
          codigo_produto: i.codigo_produto,
          descricao_produto: i.descricao_produto,
          ncm: i.ncm,
          cfop: i.cfop,
          valor: i.valor,
          acumulador_id: i.acumulador_id,
        }))
    : [];

  const sobrescritaQtd = confirmBulk?.sobrescritaIds.length ?? 0;
  const grupoQtd = confirmBulk?.grupoIds.length ?? 0;

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
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-display font-semibold">
                  {cliente.razao_social} <span className="text-muted-foreground font-normal">·</span>{" "}
                  {formatPeriodo(competencia.periodo)}
                </h1>
                <Badge
                  variant="outline"
                  className="bg-brand-soft text-brand border-brand/20 gap-1"
                >
                  <TipoIcon className="h-3.5 w-3.5" />
                  {tipoLabel}
                </Badge>
              </div>
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
                    onClick={() => status.setConfirmReabrirOpen(true)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    Reabrir competência
                  </Button>
                )}
                {profile?.role === "escritorio" &&
                  (competencia.status === "concluida" || competencia.status === "exportada") && (
                  <Button
                    size="sm"
                    onClick={handleExportarPlaceholder}
                    disabled={exportando}
                    variant={competencia.status === "exportada" ? "outline" : "default"}
                    className={
                      competencia.status === "exportada"
                        ? ""
                        : "bg-brand text-brand-foreground hover:bg-brand/90"
                    }
                  >
                    {exportando
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Download className="h-4 w-4" />}
                    {exportando
                      ? "Processando…"
                      : competencia.status === "exportada"
                        ? "Re-exportar TXT"
                        : "Exportar TXT Domínio"}
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
                    {totalClassificados} de {totalItens} itens classificados
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
                        onClick={() => status.setConfirmConcluirOpen(true)}
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

        {/* Filtros + busca + modo */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <FiltroChip
              ativo={filtro === "todos"}
              label="Todos"
              count={itensElegiveis.length}
              onClick={() => setFiltro("todos")}
            />
            <FiltroChip
              ativo={filtro === "aguardando"}
              label="Aguardando classificação"
              count={aguardandoCount}
              onClick={() => setFiltro("aguardando")}
            />
            <FiltroChip
              ativo={filtro === "classificados"}
              label="Classificados"
              count={totalClassificados}
              onClick={() => setFiltro("classificados")}
            />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex rounded-md border bg-card p-0.5">
              <button
                onClick={() => setModo("cfop")}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-sm transition-colors ${
                  modo === "cfop"
                    ? "bg-brand text-brand-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                Por CFOP
              </button>
              <button
                onClick={() => setModo("nota")}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-sm transition-colors ${
                  modo === "nota"
                    ? "bg-brand text-brand-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <List className="h-3.5 w-3.5" />
                Por nota
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={buscaInput}
                onChange={(e) => setBuscaInput(e.target.value)}
                placeholder="Buscar produto, NCM, CFOP, parceiro…"
                className="pl-9 w-80"
              />
            </div>
          </div>
        </div>

        {/* Conteúdo */}
        {itensElegiveis.length === 0 ? (
          <Card className="p-12 rounded-xl text-center space-y-3">
            <p className="text-muted-foreground max-w-md mx-auto">
              Esta competência ainda não tem itens NFe. Verifique a importação dos XMLs.
            </p>
            <Button variant="outline" onClick={() => nav(voltarUrl)}>
              Voltar para o cliente
            </Button>
          </Card>
        ) : itensFiltrados.length === 0 ? (
          <Card className="p-12 rounded-xl text-center">
            <p className="text-muted-foreground">Nenhum item encontrado com esses filtros.</p>
          </Card>
        ) : modo === "cfop" ? (
          <div className="space-y-3">
            {gruposCfop.map((g) => (
              <GrupoCfopCard
                key={g.cfop}
                grupo={g}
                acumuladores={acumuladores}
                acumMap={acumMap}
                pisca={pisca}
                readOnly={readOnly}
                parceiroLabel={parceiroLabel}
                onAplicarGrupo={(aid) => aplicarAcumuladorGrupo(g.cfop, g.itens, aid)}
                onAplicarItem={(itemId, aid) => aplicarAcumuladorIds([itemId], aid, false)}
              />
            ))}
          </div>
        ) : (
          <PorNotaList
            grupos={gruposNota}
            acumuladores={acumuladores}
            acumMap={acumMap}
            pisca={pisca}
            readOnly={readOnly}
            tipoIsSaida={competencia.tipo === "nfe_saida"}
            onAplicarItem={(itemId, aid) => aplicarAcumuladorIds([itemId], aid, false)}
            onAbrirDrawer={(notaId) => setDrawerNotaId(notaId)}
          />
        )}

        {/* Drawer */}
        <NotaDrawerNFe
          nota={drawerNota}
          itens={drawerItens}
          acumuladores={acumuladores}
          readOnly={readOnly}
          pisca={pisca}
          onClose={() => setDrawerNotaId(null)}
          onClassificarItem={(itemId, aid) => aplicarAcumuladorIds([itemId], aid, false)}
        />

        {/* AlertDialog: sobrescrita bulk */}
        <AlertDialog
          open={!!confirmBulk}
          onOpenChange={(v) => { if (!v) setConfirmBulk(null); }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sobrescrever classificação de itens?</AlertDialogTitle>
              <AlertDialogDescription>
                {sobrescritaQtd} de {grupoQtd} itens deste CFOP já têm um acumulador diferente.
                Aplicar o novo acumulador vai sobrescrever essas escolhas. Continuar?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  if (!confirmBulk) return;
                  const { grupoIds, acumuladorIdNovo } = confirmBulk;
                  setConfirmBulk(null);
                  aplicarAcumuladorIds(grupoIds, acumuladorIdNovo, true);
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Sobrescrever
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* AlertDialog: concluir */}
        <AlertDialog open={status.confirmConcluirOpen} onOpenChange={status.setConfirmConcluirOpen}>
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
              <AlertDialogCancel disabled={status.acaoLoading}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={status.acaoLoading}
                onClick={(e) => { e.preventDefault(); status.handleConcluir(); }}
                className="bg-brand text-brand-foreground hover:bg-brand/90"
              >
                {status.acaoLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Concluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* AlertDialog: reabrir */}
        <AlertDialog open={status.confirmReabrirOpen} onOpenChange={status.setConfirmReabrirOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reabrir esta competência?</AlertDialogTitle>
              <AlertDialogDescription>
                Os usuários cliente poderão classificar novamente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={status.acaoLoading}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={status.acaoLoading}
                onClick={(e) => { e.preventDefault(); status.handleReabrir(); }}
                className="bg-brand text-brand-foreground hover:bg-brand/90"
              >
                {status.acaoLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Reabrir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

// ============================================================
// Modo Por nota (cards expansíveis)
// ============================================================

type GrupoNotaRender = {
  notaId: string;
  info: NotaInfo;
  itensAll: ItemNFe[];
  itensFiltrados: ItemNFe[];
  classificados: number;
  total: number;
};

function PorNotaList({
  grupos, acumuladores, acumMap, pisca, readOnly, tipoIsSaida,
  onAplicarItem, onAbrirDrawer,
}: {
  grupos: GrupoNotaRender[];
  acumuladores: Acumulador[];
  acumMap: Map<string, Acumulador>;
  pisca: Set<string>;
  readOnly: boolean;
  tipoIsSaida: boolean;
  onAplicarItem: (itemId: string, acumuladorId: string | null) => void;
  onAbrirDrawer: (notaId: string) => void;
}) {
  const useVirtual = grupos.length > 50;
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: grupos.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 96,
    overscan: 6,
  });

  if (!useVirtual) {
    return (
      <div className="space-y-3">
        {grupos.map((g) => (
          <NotaCard
            key={g.notaId}
            grupo={g}
            acumuladores={acumuladores}
            acumMap={acumMap}
            pisca={pisca}
            readOnly={readOnly}
            tipoIsSaida={tipoIsSaida}
            onAplicarItem={onAplicarItem}
            onAbrirDrawer={onAbrirDrawer}
          />
        ))}
      </div>
    );
  }

  return (
    <div ref={parentRef} className="max-h-[70vh] overflow-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const g = grupos[vi.index];
          return (
            <div
              key={g.notaId}
              ref={virtualizer.measureElement}
              data-index={vi.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vi.start}px)`,
                paddingBottom: 12,
              }}
            >
              <NotaCard
                grupo={g}
                acumuladores={acumuladores}
                acumMap={acumMap}
                pisca={pisca}
                readOnly={readOnly}
                tipoIsSaida={tipoIsSaida}
                onAplicarItem={onAplicarItem}
                onAbrirDrawer={onAbrirDrawer}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NotaCard({
  grupo, acumuladores, acumMap, pisca, readOnly, tipoIsSaida,
  onAplicarItem, onAbrirDrawer,
}: {
  grupo: GrupoNotaRender;
  acumuladores: Acumulador[];
  acumMap: Map<string, Acumulador>;
  pisca: Set<string>;
  readOnly: boolean;
  tipoIsSaida: boolean;
  onAplicarItem: (itemId: string, acumuladorId: string | null) => void;
  onAbrirDrawer: (notaId: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const { info, itensFiltrados, classificados, total } = grupo;
  const cancelada = info.cancelada;
  const pctNota = total > 0 ? (classificados / total) * 100 : 0;
  const TipoIcon = tipoIsSaida ? ArrowUpFromLine : ArrowDownToLine;
  const tipoLabel = tipoIsSaida ? "Saída" : "Entrada";

  return (
    <Card className={`rounded-xl overflow-hidden ${cancelada ? "opacity-70" : ""}`}>
      <div
        className="flex items-center gap-4 p-4 hover:bg-muted/30 cursor-pointer transition-colors"
        onClick={() => setAberto((v) => !v)}
      >
        <button
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label={aberto ? "Recolher" : "Expandir"}
        >
          <motion.span
            animate={{ rotate: aberto ? 90 : 0 }}
            transition={{ duration: 0.18 }}
            className="inline-block"
          >
            <ChevronRight className="h-4 w-4" />
          </motion.span>
        </button>

        <div className="flex items-center gap-3 min-w-0 flex-1 flex-wrap">
          <Badge variant="outline" className="bg-brand-soft text-brand border-brand/20 gap-1 shrink-0">
            <TipoIcon className="h-3 w-3" />
            {tipoLabel}
          </Badge>
          <div className={`font-mono text-sm font-semibold tabular-nums ${cancelada ? "line-through" : ""}`}>
            NF-e {info.numero_nfe ?? "—"}
          </div>
          <div className={`text-xs text-muted-foreground tabular-nums ${cancelada ? "line-through" : ""}`}>
            {formatDateBR(info.emissao_nfe)}
          </div>
          <div className={`min-w-0 flex-1 truncate text-sm ${cancelada ? "line-through text-muted-foreground" : ""}`}>
            <span className="font-medium">{info.prestador_razao ?? "—"}</span>{" "}
            <span className="text-muted-foreground font-mono text-xs">
              {formatCNPJ(info.prestador_cnpj)}
            </span>
          </div>
          <div className={`text-sm tabular-nums shrink-0 ${cancelada ? "line-through text-muted-foreground" : ""}`}>
            {formatBRL(info.valor_nfe)}
          </div>

          {cancelada ? (
            <Badge variant="destructive" className="shrink-0">CANCELADA</Badge>
          ) : (
            <div className="flex items-center gap-2 shrink-0 min-w-[160px]">
              <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand transition-all"
                  style={{ width: `${pctNota}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                {classificados}/{total}
              </span>
            </div>
          )}
        </div>

        <div onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAbrirDrawer(grupo.notaId)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Eye className="h-3.5 w-3.5" />
            Ver detalhes
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {aberto && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="border-t overflow-hidden"
          >
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="w-12">Item</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="w-[110px]">NCM</TableHead>
                  <TableHead className="w-[80px]">CFOP</TableHead>
                  <TableHead className="text-right w-[120px]">Valor</TableHead>
                  <TableHead className="w-[280px]">Acumulador</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itensFiltrados.map((i) => {
                  const isPiscando = pisca.has(i.id);
                  return (
                    <motion.tr
                      key={i.id}
                      animate={
                        isPiscando
                          ? { backgroundColor: ["hsl(var(--success) / 0.15)", "hsl(var(--success) / 0)"] }
                          : { backgroundColor: "hsl(var(--success) / 0)" }
                      }
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      className="border-b last:border-b-0 hover:bg-muted/30"
                    >
                      <TableCell className="tabular-nums">{i.numero_item}</TableCell>
                      <TableCell className="max-w-[280px]">
                        <DescricaoCell value={i.descricao_produto} codigo={i.codigo_produto} />
                      </TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">{i.ncm ?? "—"}</TableCell>
                      <TableCell className="font-mono tabular-nums">{i.cfop ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {formatBRL(i.valor)}
                      </TableCell>
                      <TableCell>
                        <AcumuladorCombobox
                          valueId={i.acumulador_id}
                          acumuladores={acumuladores}
                          disabled={readOnly || cancelada}
                          onChange={(aid) => onAplicarItem(i.id, aid)}
                        />
                      </TableCell>
                    </motion.tr>
                  );
                })}
              </TableBody>
            </Table>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

// ============================================================
// Grupo CFOP
// ============================================================

function GrupoCfopCard({
  grupo, acumuladores, acumMap, pisca, readOnly, parceiroLabel,
  onAplicarGrupo, onAplicarItem,
}: {
  grupo: {
    cfop: string;
    itens: ItemNFe[];
    valorTotal: number;
    classificados: number;
    acumuladorComum: string | null;
  };
  acumuladores: Acumulador[];
  acumMap: Map<string, Acumulador>;
  pisca: Set<string>;
  readOnly: boolean;
  parceiroLabel: string;
  onAplicarGrupo: (acumuladorId: string | null) => void;
  onAplicarItem: (itemId: string, acumuladorId: string | null) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const totalGrupo = grupo.itens.length;
  const isCompleto = grupo.classificados === totalGrupo;
  const pendentes = totalGrupo - grupo.classificados;

  return (
    <Card className="rounded-xl overflow-hidden">
      <div
        className="flex items-center gap-4 p-4 hover:bg-muted/30 cursor-pointer transition-colors"
        onClick={() => setAberto((v) => !v)}
      >
        <button
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label={aberto ? "Recolher" : "Expandir"}
        >
          {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="font-mono text-base font-semibold tabular-nums">{grupo.cfop}</div>
          <Badge variant="outline" className="font-normal">
            {totalGrupo} {totalGrupo === 1 ? "item" : "itens"}
          </Badge>
          <span className="text-sm text-muted-foreground tabular-nums">
            {formatBRL(grupo.valorTotal)}
          </span>
          {isCompleto ? (
            <Badge variant="outline" className="bg-success/10 text-success border-success/30 gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Classificado
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-muted text-muted-foreground">
              {pendentes} pendente{pendentes === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
        <div data-no-row-click onClick={(e) => e.stopPropagation()}>
          <Popover open={bulkOpen} onOpenChange={setBulkOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                disabled={readOnly}
                className={`min-w-[280px] justify-between font-normal ${
                  grupo.acumuladorComum ? "" : "text-muted-foreground"
                }`}
              >
                <span className="truncate">
                  {grupo.acumuladorComum
                    ? acumMap.get(grupo.acumuladorComum)?.descricao ?? "Acumulador"
                    : grupo.classificados > 0
                      ? "Vários acumuladores"
                      : "Aplicar acumulador a todo o grupo"}
                </span>
                <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="end">
              <AcumuladorList
                acumuladores={acumuladores}
                mostrarLimpar={!!grupo.acumuladorComum || grupo.classificados > 0}
                onSelect={(aid) => {
                  setBulkOpen(false);
                  onAplicarGrupo(aid);
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {aberto && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="border-t overflow-hidden"
          >
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead>NF</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>NCM</TableHead>
                  <TableHead>{parceiroLabel}</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="w-[280px]">Acumulador</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grupo.itens.map((i) => {
                  const isPiscando = pisca.has(i.id);
                  return (
                    <motion.tr
                      key={i.id}
                      animate={
                        isPiscando
                          ? { backgroundColor: ["hsl(var(--success) / 0.15)", "hsl(var(--success) / 0)"] }
                          : { backgroundColor: "hsl(var(--success) / 0)" }
                      }
                      transition={{ duration: 0.6, ease: "easeOut" }}
                      className="border-b last:border-b-0 hover:bg-muted/30"
                    >
                      <TableCell className="font-medium tabular-nums whitespace-nowrap">
                        {i.nota_numero ?? "—"}
                      </TableCell>
                      <TableCell className="tabular-nums">{i.numero_item}</TableCell>
                      <TableCell className="max-w-[280px]">
                        <DescricaoCell value={i.descricao_produto} codigo={i.codigo_produto} />
                      </TableCell>
                      <TableCell className="tabular-nums whitespace-nowrap">{i.ncm ?? "—"}</TableCell>
                      <TableCell className="max-w-[200px]">
                        <span className="truncate block text-sm">{i.parceiro_razao ?? "—"}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {formatBRL(i.valor)}
                      </TableCell>
                      <TableCell>
                        <AcumuladorCombobox
                          valueId={i.acumulador_id}
                          acumuladores={acumuladores}
                          disabled={readOnly}
                          onChange={(aid) => onAplicarItem(i.id, aid)}
                        />
                      </TableCell>
                    </motion.tr>
                  );
                })}
              </TableBody>
            </Table>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

// ============================================================
// Componentes auxiliares
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

function DescricaoCell({ value, codigo }: { value: string | null; codigo: string | null }) {
  const text = value ?? "—";
  const short = text.length > 50 ? `${text.slice(0, 50)}…` : text;
  return (
    <div className="min-w-0">
      {text.length > 50 ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-sm block truncate cursor-help">{short}</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">{text}</TooltipContent>
        </Tooltip>
      ) : (
        <span className="text-sm block truncate">{short}</span>
      )}
      {codigo && (
        <span className="text-xs text-muted-foreground font-mono">{codigo}</span>
      )}
    </div>
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
          className={`w-full justify-between font-normal ${atual ? "" : "text-muted-foreground"}`}
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
