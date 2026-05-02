import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import {
  Check, ChevronsUpDown, FileCode2, Loader2, Upload, X, CheckCircle2, AlertTriangle, Trash2, Cloud, Search,
} from "lucide-react";
import { maskCNPJ } from "@/lib/format";

type Cliente = { id: string; razao_social: string; cnpj: string };
type TipoNFe = "nfe_entrada" | "nfe_saida";

type NaoAplicavel = { chave: string; motivo: string };

type Resultado = {
  competencia_id: string;
  notas_processadas: number;
  itens_processados: number;
  duplicadas_atualizadas: number;
  nao_aplicaveis: NaoAplicavel[];
  invalidos: number;
  enriquecidos: number;
  falhas_enriquecimento: number;
  containers_descompactados?: number;
  formato_falho?: string | null;
};

const PASSOS_FAKE = [
  "Lendo arquivos…",
  "Validando notas fiscais…",
  "Consultando Receita Federal…",
];

const TIPO_LABEL: Record<TipoNFe, string> = {
  nfe_entrada: "NF-e — Entrada (mercadorias compradas)",
  nfe_saida: "NF-e — Saída (mercadorias vendidas)",
};

const TIPO_LABEL_CURTO: Record<TipoNFe, string> = {
  nfe_entrada: "NF-e Entrada",
  nfe_saida: "NF-e Saída",
};

const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function periodoLabel(periodo: string) {
  const m = periodo.match(/^(\d{4})-(\d{2})$/);
  if (!m) return periodo;
  const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  return `${meses[parseInt(m[2], 10) - 1]} / ${m[1]}`;
}

