import { useEffect, useMemo, useReducer, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Check, Loader2, Mail, Plus, Trash2, Upload, X, Info,
} from "lucide-react";
import { maskCNPJ, onlyDigits } from "@/lib/format";

// ---------- Types & state ----------
type Acumulador = { codigo: number; descricao: string };

type State = {
  step: 1 | 2 | 3;
  // Passo 1
  cnpj: string;
  razao_social: string;
  endereco: string;
  municipio: string;
  municipio_ibge: string;
  uf: string;
  codigo_empresa_dominio: string;
  email_responsavel: string;
  cnpjFetching: boolean;
  cnpjFetched: boolean;
  codigoErro: string | null;
  // Passo 2
  acumuladores: Acumulador[];
  importInvalidos: number;
  // Passo 3
  email_convite: string;
  // Submit
  submitting: boolean;
};

const initialState: State = {
  step: 1,
  cnpj: "",
  razao_social: "",
  endereco: "",
  municipio: "",
  municipio_ibge: "",
  uf: "",
  codigo_empresa_dominio: "",
  email_responsavel: "",
  cnpjFetching: false,
  cnpjFetched: false,
  codigoErro: null,
  acumuladores: [],
  importInvalidos: 0,
  email_convite: "",
  submitting: false,
};

type Action =
  | { type: "set"; patch: Partial<State> }
  | { type: "addAcum"; item: Acumulador }
  | { type: "removeAcum"; codigo: number }
  | { type: "replaceAcums"; items: Acumulador[]; invalidos: number };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "set":
      return { ...s, ...a.patch };
    case "addAcum": {
      // dedup por codigo (último vence)
      const semDup = s.acumuladores.filter(x => x.codigo !== a.item.codigo);
      return { ...s, acumuladores: [...semDup, a.item] };
    }
    case "removeAcum":
      return { ...s, acumuladores: s.acumuladores.filter(x => x.codigo !== a.codigo) };
    case "replaceAcums":
      return { ...s, acumuladores: a.items, importInvalidos: a.invalidos };
  }
}

