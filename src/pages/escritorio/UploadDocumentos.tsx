import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { toast } from "sonner";
import {
  Upload, Loader2, Check, ChevronsUpDown, FileScan, X, Trash2, AlertCircle,
} from "lucide-react";

type Categoria = "boleto" | "fatura" | "apolice";
type Status = "pendente" | "processando" | "extraido" | "erro";

interface Cliente {
  id: string;
  razao_social: string;
  cnpj: string;
}

interface DocItem {
  id: string;          // local UUID
  file: File;
  categoria: Categoria | null;
  status: Status;
  erro?: string;
  notaId?: string;
  competenciaId?: string;
  campos?: ExtractFields;
  // marcadores de campos editados pelo usuário (não sobrescrever)
  edited: Set<string>;
}

interface ExtractFields {
  prestador_razao: string;
  prestador_cnpj: string;
  prestador_endereco: string;
  prestador_municipio: string;
  prestador_uf: string;
  numero_nfe: string;
  emissao_nfe: string;        // YYYY-MM-DD
  data_vencimento: string;    // YYYY-MM-DD
  valor_nfe: string;          // string p/ input
  descricao: string;
  cfop: string;
}

const CATEGORIA_LABEL: Record<Categoria, string> = {
  boleto: "Boleto",
  fatura: "Fatura",
  apolice: "Apólice",
};

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function currentPeriodo() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

type Conf = "alta" | "revisar" | "vazio";
function confidenceText(v?: string): Conf {
  if (!v || !v.trim()) return "vazio";
  if (v.trim().length > 5) return "alta";
  return "revisar";
}
function confidenceNumber(v?: string): Conf {
  if (!v || !v.trim()) return "vazio";
  const n = Number(v.replace(",", "."));
  if (!isFinite(n) || n <= 0) return "vazio";
  return "alta";
}
function ConfBadge({ c }: { c: Conf }) {
  if (c === "alta") return <Badge className="bg-success/15 text-success border-success/30 hover:bg-success/15">alta</Badge>;
  if (c === "revisar") return <Badge className="bg-warning/15 text-warning border-warning/30 hover:bg-warning/15">revisar</Badge>;
  return <Badge className="bg-danger/15 text-danger border-danger/30 hover:bg-danger/15">vazio</Badge>;
}