export default function ImportarXmls() {
  const nav = useNavigate();
  const location = useLocation();
  const stateNav = (location.state ?? {}) as { cliente_id?: string };

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState<string>(stateNav.cliente_id ?? "");
  const [comboOpen, setComboOpen] = useState(false);
  const [tiposDisponiveis, setTiposDisponiveis] = useState<TipoNFe[]>([]);
  const [carregandoTipos, setCarregandoTipos] = useState(false);
  const [tipo, setTipo] = useState<TipoNFe | "">("");
  const [periodo, setPeriodo] = useState<string>("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [drag, setDrag] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [progressIdx, setProgressIdx] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  // Carrega clientes ativos
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, razao_social, cnpj")
        .eq("ativo", true)
        .order("razao_social");
      if (error) {
        toast.error("Algo precisa de atenção", { description: error.message });
        return;
      }
      setClientes(data ?? []);
    })();
  }, []);

  // Carrega tipos disponíveis ao trocar de cliente
  useEffect(() => {
    if (!clienteId) {
      setTiposDisponiveis([]);
      setTipo("");
      return;
    }
    let cancel = false;
    (async () => {
      setCarregandoTipos(true);
      const { data } = await supabase
        .from("cliente_operacoes")
        .select("tipo")
        .eq("cliente_id", clienteId)
        .eq("ativo", true)
        .in("tipo", ["nfe_entrada", "nfe_saida"]);
      if (cancel) return;
      const tipos = (data ?? []).map((d: any) => d.tipo as TipoNFe);
      setTiposDisponiveis(tipos);
      if (tipos.length === 1) setTipo(tipos[0]);
      else setTipo("");
      setCarregandoTipos(false);
    })();
    return () => { cancel = true; };
  }, [clienteId]);

  // Anima passos fake durante submit
  useEffect(() => {
    if (!submitting) {
      setProgressIdx(0);
      return;
    }
    const timers = [
      setTimeout(() => setProgressIdx(1), 2000),
      setTimeout(() => setProgressIdx(2), 4000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [submitting]);

  const clienteSelecionado = useMemo(
    () => clientes.find((c) => c.id === clienteId) ?? null,
    [clientes, clienteId],
  );

  const semNFeConfigurada = !!clienteId && !carregandoTipos && tiposDisponiveis.length === 0;

  const totalBytes = useMemo(
    () => arquivos.reduce((acc, f) => acc + f.size, 0),
    [arquivos],
  );

  const podeSubmeter =
    !submitting &&
    !semNFeConfigurada &&
    !!clienteId &&
    !!tipo &&
    /^\d{4}-\d{2}$/.test(periodo) &&
    arquivos.length > 0 &&
    totalBytes <= MAX_TOTAL_BYTES;

  function adicionarArquivos(novos: FileList | File[] | null) {
    if (!novos) return;
    const lista = Array.from(novos);
    const aceitos: File[] = [];
    const aceitas = [".xml", ".zip", ".rar", ".7z"];
    for (const f of lista) {
      const lower = f.name.toLowerCase();
      if (!aceitas.some((ext) => lower.endsWith(ext))) {
        toast.error("Algo precisa de atenção", {
          description: `"${f.name}" foi ignorado — apenas .xml, .zip, .rar ou .7z são aceitos.`,
        });
        continue;
      }
      aceitos.push(f);
    }
    if (aceitos.length === 0) return;
    setArquivos((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}-${f.size}`));
      const merged = [...prev];
      for (const f of aceitos) {
        const key = `${f.name}-${f.size}`;
        if (!seen.has(key)) {
          merged.push(f);
          seen.add(key);
        }
      }
      const novoTotal = merged.reduce((acc, f) => acc + f.size, 0);
      if (novoTotal > MAX_TOTAL_BYTES) {
        toast.error("Algo precisa de atenção", {
          description: "O total de arquivos excede o limite de 100 MB.",
        });
        return prev;
      }
      return merged;
    });
  }

  function removerArquivo(idx: number) {
    setArquivos((prev) => prev.filter((_, i) => i !== idx));
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDrag(false);
    if (semNFeConfigurada) return;
    adicionarArquivos(e.dataTransfer.files);
  }

  async function handleSubmit() {
    if (!podeSubmeter || !tipo) return;
    setSubmitting(true);
    setResultado(null);
    try {
      const fd = new FormData();
      fd.append("cliente_id", clienteId);
      fd.append("periodo", periodo);
      fd.append("tipo", tipo);
      arquivos.forEach((f) => fd.append("arquivos[]", f));

      const { data, error } = await supabase.functions.invoke("importar-xmls-nfe", {
        body: fd,
      });

      if (error || (data && data.ok === false)) {
        const formatoFalho = (data as any)?.formato_falho as string | undefined;
        if (formatoFalho) {
          toast.error("Algo precisa de atenção", {
            description: `Não conseguimos descompactar arquivos .${formatoFalho}. Descompacte localmente e suba os XMLs ou arquivos .zip.`,
          });
        } else {
          const msg = (data as any)?.error || error?.message || "Não conseguimos processar os arquivos.";
          toast.error("Algo precisa de atenção", { description: msg });
        }
        setSubmitting(false);
        return;
      }

      const r = data as Resultado & { ok: true };
      setResultado({
        competencia_id: r.competencia_id,
        notas_processadas: r.notas_processadas ?? 0,
        itens_processados: r.itens_processados ?? 0,
        duplicadas_atualizadas: r.duplicadas_atualizadas ?? 0,
        nao_aplicaveis: r.nao_aplicaveis ?? [],
        invalidos: r.invalidos ?? 0,
        enriquecidos: r.enriquecidos ?? 0,
        falhas_enriquecimento: r.falhas_enriquecimento ?? 0,
        containers_descompactados: r.containers_descompactados ?? 0,
        formato_falho: r.formato_falho ?? null,
      });
      toast.success("Competência importada com segurança.");
    } catch (e: any) {
      toast.error("Algo precisa de atenção", {
        description: e?.message ?? "Verifique os arquivos e tente novamente.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  function reiniciar() {
    setResultado(null);
    setArquivos([]);
    setPeriodo("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-semibold">Importar XMLs</h1>
          <p className="text-muted-foreground mt-1">
            Carregue XMLs de NF-e (entrada ou saída) para uma competência. Aceita .xml, .zip, .rar e .7z.
          </p>
        </div>
        {!resultado && (
          <Button
            variant="ghost"
            onClick={() => nav("/app/escritorio")}
            className="text-muted-foreground hover:text-foreground"
            disabled={submitting}
          >
            <X className="h-4 w-4" />
            Cancelar
          </Button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {!resultado ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            <Card className="p-6 sm:p-8 rounded-xl space-y-6">
              {/* Cliente */}
              <div className="space-y-2">
                <Label>Cliente</Label>
                <Popover open={comboOpen} onOpenChange={setComboOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={comboOpen}
                      className="w-full justify-between font-normal"
                    >
                      {clienteSelecionado ? (
                        <span className="truncate">
                          {clienteSelecionado.razao_social}
                          <span className="text-muted-foreground ml-2">
                            {maskCNPJ(clienteSelecionado.cnpj)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Selecione um cliente…</span>
                      )}
                      <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command
                      filter={(value, search) => {
                        const c = clientes.find((x) => x.id === value);
                        if (!c) return 0;
                        const haystack = `${c.razao_social} ${c.cnpj}`.toLowerCase();
                        return haystack.includes(search.toLowerCase()) ? 1 : 0;
                      }}
                    >
                      <CommandInput placeholder="Buscar por razão social ou CNPJ…" />
                      <CommandList>
                        <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                        <CommandGroup>
                          {clientes.map((c) => (
                            <CommandItem
                              key={c.id}
                              value={c.id}
                              onSelect={() => {
                                setClienteId(c.id);
                                setComboOpen(false);
                              }}
                            >
                              <Check
                                className={`h-4 w-4 ${clienteId === c.id ? "opacity-100" : "opacity-0"}`}
                              />
                              <div className="flex flex-col">
                                <span>{c.razao_social}</span>
                                <span className="text-xs text-muted-foreground">
                                  {maskCNPJ(c.cnpj)}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Empty state quando cliente não tem NF-e */}
              {semNFeConfigurada && (
                <div className="rounded-xl border border-brand/30 bg-brand-soft/20 p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-brand shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-foreground">
                        Este cliente não tem NF-e configurada.
                      </p>
                      <p className="text-muted-foreground mt-0.5">
                        Configure em Detalhe do Cliente → Operações.
                      </p>
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
                    <Link to={`/app/escritorio/clientes/${clienteId}?tab=operacoes`}>
                      Abrir cadastro do cliente
                    </Link>
                  </Button>
                </div>
              )}

              {/* Tipo de operação */}
              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo de operação</Label>
                <Select
                  value={tipo}
                  onValueChange={(v) => setTipo(v as TipoNFe)}
                  disabled={semNFeConfigurada || tiposDisponiveis.length === 0}
                >
                  <SelectTrigger id="tipo">
                    <SelectValue placeholder={
                      tiposDisponiveis.length === 0
                        ? "Selecione um cliente primeiro…"
                        : "Selecione o tipo…"
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {tiposDisponiveis.map((t) => (
                      <SelectItem key={t} value={t}>{TIPO_LABEL[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Período */}
              <div className="space-y-2">
                <Label htmlFor="periodo">Competência</Label>
                <Input
                  id="periodo"
                  type="month"
                  value={periodo}
                  onChange={(e) => setPeriodo(e.target.value)}
                  disabled={semNFeConfigurada}
                />
                {periodo && /^\d{4}-\d{2}$/.test(periodo) && (
                  <p className="text-xs text-muted-foreground">
                    {periodoLabel(periodo)}
                  </p>
                )}
              </div>

              {/* Arquivos */}
              <div className="space-y-2">
                <Label>Arquivos XML</Label>
                <div
                  onDragOver={(e) => { if (!semNFeConfigurada) { e.preventDefault(); setDrag(true); } }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={onDrop}
                  onClick={() => !semNFeConfigurada && fileInputRef.current?.click()}
                  className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                    semNFeConfigurada
                      ? "border-border bg-muted/20 cursor-not-allowed opacity-60"
                      : drag
                      ? "border-brand bg-brand-soft/30 cursor-pointer"
                      : arquivos.length > 0
                      ? "border-brand/40 bg-brand-soft/10 cursor-pointer"
                      : "border-border hover:border-brand/40 hover:bg-muted/40 cursor-pointer"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xml,.zip,.rar,.7z"
                    multiple
                    className="hidden"
                    onChange={(e) => adicionarArquivos(e.target.files)}
                    disabled={semNFeConfigurada}
                  />
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="h-10 w-10 text-muted-foreground" />
                    <p className="text-sm">
                      <span className="font-medium text-foreground">Arraste arquivos aqui</span>{" "}
                      <span className="text-muted-foreground">ou clique para escolher</span>
                    </p>
                    <p className="text-xs text-muted-foreground">.xml, .zip, .rar ou .7z — até 100 MB no total</p>
                  </div>
                </div>

                {arquivos.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                      <span>{arquivos.length} arquivo(s) selecionado(s)</span>
                      <span>{formatBytes(totalBytes)} / 100 MB</span>
                    </div>
                    <ul className="rounded-lg border border-border divide-y divide-border max-h-56 overflow-auto">
                      {arquivos.map((f, idx) => (
                        <li key={`${f.name}-${idx}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                          <FileCode2 className="h-4 w-4 text-brand shrink-0" />
                          <span className="flex-1 truncate">{f.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">{formatBytes(f.size)}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); removerArquivo(idx); }}
                            className="h-7 px-2 text-muted-foreground hover:text-danger"
                            aria-label={`Remover ${f.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  onClick={handleSubmit}
                  disabled={!podeSubmeter}
                  className="bg-brand text-brand-foreground hover:bg-brand/90"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {submitting ? "Processando…" : "Importar"}
                </Button>
              </div>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key="resultado"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="space-y-4"
          >
            <Card className="p-8 rounded-xl space-y-6">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-full bg-success/15 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-6 w-6 text-success" />
                </div>
                <div>
                  <h2 className="text-xl font-display font-semibold">
                    Competência {periodoLabel(periodo)} importada com segurança.
                  </h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    {clienteSelecionado?.razao_social}
                    {tipo && <> · {TIPO_LABEL_CURTO[tipo as TipoNFe]}</>}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ResumoLinha label="Notas processadas" valor={resultado.notas_processadas} />
                <ResumoLinha label="Itens processados" valor={resultado.itens_processados} />
                {(resultado.containers_descompactados ?? 0) > 1 && (
                  <ResumoLinha
                    label="Arquivos extraídos"
                    valor={resultado.containers_descompactados ?? 0}
                    hint="containers descompactados"
                  />
                )}
                {resultado.duplicadas_atualizadas > 0 && (
                  <ResumoLinha
                    label="Notas atualizadas"
                    valor={resultado.duplicadas_atualizadas}
                    hint="classificações preservadas"
                  />
                )}
                <ResumoLinha
                  label="Prestadores enriquecidos"
                  valor={resultado.enriquecidos}
                  hint="via Receita Federal"
                />
                {resultado.falhas_enriquecimento > 0 && (
                  <ResumoLinha
                    label="Falhas no enriquecimento"
                    valor={resultado.falhas_enriquecimento}
                    muted
                  />
                )}
                {resultado.invalidos > 0 && (
                  <ResumoLinha
                    label="Arquivos inválidos ignorados"
                    valor={resultado.invalidos}
                    muted
                  />
                )}
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-2 border-t">
                <Button variant="outline" onClick={reiniciar}>
                  Importar mais
                </Button>
                <Button
                  onClick={() =>
                    nav(
                      `/app/escritorio/clientes/${clienteId}?tab=competencias&destacar=${resultado.competencia_id}`,
                    )
                  }
                  className="bg-brand text-brand-foreground hover:bg-brand/90"
                >
                  Abrir competência
                </Button>
              </div>
            </Card>

            {resultado.nao_aplicaveis.length > 0 && (
              <Card className="p-6 rounded-xl border-warning/40 bg-warning/5 space-y-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-display font-semibold">
                      {resultado.nao_aplicaveis.length} NFe(s) não aplicáveis a este cliente
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Estas notas foram ignoradas porque o CNPJ do cliente não confere com{" "}
                      {tipo === "nfe_entrada" ? "destinatário" : "emitente"}{" "}
                      esperado para este tipo de operação.
                    </p>
                  </div>
                </div>
                <ul className="rounded-lg border border-border bg-background divide-y divide-border max-h-60 overflow-auto text-sm">
                  {resultado.nao_aplicaveis.map((n, idx) => (
                    <li key={idx} className="px-3 py-2 flex items-center gap-3">
                      <code className="text-xs font-mono text-muted-foreground shrink-0">
                        …{n.chave.slice(-8)}
                      </code>
                      <span className="flex-1 text-foreground/80">{n.motivo}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlay de processamento */}
      <AnimatePresence>
        {submitting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center"
          >
            <Card className="p-8 rounded-xl flex flex-col items-center gap-5 max-w-sm mx-4">
              <Loader2 className="h-12 w-12 text-brand animate-spin" />
              <div className="text-center space-y-2">
                <p className="font-display font-semibold text-lg">Processando XMLs…</p>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={progressIdx}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                    className="text-sm text-muted-foreground"
                  >
                    {PASSOS_FAKE[progressIdx]}
                  </motion.p>
                </AnimatePresence>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ResumoLinha({
  label, valor, hint, muted,
}: { label: string; valor: number; hint?: string; muted?: boolean }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${muted ? "border-border bg-muted/30" : "border-border bg-card"}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-display font-semibold mt-0.5 ${muted ? "text-muted-foreground" : "text-foreground"}`}>
        {valor}
      </p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}