// ---------- Stepper ----------
const STEPS = [
  { n: 1 as const, label: "Dados básicos" },
  { n: 2 as const, label: "Acumuladores" },
  { n: 3 as const, label: "Convidar usuário" },
];

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center justify-between">
      {STEPS.map((s, i) => {
        const done = step > s.n;
        const active = step === s.n;
        return (
          <div key={s.n} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-3">
              <div
                className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  done
                    ? "bg-brand text-brand-foreground"
                    : active
                    ? "bg-brand text-brand-foreground ring-4 ring-brand-soft"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {done ? <Check className="h-4 w-4" strokeWidth={2.5} /> : s.n}
              </div>
              <div className="hidden sm:block">
                <p className={`text-sm font-medium ${active || done ? "text-foreground" : "text-muted-foreground"}`}>
                  {s.label}
                </p>
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-px mx-3 sm:mx-4 ${done ? "bg-brand" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- Componente principal ----------
export default function NovoCliente() {
  const nav = useNavigate();
  const { profile } = useAuth();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Default email responsável = usuário logado
  useEffect(() => {
    if (profile?.email && !state.email_responsavel) {
      dispatch({ type: "set", patch: { email_responsavel: profile.email } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.email]);

  const cnpjDigits = onlyDigits(state.cnpj);
  const passo1Valido =
    cnpjDigits.length === 14 &&
    state.razao_social.trim().length > 0 &&
    /^\d+$/.test(state.codigo_empresa_dominio.trim()) &&
    !state.codigoErro;

  // ------- Consulta BrasilAPI -------
  const handleCnpjBlur = async () => {
    if (cnpjDigits.length !== 14 || state.cnpjFetching) return;
    dispatch({ type: "set", patch: { cnpjFetching: true } });
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjDigits}`);
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      const enderecoPartes = [
        [d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(" "),
        d.numero,
        d.bairro,
      ].filter(Boolean);
      const endereco =
        enderecoPartes.length >= 2
          ? `${enderecoPartes[0]}, ${enderecoPartes.slice(1).join(" - ")}`
          : enderecoPartes.join(" ");
      dispatch({
        type: "set",
        patch: {
          razao_social: d.razao_social || state.razao_social,
          endereco: endereco || state.endereco,
          municipio: d.municipio || state.municipio,
          municipio_ibge: d.codigo_municipio_ibge ? String(d.codigo_municipio_ibge) : state.municipio_ibge,
          uf: d.uf || state.uf,
          cnpjFetched: true,
        },
      });
      toast.success("Dados consultados na Receita Federal.");
    } catch {
      toast.error("Não conseguimos consultar este CNPJ.", {
        description: "Preencha os dados manualmente.",
      });
      dispatch({ type: "set", patch: { cnpjFetched: true } });
    } finally {
      dispatch({ type: "set", patch: { cnpjFetching: false } });
    }
  };

  // ------- Validação código domínio único -------
  const validarCodigoUnico = async (): Promise<boolean> => {
    const codigo = parseInt(state.codigo_empresa_dominio, 10);
    if (Number.isNaN(codigo)) return false;
    const { data, error } = await supabase
      .from("clientes")
      .select("id, razao_social")
      .eq("codigo_empresa_dominio", codigo)
      .maybeSingle();
    if (error) {
      toast.error("Algo precisa de atenção", { description: error.message });
      return false;
    }
    if (data) {
      dispatch({
        type: "set",
        patch: { codigoErro: `Este código já está em uso pelo cliente ${data.razao_social}. Escolha outro.` },
      });
      return false;
    }
    dispatch({ type: "set", patch: { codigoErro: null } });
    return true;
  };

  // ------- Avançar / Voltar -------
  const proximo = async () => {
    if (state.step === 1) {
      if (!passo1Valido) return;
      const ok = await validarCodigoUnico();
      if (!ok) return;
      dispatch({ type: "set", patch: { step: 2 } });
    } else if (state.step === 2) {
      dispatch({ type: "set", patch: { step: 3 } });
    } else {
      await concluir();
    }
  };
  const voltar = () => {
    if (state.step === 1) return;
    dispatch({ type: "set", patch: { step: (state.step - 1) as 1 | 2 } });
  };

  // ------- Submit final -------
  const concluir = async () => {
    dispatch({ type: "set", patch: { submitting: true } });

    const codigo = parseInt(state.codigo_empresa_dominio, 10);
    const { data: cliente, error: clienteErr } = await supabase
      .from("clientes")
      .insert({
        cnpj: cnpjDigits,
        razao_social: state.razao_social.trim(),
        codigo_empresa_dominio: codigo,
        endereco: state.endereco.trim() || null,
        municipio: state.municipio.trim() || null,
        municipio_ibge: state.municipio_ibge.trim() || null,
        uf: state.uf.trim() || null,
        ativo: true,
      })
      .select("id")
      .single();

    if (clienteErr || !cliente) {
      dispatch({ type: "set", patch: { submitting: false } });
      const msg = clienteErr?.message ?? "Falha ao cadastrar cliente.";
      if (msg.includes("duplicate") || msg.includes("unique")) {
        dispatch({ type: "set", patch: { codigoErro: "Já existe um cliente com este código ou CNPJ.", step: 1 } });
      } else {
        toast.error("Algo precisa de atenção", { description: msg });
      }
      return;
    }

    if (state.acumuladores.length > 0) {
      const rows = state.acumuladores.map(a => ({
        cliente_id: cliente.id,
        codigo: a.codigo,
        descricao: a.descricao,
        ativo: true,
      }));
      const { error: acumErr } = await supabase.from("acumuladores").insert(rows);
      if (acumErr) {
        toast.error("Cliente criado, mas alguns acumuladores falharam.", {
          description: acumErr.message,
        });
      }
    }

    if (state.email_convite.trim()) {
      const { data: inv, error: invErr } = await supabase.functions.invoke("convidar-cliente", {
        body: { email: state.email_convite.trim(), cliente_id: cliente.id },
      });
      if (invErr || (inv && inv.ok === false)) {
        const msg = (inv as any)?.error || invErr?.message || "Não foi possível enviar o convite.";
        toast.error("Cliente criado, mas o convite não saiu.", { description: msg });
      }
    }

    dispatch({ type: "set", patch: { submitting: false } });
    toast.success("Cliente cadastrado com segurança.");
    nav(`/app/escritorio/clientes/${cliente.id}`);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-semibold">Novo Cliente</h1>
          <p className="text-muted-foreground mt-1">
            Em poucos passos você organiza a estrutura completa pra que a classificação flua todo mês.
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={() => setConfirmCancel(true)}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
          Cancelar
        </Button>
      </div>

      <Card className="p-6 rounded-xl">
        <Stepper step={state.step} />
      </Card>

      <Card className="p-6 sm:p-8 rounded-xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={state.step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {state.step === 1 && (
              <Passo1
                state={state}
                dispatch={dispatch}
                onCnpjBlur={handleCnpjBlur}
              />
            )}
            {state.step === 2 && <Passo2 state={state} dispatch={dispatch} />}
            {state.step === 3 && <Passo3 state={state} dispatch={dispatch} />}
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center justify-between pt-8 mt-8 border-t">
          <Button
            variant="ghost"
            onClick={voltar}
            disabled={state.step === 1 || state.submitting}
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>

          <Button
            onClick={proximo}
            disabled={
              state.submitting ||
              (state.step === 1 && (!passo1Valido || state.cnpjFetching))
            }
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {state.submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {state.step === 3
              ? state.submitting
                ? "Processando…"
                : "Concluir cadastro"
              : "Avançar"}
            {!state.submitting && state.step !== 3 && <ArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      </Card>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar cadastro?</AlertDialogTitle>
            <AlertDialogDescription>
              Os dados preenchidos serão descartados. Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar preenchendo</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => nav("/app/escritorio/clientes")}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------- Passo 1 ----------
function Passo1({
  state, dispatch, onCnpjBlur,
}: { state: State; dispatch: React.Dispatch<Action>; onCnpjBlur: () => void }) {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="cnpj">CNPJ</Label>
        <div className="relative">
          <Input
            id="cnpj"
            value={state.cnpj}
            onChange={e => dispatch({ type: "set", patch: { cnpj: maskCNPJ(e.target.value) } })}
            onBlur={onCnpjBlur}
            placeholder="00.000.000/0000-00"
            inputMode="numeric"
            className="pr-10"
          />
          {state.cnpjFetching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Consultamos automaticamente os dados na Receita Federal ao sair do campo.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="razao">Razão Social</Label>
        <Input
          id="razao"
          value={state.razao_social}
          onChange={e => dispatch({ type: "set", patch: { razao_social: e.target.value } })}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="municipio">Município</Label>
          <Input
            id="municipio"
            value={state.municipio}
            onChange={e => dispatch({ type: "set", patch: { municipio: e.target.value } })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="uf">UF</Label>
          <Input
            id="uf"
            maxLength={2}
            value={state.uf}
            onChange={e => dispatch({ type: "set", patch: { uf: e.target.value.toUpperCase() } })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="endereco">Endereço</Label>
        <Input
          id="endereco"
          value={state.endereco}
          onChange={e => dispatch({ type: "set", patch: { endereco: e.target.value } })}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="codigo">Código da Empresa no Domínio</Label>
          <Input
            id="codigo"
            inputMode="numeric"
            value={state.codigo_empresa_dominio}
            onChange={e =>
              dispatch({
                type: "set",
                patch: {
                  codigo_empresa_dominio: e.target.value.replace(/\D/g, ""),
                  codigoErro: null,
                },
              })
            }
            aria-invalid={!!state.codigoErro}
          />
          {state.codigoErro && <p className="text-xs text-destructive">{state.codigoErro}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email_resp">Email do responsável (escritório)</Label>
          <Input
            id="email_resp"
            type="email"
            value={state.email_responsavel}
            onChange={e => dispatch({ type: "set", patch: { email_responsavel: e.target.value } })}
          />
        </div>
      </div>
    </div>
  );
}

// ---------- Passo 2 ----------
function Passo2({ state, dispatch }: { state: State; dispatch: React.Dispatch<Action> }) {
  const [aba, setAba] = useState<"importar" | "manual" | "pular">("importar");
  const [codigoIn, setCodigoIn] = useState("");
  const [descIn, setDescIn] = useState("");
  const [parsing, setParsing] = useState(false);

  const adicionarManual = () => {
    const codigo = parseInt(codigoIn, 10);
    if (Number.isNaN(codigo)) {
      toast.error("Algo precisa de atenção", { description: "Código deve ser numérico." });
      return;
    }
    if (!descIn.trim()) {
      toast.error("Algo precisa de atenção", { description: "Descrição obrigatória." });
      return;
    }
    dispatch({ type: "addAcum", item: { codigo, descricao: descIn.trim() } });
    setCodigoIn(""); setDescIn("");
  };

  const handleFile = async (file: File) => {
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

      const findKey = (obj: Record<string, unknown>, target: string) => {
        const norm = (s: string) =>
          s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
        return Object.keys(obj).find(k => norm(k) === norm(target));
      };

      const itens: Acumulador[] = [];
      const map = new Map<number, string>();
      let invalidos = 0;

      for (const r of rows) {
        const kCod = findKey(r, "Código") || findKey(r, "Codigo");
        const kDesc = findKey(r, "Descrição") || findKey(r, "Descricao");
        const codRaw = kCod ? r[kCod] : null;
        const descRaw = kDesc ? r[kDesc] : null;
        const codNum = typeof codRaw === "number" ? codRaw : parseInt(String(codRaw ?? "").trim(), 10);
        const descStr = String(descRaw ?? "").trim();
        if (Number.isNaN(codNum) || !descStr) { invalidos++; continue; }
        map.set(codNum, descStr);
      }
      for (const [codigo, descricao] of map) itens.push({ codigo, descricao });
      itens.sort((a, b) => a.codigo - b.codigo);

      dispatch({ type: "replaceAcums", items: itens, invalidos });
      toast.success(`${itens.length} acumuladores carregados.`);
    } catch (e: any) {
      toast.error("Não conseguimos ler o arquivo.", { description: e?.message });
    } finally {
      setParsing(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-display font-semibold">Acumuladores</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Cadastre agora ou pule e configure depois pela tela do cliente.
        </p>
      </div>

      <Tabs value={aba} onValueChange={v => setAba(v as any)} className="w-full">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="importar">Importar XLSX</TabsTrigger>
          <TabsTrigger value="manual">Adicionar manual</TabsTrigger>
          <TabsTrigger value="pular">Pular</TabsTrigger>
        </TabsList>

        <TabsContent value="importar" className="space-y-4 mt-5">
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg p-8 cursor-pointer hover:bg-muted/50 transition-colors">
            <Upload className="h-6 w-6 text-muted-foreground mb-2" strokeWidth={1.5} />
            <span className="text-sm font-medium">
              {parsing ? "Processando…" : "Selecionar arquivo .xlsx"}
            </span>
            <span className="text-xs text-muted-foreground mt-1">
              Colunas esperadas: Código e Descrição
            </span>
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.currentTarget.value = "";
              }}
            />
          </label>
          {state.acumuladores.length > 0 && (
            <PreviewAcums state={state} dispatch={dispatch} />
          )}
        </TabsContent>

        <TabsContent value="manual" className="space-y-4 mt-5">
          <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr_auto] gap-3 items-end">
            <div className="space-y-2">
              <Label htmlFor="cod_man">Código</Label>
              <Input
                id="cod_man"
                inputMode="numeric"
                value={codigoIn}
                onChange={e => setCodigoIn(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc_man">Descrição</Label>
              <Input id="desc_man" value={descIn} onChange={e => setDescIn(e.target.value)} />
            </div>
            <Button onClick={adicionarManual} variant="outline">
              <Plus className="h-4 w-4" />
              Adicionar
            </Button>
          </div>
          {state.acumuladores.length > 0 && <PreviewAcums state={state} dispatch={dispatch} />}
        </TabsContent>

        <TabsContent value="pular" className="mt-5">
          <div className="rounded-lg border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
            Você poderá cadastrar acumuladores depois, na aba Acumuladores do detalhe do cliente.
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PreviewAcums({ state, dispatch }: { state: State; dispatch: React.Dispatch<Action> }) {
  const visiveis = useMemo(() => state.acumuladores.slice(0, 20), [state.acumuladores]);
  const restantes = state.acumuladores.length - visiveis.length;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          <span className="text-foreground font-medium">{state.acumuladores.length}</span> acumuladores válidos
          {state.importInvalidos > 0 && <> · {state.importInvalidos} inválidos ignorados</>}
        </span>
      </div>
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Código</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiveis.map(a => (
              <TableRow key={a.codigo}>
                <TableCell className="tabular-nums">{a.codigo}</TableCell>
                <TableCell>{a.descricao}</TableCell>
                <TableCell>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => dispatch({ type: "removeAcum", codigo: a.codigo })}
                    aria-label="Remover"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {restantes > 0 && (
        <p className="text-xs text-muted-foreground text-center">+{restantes} restantes</p>
      )}
    </div>
  );
}

// ---------- Passo 3 ----------
function Passo3({ state, dispatch }: { state: State; dispatch: React.Dispatch<Action> }) {
  const emailValido =
    !state.email_convite.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email_convite.trim());
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-display font-semibold">Convidar usuário do cliente</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Opcional. Você pode convidar agora ou depois pela aba Usuários do cliente.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email_conv">Email do responsável no cliente</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="email_conv"
            type="email"
            value={state.email_convite}
            onChange={e => dispatch({ type: "set", patch: { email_convite: e.target.value } })}
            placeholder="responsavel@empresa.com.br"
            className="pl-9"
            aria-invalid={!emailValido}
          />
        </div>
        {!emailValido && (
          <p className="text-xs text-destructive">Email inválido.</p>
        )}
      </div>

      <div className="rounded-lg border border-brand-soft bg-brand-soft/40 p-4 flex gap-3">
        <Info className="h-4 w-4 text-brand mt-0.5 shrink-0" strokeWidth={2} />
        <p className="text-sm text-foreground/80">
          Um email de boas-vindas será enviado com o link para definir senha. Você poderá
          convidar mais usuários depois pela aba Usuários do cliente.
        </p>
      </div>

      {state.email_convite && (
        <button
          type="button"
          onClick={() => dispatch({ type: "set", patch: { email_convite: "" } })}
          className="text-sm text-brand hover:underline"
        >
          Pular este passo
        </button>
      )}
    </div>
  );
}
