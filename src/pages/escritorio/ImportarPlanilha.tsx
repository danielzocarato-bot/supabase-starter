import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { toast } from "sonner";
import {
  Check, ChevronsUpDown, FileSpreadsheet, Loader2, Upload, X, CheckCircle2,
} from "lucide-react";
import { maskCNPJ } from "@/lib/format";

type Cliente = { id: string; razao_social: string; cnpj: string };

type Resultado = {
  competencia_id: string;
  adicionadas: number;
  mescladas: number;
  total: number;
  linhas_ignoradas: number;
  enriquecidos: number;
  falhas_enriquecimento: number;
};

const PASSOS_FAKE = [
  "Lendo notas fiscais…",
  "Consultando Receita Federal…",
  "Mesclando classificações existentes…",
];

const MAX_BYTES = 20 * 1024 * 1024;

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function periodoLabel(periodo: string) {
  // "2026-03" → "Março / 2026"
  const m = periodo.match(/^(\d{4})-(\d{2})$/);
  if (!m) return periodo;
  const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  return `${meses[parseInt(m[2], 10) - 1]} / ${m[1]}`;
}

export default function ImportarPlanilha() {
  const nav = useNavigate();
  const location = useLocation();
  const stateNav = (location.state ?? {}) as { cliente_id?: string };

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState<string>(stateNav.cliente_id ?? "");
  const [comboOpen, setComboOpen] = useState(false);
  const [periodo, setPeriodo] = useState<string>("");
  const [arquivo, setArquivo] = useState<File | null>(null);
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

  // Anima passos fake durante submit
  useEffect(() => {
    if (!submitting) {
      setProgressIdx(0);
      return;
    }
    const timers = [
      setTimeout(() => setProgressIdx(1), 1800),
      setTimeout(() => setProgressIdx(2), 4200),
    ];
    return () => timers.forEach(clearTimeout);
  }, [submitting]);

  const clienteSelecionado = useMemo(
    () => clientes.find((c) => c.id === clienteId) ?? null,
    [clientes, clienteId],
  );

  const podeSubmeter =
    !submitting && !!clienteId && /^\d{4}-\d{2}$/.test(periodo) && !!arquivo;

  function selecionarArquivo(file: File | null) {
    if (!file) {
      setArquivo(null);
      return;
    }
    const ext = file.name.toLowerCase();
    if (!ext.endsWith(".xlsx") && !ext.endsWith(".xls")) {
      toast.error("Algo precisa de atenção", {
        description: "Envie um arquivo .xlsx ou .xls.",
      });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Algo precisa de atenção", {
        description: "O arquivo excede o limite de 20 MB.",
      });
      return;
    }
    setArquivo(file);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) selecionarArquivo(f);
  }

  async function handleSubmit() {
    if (!podeSubmeter || !arquivo) return;
    setSubmitting(true);
    setResultado(null);

    try {
      const fd = new FormData();
      fd.append("arquivo", arquivo);
      fd.append("cliente_id", clienteId);
      fd.append("periodo", periodo);

      const { data, error } = await supabase.functions.invoke("importar-planilha", {
        body: fd,
      });

      if (error || (data && data.ok === false)) {
        const msg = (data as any)?.error || error?.message || "Não conseguimos ler este arquivo.";
        toast.error("Algo precisa de atenção", { description: msg });
        setSubmitting(false);
        return;
      }

      const r = data as Resultado & { ok: true };
      setResultado({
        competencia_id: r.competencia_id,
        adicionadas: r.adicionadas,
        mescladas: r.mescladas,
        total: r.total,
        linhas_ignoradas: r.linhas_ignoradas ?? 0,
        enriquecidos: r.enriquecidos,
        falhas_enriquecimento: r.falhas_enriquecimento,
      });
      toast.success("Competência importada com segurança.");
    } catch (e: any) {
      toast.error("Algo precisa de atenção", {
        description: e?.message ?? "Verifique se a planilha está no formato correto.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  function reiniciar() {
    setResultado(null);
    setArquivo(null);
    setPeriodo("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-semibold">Importar Planilha</h1>
          <p className="text-muted-foreground mt-1">
            Carregue a planilha mensal de NFSe tomadas para uma competência.
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

              {/* Período */}
              <div className="space-y-2">
                <Label htmlFor="periodo">Competência</Label>
                <Input
                  id="periodo"
                  type="month"
                  value={periodo}
                  onChange={(e) => setPeriodo(e.target.value)}
                />
                {periodo && /^\d{4}-\d{2}$/.test(periodo) && (
                  <p className="text-xs text-muted-foreground">
                    {periodoLabel(periodo)}
                  </p>
                )}
              </div>

              {/* Arquivo */}
              <div className="space-y-2">
                <Label>Planilha</Label>
                <div
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                    drag
                      ? "border-brand bg-brand-soft/30"
                      : arquivo
                      ? "border-brand/40 bg-brand-soft/10"
                      : "border-border hover:border-brand/40 hover:bg-muted/40"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => selecionarArquivo(e.target.files?.[0] ?? null)}
                  />
                  {arquivo ? (
                    <div className="flex flex-col items-center gap-2">
                      <FileSpreadsheet className="h-10 w-10 text-brand" />
                      <p className="font-medium text-foreground">{arquivo.name}</p>
                      <p className="text-xs text-muted-foreground">{formatBytes(arquivo.size)}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          selecionarArquivo(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        className="text-muted-foreground hover:text-foreground mt-1"
                      >
                        Trocar arquivo
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-10 w-10 text-muted-foreground" />
                      <p className="text-sm">
                        <span className="font-medium text-foreground">Arraste a planilha aqui</span>{" "}
                        <span className="text-muted-foreground">ou clique para escolher</span>
                      </p>
                      <p className="text-xs text-muted-foreground">.xlsx ou .xls — até 20 MB</p>
                    </div>
                  )}
                </div>
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
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ResumoLinha label="Notas adicionadas" valor={resultado.adicionadas} />
                <ResumoLinha
                  label="Notas mescladas"
                  valor={resultado.mescladas}
                  hint="classificações preservadas"
                />
                <ResumoLinha
                  label="Prestadores enriquecidos"
                  valor={resultado.enriquecidos}
                  hint="via Receita Federal"
                />
                <ResumoLinha
                  label="Falhas no enriquecimento"
                  valor={resultado.falhas_enriquecimento}
                  muted
                />
                {resultado.linhas_ignoradas > 0 && (
                  <ResumoLinha
                    label="Linhas ignoradas"
                    valor={resultado.linhas_ignoradas}
                    hint="sem #Id"
                    muted
                  />
                )}
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-2 border-t">
                <Button variant="outline" onClick={reiniciar}>
                  Importar outra
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
                <p className="font-display font-semibold text-lg">Processando planilha…</p>
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
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-display font-semibold mt-1 ${muted ? "text-muted-foreground" : "text-foreground"}`}>
        {valor}
      </p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}