export default function UploadDocumentos() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState<string>("");
  const [periodo, setPeriodo] = useState<string>(currentPeriodo());
  const [carregandoClientes, setCarregandoClientes] = useState(true);
  const [comboOpen, setComboOpen] = useState(false);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const contextoOk = !!clienteId && /^\d{4}-\d{2}$/.test(periodo);

  // Carrega todos os clientes ativos. A operação "documento_avulso" é
  // habilitada automaticamente ao selecionar (upsert em cliente_operacoes).
  useEffect(() => {
    (async () => {
      setCarregandoClientes(true);
      const { data, error } = await supabase
        .from("clientes")
        .select("id, razao_social, cnpj")
        .eq("ativo", true)
        .order("razao_social", { ascending: true });
      if (error) {
        toast.error("Falha ao carregar clientes", { description: error.message });
        setCarregandoClientes(false);
        return;
      }
      setClientes((data ?? []) as Cliente[]);
      setCarregandoClientes(false);
    })();
  }, []);

  // Garante operação documento_avulso ativa para o cliente selecionado
  useEffect(() => {
    if (!clienteId) return;
    (async () => {
      const { data: existente } = await (supabase as any)
        .from("cliente_operacoes")
        .select("cliente_id")
        .eq("cliente_id", clienteId)
        .eq("tipo", "documento_avulso")
        .maybeSingle();
      if (!existente) {
        await (supabase as any)
          .from("cliente_operacoes")
          .insert({ cliente_id: clienteId, tipo: "documento_avulso", layout_export: "dominio_layout_209", ativo: true });
      }
    })();
  }, [clienteId]);

  const clienteSelecionado = useMemo(
    () => clientes.find((c) => c.id === clienteId) ?? null,
    [clientes, clienteId],
  );

  // Drop / select de arquivos
  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    const novos: DocItem[] = [];
    for (const f of arr) {
      if (!ACCEPT.includes(f.type) && !/\.(pdf|png|jpe?g)$/i.test(f.name)) {
        toast.error(`"${f.name}" — formato não aceito`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        toast.error(`"${f.name}" — maior que 5MB`);
        continue;
      }
      novos.push({
        id: uid(),
        file: f,
        categoria: null,
        status: "pendente",
        edited: new Set(),
      });
    }
    if (novos.length) setDocs((prev) => [...prev, ...novos]);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!contextoOk) return;
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const removeDoc = (id: string) => {
    setDocs((prev) => prev.filter((d) => d.id !== id));
  };

  const setCategoria = (id: string, c: Categoria) => {
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, categoria: c } : d)));
  };

  // Atualiza um campo do extraído marcando como editado
  const editField = (id: string, key: keyof ExtractFields, value: string) => {
    setDocs((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        const campos = { ...(d.campos as ExtractFields), [key]: value };
        const edited = new Set(d.edited);
        edited.add(key);
        return { ...d, campos, edited };
      }),
    );
  };

  const processarUm = async (docId: string): Promise<boolean> => {
    if (!contextoOk) return false;
    const doc = docs.find((d) => d.id === docId);
    if (!doc) return false;
    if (!doc.categoria) {
      toast.error(`Selecione a categoria de "${doc.file.name}"`);
      return false;
    }

    setDocs((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, status: "processando", erro: undefined } : d)),
    );

    const fd = new FormData();
    fd.append("arquivo", doc.file);
    fd.append("categoria", doc.categoria);
    fd.append("cliente_id", clienteId);
    fd.append("periodo", periodo);

    try {
      const { data, error } = await supabase.functions.invoke("processar-documento-ia", {
        body: fd,
      });

      if (error) {
        // Tenta extrair status code da mensagem
        const msg = (error as any)?.message ?? String(error);
        let user = msg;
        if (/429/.test(msg)) {
          user = "Limite de IA atingido. Aguarde cerca de 1 minuto e tente novamente.";
        } else if (/402/.test(msg)) {
          user = "Créditos de IA esgotados. Avise o escritório responsável.";
        }
        setDocs((prev) =>
          prev.map((d) => (d.id === docId ? { ...d, status: "erro", erro: user } : d)),
        );
        toast.error(`Falha em "${doc.file.name}"`, { description: user });
        return false;
      }

      const r = data as {
        ok: boolean;
        nota_id?: string;
        competencia_id?: string;
        extraido?: any;
        campos_processados?: any;
        error?: string;
      };

      if (!r?.ok) {
        const user = r?.error ?? "Falha desconhecida";
        setDocs((prev) =>
          prev.map((d) => (d.id === docId ? { ...d, status: "erro", erro: user } : d)),
        );
        toast.error(`Falha em "${doc.file.name}"`, { description: user });
        return false;
      }

      const ai = r.campos_processados ?? {};
      const ext = r.extraido ?? {};
      // Padrão UX OCR: não sobrescrever campos editados
      setDocs((prev) =>
        prev.map((d) => {
          if (d.id !== docId) return d;
          const previo = d.campos;
          const next: ExtractFields = {
            prestador_razao: pick(previo?.prestador_razao, ai.razao, d.edited.has("prestador_razao")),
            prestador_cnpj: pick(previo?.prestador_cnpj, ai.cnpj, d.edited.has("prestador_cnpj")),
            prestador_endereco: pick(previo?.prestador_endereco, ext.endereco_beneficiario ?? ext.endereco_emitente ?? ext.endereco_seguradora, d.edited.has("prestador_endereco")),
            prestador_municipio: pick(previo?.prestador_municipio, ext.municipio_beneficiario ?? ext.municipio_emitente ?? ext.municipio_seguradora, d.edited.has("prestador_municipio")),
            prestador_uf: pick(previo?.prestador_uf, ext.uf_beneficiario ?? ext.uf_emitente ?? ext.uf_seguradora, d.edited.has("prestador_uf")),
            numero_nfe: pick(previo?.numero_nfe, ext.numero_documento ?? ext.numero_apolice, d.edited.has("numero_nfe")),
            emissao_nfe: pick(previo?.emissao_nfe, ai.data_emissao, d.edited.has("emissao_nfe")),
            data_vencimento: pick(previo?.data_vencimento, ai.data_vencimento, d.edited.has("data_vencimento")),
            valor_nfe: pick(previo?.valor_nfe, ai.valor != null ? String(ai.valor) : null, d.edited.has("valor_nfe")),
            descricao: pick(previo?.descricao, ext.descricao, d.edited.has("descricao")),
            cfop: pick(previo?.cfop, ext.cfop ?? "1933", d.edited.has("cfop")),
          };
          return {
            ...d,
            status: "extraido",
            notaId: r.nota_id,
            competenciaId: r.competencia_id,
            campos: next,
          };
        }),
      );
      return true;
    } catch (e: any) {
      const user = e?.message ?? String(e);
      setDocs((prev) =>
        prev.map((d) => (d.id === docId ? { ...d, status: "erro", erro: user } : d)),
      );
      toast.error(`Falha em "${doc.file.name}"`, { description: user });
      return false;
    }
  };

  const processarTodos = async () => {
    setBatchRunning(true);
    let okCount = 0;
    let total = 0;
    for (const d of docs) {
      if (d.status === "extraido" || d.status === "processando") continue;
      if (!d.categoria) continue;
      total++;
      const ok = await processarUm(d.id);
      if (ok) okCount++;
    }
    setBatchRunning(false);
    if (total > 0 && okCount === total) {
      toast.success(`${okCount} documento(s) processado(s) com sucesso.`);
    } else if (okCount > 0) {
      toast.success(`${okCount} de ${total} processados`, {
        description: "Revise os que falharam.",
      });
    }
  };

  const salvarECalcular = async (docId: string) => {
    const doc = docs.find((d) => d.id === docId);
    if (!doc || !doc.notaId || !doc.campos) return;
    const c = doc.campos;
    const valor = Number((c.valor_nfe || "0").replace(",", "."));
    const updateNota = {
      prestador_razao: c.prestador_razao || null,
      prestador_cnpj: c.prestador_cnpj ? c.prestador_cnpj.replace(/\D/g, "") : null,
      prestador_endereco: c.prestador_endereco || null,
      prestador_municipio: c.prestador_municipio || null,
      prestador_uf: c.prestador_uf || null,
      numero_nfe: c.numero_nfe || null,
      emissao_nfe: c.emissao_nfe || null,
      data_competencia: c.emissao_nfe || null,
      data_vencimento: c.data_vencimento || null,
      valor_nfe: isFinite(valor) ? valor : null,
      valor_contabil: isFinite(valor) ? valor : null,
    };
    const { error: errNota } = await (supabase as any)
      .from("notas_fiscais")
      .update(updateNota)
      .eq("id", doc.notaId);
    if (errNota) {
      toast.error("Falha ao salvar", { description: errNota.message });
      return;
    }
    // Atualiza item (cfop / descrição / valor)
    const { error: errItem } = await (supabase as any)
      .from("notas_fiscais_itens")
      .update({
        descricao_produto: c.descricao || null,
        cfop: c.cfop || "1933",
        valor: isFinite(valor) ? valor : 0,
      })
      .eq("nota_id", doc.notaId)
      .eq("numero_item", 1);
    if (errItem) {
      toast.error("Falha ao salvar item", { description: errItem.message });
      return;
    }
    toast.success(`"${doc.file.name}" salvo. Pronto para classificar.`);
    setDocs((prev) => prev.filter((d) => d.id !== docId));
  };

  const descartar = async (docId: string) => {
    const doc = docs.find((d) => d.id === docId);
    if (!doc) return;
    if (doc.notaId) {
      const { error: errIt } = await (supabase as any)
        .from("notas_fiscais_itens")
        .delete()
        .eq("nota_id", doc.notaId);
      if (errIt) {
        toast.error("Falha ao descartar item", { description: errIt.message });
        return;
      }
      const { error: errN } = await (supabase as any)
        .from("notas_fiscais")
        .delete()
        .eq("id", doc.notaId);
      if (errN) {
        toast.error("Falha ao descartar", { description: errN.message });
        return;
      }
    }
    removeDoc(docId);
    toast.success("Documento descartado.");
  };

  return (
    <AppShell>
      <div className="space-y-6 max-w-screen-xl">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Upload de Documentos</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Boletos, faturas e apólices — extração automática via IA. Resultado entra na competência selecionada.
          </p>
        </div>

        {/* SEÇÃO A — CONTEXTO (sticky) */}
        <Card className="p-4 rounded-xl sticky top-2 z-10 bg-card/95 backdrop-blur">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <Label className="text-xs text-muted-foreground">Cliente</Label>
              <Popover open={comboOpen} onOpenChange={setComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between mt-1.5 font-normal"
                    disabled={carregandoClientes}
                  >
                    {clienteSelecionado
                      ? clienteSelecionado.razao_social
                      : carregandoClientes
                      ? "Carregando..."
                      : clientes.length
                      ? "Selecione o cliente"
                      : "Nenhum cliente com Documentos Avulsos ativo"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                  <Command>
                    <CommandInput placeholder="Buscar cliente..." />
                    <CommandList>
                      <CommandEmpty>Nenhum cliente.</CommandEmpty>
                      <CommandGroup>
                        {clientes.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={`${c.razao_social} ${c.cnpj}`}
                            onSelect={() => {
                              setClienteId(c.id);
                              setComboOpen(false);
                            }}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${
                                clienteId === c.id ? "opacity-100" : "opacity-0"
                              }`}
                            />
                            <span className="truncate">{c.razao_social}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label htmlFor="periodo" className="text-xs text-muted-foreground">Competência</Label>
              <Input
                id="periodo"
                type="month"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {contextoOk
                ? `${docs.length} arquivo(s) na fila`
                : "Selecione cliente e competência para começar"}
            </div>
          </div>
        </Card>

        {/* SEÇÃO B — UPLOAD */}
        <Card
          className={`p-6 rounded-xl border-dashed border-2 transition-colors ${
            !contextoOk
              ? "opacity-50"
              : dragOver
              ? "border-brand bg-brand-soft/30"
              : "border-border"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            if (contextoOk) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div className="flex flex-col items-center text-center gap-3 py-4">
            <div className="h-12 w-12 rounded-full bg-brand-soft flex items-center justify-center">
              <Upload className="h-5 w-5 text-brand" />
            </div>
            <div>
              <p className="font-medium">
                {contextoOk ? "Arraste PDFs/JPGs/PNGs aqui ou" : "Selecione cliente e competência primeiro"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Máximo 5MB por arquivo. Múltiplos arquivos suportados.
              </p>
            </div>
            <Button
              variant="outline"
              disabled={!contextoOk}
              onClick={() => inputRef.current?.click()}
            >
              Selecionar arquivos
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        </Card>

        {/* SEÇÃO C — LISTA / EXTRAÇÕES */}
        {docs.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-lg font-semibold">Documentos ({docs.length})</h2>
              <div className="flex items-center gap-2">
                <Select
                  onValueChange={(v) => {
                    const cat = v as Categoria;
                    setDocs((prev) =>
                      prev.map((d) =>
                        d.status === "extraido" || d.status === "processando"
                          ? d
                          : { ...d, categoria: cat },
                      ),
                    );
                    const alvos = docs.filter(
                      (d) => d.status !== "extraido" && d.status !== "processando",
                    ).length;
                    toast.success(
                      `${alvos} documento(s) categorizado(s) como ${CATEGORIA_LABEL[cat]}`,
                    );
                  }}
                  disabled={
                    batchRunning ||
                    docs.every((d) => d.status === "extraido" || d.status === "processando")
                  }
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Categorizar em lote" />
                  </SelectTrigger>
                  <SelectContent>
                    {(["boleto", "fatura", "apolice"] as Categoria[]).map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORIA_LABEL[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={processarTodos}
                  disabled={batchRunning || !contextoOk || docs.every((d) => d.status === "extraido")}
                  className="bg-brand text-brand-foreground hover:bg-brand/90"
                >
                  {batchRunning && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Processar todos
                </Button>
              </div>
            </div>

            {docs.map((d) => (
              <Card key={d.id} className="p-4 rounded-xl space-y-3">
                {/* Header card */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileScan className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{d.file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(d.file.size)}
                        {d.status === "extraido" && " · extraído"}
                        {d.status === "erro" && " · erro"}
                        {d.status === "processando" && " · processando…"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Select
                      value={d.categoria ?? undefined}
                      onValueChange={(v) => setCategoria(d.id, v as Categoria)}
                      disabled={d.status === "processando" || d.status === "extraido"}
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        {(["boleto", "fatura", "apolice"] as Categoria[]).map((c) => (
                          <SelectItem key={c} value={c}>
                            {CATEGORIA_LABEL[c]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {d.status !== "extraido" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={d.status === "processando" || !d.categoria || !contextoOk}
                        onClick={() => processarUm(d.id)}
                      >
                        {d.status === "processando" && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                        Processar
                      </Button>
                    )}

                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => (d.notaId ? descartar(d.id) : removeDoc(d.id))}
                      aria-label="Remover"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {d.status === "erro" && (
                  <div className="flex items-start gap-2 text-sm text-danger bg-danger/5 p-3 rounded-lg">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{d.erro}</span>
                  </div>
                )}

                {/* Campos extraídos */}
                {d.status === "extraido" && d.campos && (
                  <div className="border-t pt-3 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <FieldText
                        label="Razão social do prestador"
                        value={d.campos.prestador_razao}
                        onChange={(v) => editField(d.id, "prestador_razao", v)}
                      />
                      <FieldText
                        label="CNPJ"
                        value={d.campos.prestador_cnpj}
                        onChange={(v) => editField(d.id, "prestador_cnpj", v)}
                      />
                    </div>
                    <FieldText
                      label="Endereço"
                      value={d.campos.prestador_endereco}
                      onChange={(v) => editField(d.id, "prestador_endereco", v)}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <FieldText
                        label="Município"
                        value={d.campos.prestador_municipio}
                        onChange={(v) => editField(d.id, "prestador_municipio", v)}
                      />
                      <FieldText
                        label="UF"
                        value={d.campos.prestador_uf}
                        onChange={(v) => editField(d.id, "prestador_uf", v)}
                      />
                      <FieldText
                        label="Nº documento"
                        value={d.campos.numero_nfe}
                        onChange={(v) => editField(d.id, "numero_nfe", v)}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <FieldDate
                        label="Data emissão"
                        value={d.campos.emissao_nfe}
                        onChange={(v) => editField(d.id, "emissao_nfe", v)}
                      />
                      <FieldDate
                        label="Data vencimento"
                        value={d.campos.data_vencimento}
                        onChange={(v) => editField(d.id, "data_vencimento", v)}
                      />
                      <FieldNumber
                        label="Valor"
                        value={d.campos.valor_nfe}
                        onChange={(v) => editField(d.id, "valor_nfe", v)}
                      />
                    </div>
                    <FieldText
                      label="Descrição"
                      value={d.campos.descricao}
                      onChange={(v) => editField(d.id, "descricao", v)}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <FieldText
                        label="CFOP"
                        value={d.campos.cfop}
                        onChange={(v) => editField(d.id, "cfop", v)}
                        forceConf="alta"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button
                        variant="outline"
                        onClick={() => descartar(d.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-1.5" />
                        Descartar
                      </Button>
                      <Button
                        onClick={() => salvarECalcular(d.id)}
                        className="bg-brand text-brand-foreground hover:bg-brand/90"
                      >
                        Salvar e classificar
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function pick(previo: string | undefined, vindoIA: any, foiEditado: boolean): string {
  if (foiEditado) return previo ?? "";
  if (vindoIA == null || vindoIA === "") return previo ?? "";
  return String(vindoIA);
}

function FieldText({
  label, value, onChange, forceConf,
}: {
  label: string; value: string; onChange: (v: string) => void; forceConf?: Conf;
}) {
  const c = forceConf ?? confidenceText(value);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <ConfBadge c={c} />
      </div>
      <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function FieldDate({
  label, value, onChange,
}: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  const c = value ? "alta" : "vazio";
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <ConfBadge c={c} />
      </div>
      <Input type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function FieldNumber({
  label, value, onChange,
}: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  const c = confidenceNumber(value);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <ConfBadge c={c} />
      </div>
      <Input
        type="number"
        step="0.01"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
