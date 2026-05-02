import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  ArrowLeft, Loader2, Pencil, Plus, RefreshCw, Search, Upload, UserPlus, Mail, Trash2, MoreHorizontal, FileSpreadsheet, ArrowRight,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { formatCNPJ, onlyDigits } from "@/lib/format";
import { ExcluirImportacaoDialog } from "@/components/ExcluirImportacaoDialog";

type Cliente = {
  id: string;
  razao_social: string;
  cnpj: string;
  codigo_empresa_dominio: number;
  endereco: string | null;
  municipio: string | null;
  municipio_ibge: string | null;
  uf: string | null;
  ativo: boolean;
};

type Acumulador = {
  id: string;
  codigo: number;
  descricao: string;
  ativo: boolean;
};

type ProfileRow = {
  id: string;
  email: string;
  nome: string | null;
  created_at: string;
};

const TABS = ["informacoes", "acumuladores", "operacoes", "competencias", "usuarios"] as const;
type TabKey = typeof TABS[number];

export default function DetalheCliente() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = (searchParams.get("tab") || "informacoes") as TabKey;
  const tab: TabKey = TABS.includes(tabParam) ? tabParam : "informacoes";

  const [loading, setLoading] = useState(true);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [notFound, setNotFound] = useState(false);

  const carregar = async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("clientes")
      .select("id, razao_social, cnpj, codigo_empresa_dominio, endereco, municipio, municipio_ibge, uf, ativo")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      toast.error("Algo precisa de atenção", { description: error.message });
    }
    if (!data) setNotFound(true);
    else setCliente(data as Cliente);
    setLoading(false);
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [id]);

  const setTab = (t: TabKey) => {
    const sp = new URLSearchParams(searchParams);
    sp.set("tab", t);
    setSearchParams(sp, { replace: true });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Processando…
      </div>
    );
  }

  if (notFound || !cliente) {
    return (
      <div className="max-w-md mx-auto py-24 text-center space-y-4">
        <h2 className="text-xl font-display font-semibold">Cliente não encontrado.</h2>
        <p className="text-muted-foreground">Verifique se o link está correto.</p>
        <Button onClick={() => nav("/app/escritorio/clientes")} className="bg-brand text-brand-foreground hover:bg-brand/90">
          <ArrowLeft className="h-4 w-4" /> Voltar para clientes
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/app/escritorio/clientes"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para clientes
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-3xl font-display font-semibold">{cliente.razao_social}</h1>
          <p className="text-muted-foreground tabular-nums">{formatCNPJ(cliente.cnpj)}</p>
        </div>
        <Badge
          variant="secondary"
          className={cliente.ativo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}
        >
          {cliente.ativo ? "Ativo" : "Inativo"}
        </Badge>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="space-y-6">
        <TabsList>
          <TabsTrigger value="informacoes">Informações</TabsTrigger>
          <TabsTrigger value="acumuladores">Acumuladores</TabsTrigger>
          <TabsTrigger value="operacoes">Operações</TabsTrigger>
          <TabsTrigger value="competencias">Competências</TabsTrigger>
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
        </TabsList>

        <TabsContent value="informacoes">
          <AbaInformacoes cliente={cliente} onChange={setCliente} onReload={carregar} />
        </TabsContent>
        <TabsContent value="acumuladores">
          <AbaAcumuladores clienteId={cliente.id} />
        </TabsContent>
        <TabsContent value="operacoes">
          <AbaOperacoes clienteId={cliente.id} />
        </TabsContent>
        <TabsContent value="competencias">
          <AbaCompetencias clienteId={cliente.id} />
        </TabsContent>
        <TabsContent value="usuarios">
          <AbaUsuarios clienteId={cliente.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// Aba Informações
// ============================================================
function AbaInformacoes({
  cliente, onChange, onReload,
}: { cliente: Cliente; onChange: (c: Cliente) => void; onReload: () => void }) {
  const [form, setForm] = useState({
    razao_social: cliente.razao_social,
    codigo_empresa_dominio: String(cliente.codigo_empresa_dominio),
    endereco: cliente.endereco ?? "",
    municipio: cliente.municipio ?? "",
    municipio_ibge: cliente.municipio_ibge ?? "",
    uf: cliente.uf ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [reconsultando, setReconsultando] = useState(false);
  const [codigoErro, setCodigoErro] = useState<string | null>(null);
  const [confirmInativar, setConfirmInativar] = useState(false);
  const [confirmReativar, setConfirmReativar] = useState(false);

  useEffect(() => {
    setForm({
      razao_social: cliente.razao_social,
      codigo_empresa_dominio: String(cliente.codigo_empresa_dominio),
      endereco: cliente.endereco ?? "",
      municipio: cliente.municipio ?? "",
      municipio_ibge: cliente.municipio_ibge ?? "",
      uf: cliente.uf ?? "",
    });
    setCodigoErro(null);
  }, [cliente]);

  const dirty = useMemo(() => {
    return (
      form.razao_social.trim() !== cliente.razao_social ||
      form.codigo_empresa_dominio !== String(cliente.codigo_empresa_dominio) ||
      (form.endereco || "").trim() !== (cliente.endereco ?? "") ||
      (form.municipio || "").trim() !== (cliente.municipio ?? "") ||
      (form.municipio_ibge || "").trim() !== (cliente.municipio_ibge ?? "") ||
      (form.uf || "").trim() !== (cliente.uf ?? "")
    );
  }, [form, cliente]);

  const handleReconsultar = async () => {
    setReconsultando(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${onlyDigits(cliente.cnpj)}`);
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
      setForm(f => ({
        ...f,
        endereco: endereco || f.endereco,
        municipio: d.municipio || f.municipio,
        municipio_ibge: d.codigo_municipio_ibge ? String(d.codigo_municipio_ibge) : f.municipio_ibge,
        uf: d.uf || f.uf,
      }));
      toast.success("Dados consultados na Receita Federal.");
    } catch {
      toast.error("Não conseguimos consultar este CNPJ.", { description: "Tente novamente em instantes." });
    } finally {
      setReconsultando(false);
    }
  };

  const handleSalvar = async () => {
    const codigo = parseInt(form.codigo_empresa_dominio, 10);
    if (Number.isNaN(codigo)) {
      setCodigoErro("Código inválido.");
      return;
    }

    if (codigo !== cliente.codigo_empresa_dominio) {
      const { data: existente } = await supabase
        .from("clientes")
        .select("id, razao_social")
        .eq("codigo_empresa_dominio", codigo)
        .neq("id", cliente.id)
        .maybeSingle();
      if (existente) {
        setCodigoErro(`Este código já está em uso pelo cliente ${existente.razao_social}.`);
        return;
      }
    }
    setCodigoErro(null);

    setSaving(true);
    const { data, error } = await supabase
      .from("clientes")
      .update({
        razao_social: form.razao_social.trim(),
        codigo_empresa_dominio: codigo,
        endereco: form.endereco.trim() || null,
        municipio: form.municipio.trim() || null,
        municipio_ibge: form.municipio_ibge.trim() || null,
        uf: form.uf.trim() || null,
      })
      .eq("id", cliente.id)
      .select("id, razao_social, cnpj, codigo_empresa_dominio, endereco, municipio, municipio_ibge, uf, ativo")
      .single();
    setSaving(false);

    if (error || !data) {
      toast.error("Algo precisa de atenção", { description: error?.message });
      return;
    }
    onChange(data as Cliente);
    toast.success("Alterações salvas com segurança.");
  };

  const handleToggleAtivo = async (novo: boolean) => {
    const { data, error } = await supabase
      .from("clientes")
      .update({ ativo: novo })
      .eq("id", cliente.id)
      .select("id, razao_social, cnpj, codigo_empresa_dominio, endereco, municipio, municipio_ibge, uf, ativo")
      .single();
    if (error || !data) {
      toast.error("Algo precisa de atenção", { description: error?.message });
      return;
    }
    onChange(data as Cliente);
    toast.success(novo ? "Cliente reativado." : "Cliente inativado com segurança.");
  };

  return (
    <Card className="p-6 sm:p-8 rounded-xl space-y-6">
      <div className="space-y-2">
        <Label>CNPJ</Label>
        <div className="flex items-center gap-3 flex-wrap">
          <Input value={formatCNPJ(cliente.cnpj)} readOnly className="bg-muted/40 max-w-xs tabular-nums" />
          <Button
            variant="outline"
            onClick={handleReconsultar}
            disabled={reconsultando}
          >
            {reconsultando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Re-consultar Receita Federal
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="razao">Razão Social</Label>
        <Input
          id="razao"
          value={form.razao_social}
          onChange={e => setForm(f => ({ ...f, razao_social: e.target.value }))}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="codigo">Código da Empresa no Domínio</Label>
          <Input
            id="codigo"
            inputMode="numeric"
            value={form.codigo_empresa_dominio}
            onChange={e => {
              setForm(f => ({ ...f, codigo_empresa_dominio: e.target.value.replace(/\D/g, "") }));
              setCodigoErro(null);
            }}
            aria-invalid={!!codigoErro}
          />
          {codigoErro && <p className="text-xs text-destructive">{codigoErro}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="uf">UF</Label>
          <Input
            id="uf"
            maxLength={2}
            value={form.uf}
            onChange={e => setForm(f => ({ ...f, uf: e.target.value.toUpperCase() }))}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="municipio">Município</Label>
        <Input
          id="municipio"
          value={form.municipio}
          onChange={e => setForm(f => ({ ...f, municipio: e.target.value }))}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="endereco">Endereço</Label>
        <Input
          id="endereco"
          value={form.endereco}
          onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))}
        />
      </div>

      <div className="flex items-center justify-between pt-6 border-t flex-wrap gap-3">
        {cliente.ativo ? (
          <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setConfirmInativar(true)}>
            Inativar cliente
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setConfirmReativar(true)}>
            Reativar cliente
          </Button>
        )}
        <Button
          onClick={handleSalvar}
          disabled={!dirty || saving}
          className="bg-brand text-brand-foreground hover:bg-brand/90"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Processando…" : "Salvar alterações"}
        </Button>
      </div>

      <AlertDialog open={confirmInativar} onOpenChange={setConfirmInativar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inativar este cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Ao inativar, este cliente deixa de aparecer para os usuários cliente e novas competências
              não poderão ser criadas. As competências em andamento permanecem. Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleToggleAtivo(false)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Inativar cliente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmReativar} onOpenChange={setConfirmReativar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reativar cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              O cliente voltará a aparecer normalmente e novas competências poderão ser criadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleToggleAtivo(true)}
              className="bg-brand text-brand-foreground hover:bg-brand/90"
            >
              Reativar cliente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ============================================================
// Aba Acumuladores
// ============================================================
function AbaAcumuladores({ clienteId }: { clienteId: string }) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Acumulador[]>([]);
  const [busca, setBusca] = useState("");
  const [verInativos, setVerInativos] = useState(false);
  const [novoOpen, setNovoOpen] = useState(false);
  const [editando, setEditando] = useState<Acumulador | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("acumuladores")
      .select("id, codigo, descricao, ativo")
      .eq("cliente_id", clienteId)
      .order("codigo", { ascending: true });
    if (error) toast.error("Algo precisa de atenção", { description: error.message });
    setItems((data ?? []) as Acumulador[]);
    setLoading(false);
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [clienteId]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return items.filter(a => {
      if (!verInativos && !a.ativo) return false;
      if (!q) return true;
      return a.descricao.toLowerCase().includes(q) || String(a.codigo).includes(q);
    });
  }, [items, busca, verInativos]);

  const handleToggle = async (a: Acumulador, novo: boolean) => {
    const { error } = await supabase.from("acumuladores").update({ ativo: novo }).eq("id", a.id);
    if (error) {
      toast.error("Algo precisa de atenção", { description: error.message });
      return;
    }
    setItems(prev => prev.map(x => (x.id === a.id ? { ...x, ativo: novo } : x)));
    toast.success(novo ? "Acumulador reativado." : "Acumulador inativado.");
  };

  return (
    <Card className="p-6 rounded-xl space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por descrição ou código"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="pl-9 w-72"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={verInativos} onCheckedChange={setVerInativos} />
            Ver inativos
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" /> Importar XLSX
          </Button>
          <Button
            onClick={() => setNovoOpen(true)}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            <Plus className="h-4 w-4" /> Novo acumulador
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Processando…
        </div>
      ) : filtrados.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-10 text-center text-muted-foreground">
          {items.length === 0
            ? "Nenhum acumulador cadastrado ainda. Importe um XLSX ou cadastre manualmente."
            : "Nenhum acumulador encontrado com esses filtros."}
        </motion.div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Código</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="w-32">Ativo</TableHead>
              <TableHead className="w-20 text-right">Editar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.map(a => (
              <TableRow key={a.id}>
                <TableCell className="tabular-nums font-medium">{a.codigo}</TableCell>
                <TableCell>{a.descricao}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch checked={a.ativo} onCheckedChange={(v) => handleToggle(a, v)} />
                    <span className={`text-xs ${a.ativo ? "text-success" : "text-muted-foreground"}`}>
                      {a.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => setEditando(a)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <NovoAcumModal
        open={novoOpen}
        onClose={() => setNovoOpen(false)}
        clienteId={clienteId}
        existentes={items}
        onCreated={(novo) => setItems(prev => [...prev, novo].sort((a, b) => a.codigo - b.codigo))}
      />
      <EditarAcumModal
        item={editando}
        onClose={() => setEditando(null)}
        onSaved={(updated) => setItems(prev => prev.map(x => (x.id === updated.id ? updated : x)))}
      />
      <ImportarAcumModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        clienteId={clienteId}
        existentes={items}
        onDone={() => carregar()}
      />
    </Card>
  );
}

function NovoAcumModal({
  open, onClose, clienteId, existentes, onCreated,
}: {
  open: boolean; onClose: () => void; clienteId: string;
  existentes: Acumulador[]; onCreated: (a: Acumulador) => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setCodigo(""); setDescricao(""); setErro(null); setSaving(false); }
  }, [open]);

  const salvar = async () => {
    const c = parseInt(codigo, 10);
    if (Number.isNaN(c)) { setErro("Código inválido."); return; }
    if (!descricao.trim()) { setErro("Descrição obrigatória."); return; }
    if (existentes.some(x => x.codigo === c)) {
      setErro("Já existe um acumulador com este código para este cliente.");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("acumuladores")
      .insert({ cliente_id: clienteId, codigo: c, descricao: descricao.trim(), ativo: true })
      .select("id, codigo, descricao, ativo")
      .single();
    setSaving(false);
    if (error || !data) {
      setErro(error?.message || "Falha ao salvar.");
      return;
    }
    onCreated(data as Acumulador);
    toast.success("Acumulador cadastrado.");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo acumulador</DialogTitle>
          <DialogDescription>Adicione um código e descrição para este cliente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Código</Label>
            <Input
              inputMode="numeric"
              value={codigo}
              onChange={e => { setCodigo(e.target.value.replace(/\D/g, "")); setErro(null); }}
            />
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Input value={descricao} onChange={e => { setDescricao(e.target.value); setErro(null); }} />
          </div>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving} className="bg-brand text-brand-foreground hover:bg-brand/90">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Processando…" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditarAcumModal({
  item, onClose, onSaved,
}: { item: Acumulador | null; onClose: () => void; onSaved: (a: Acumulador) => void }) {
  const [descricao, setDescricao] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item) setDescricao(item.descricao);
  }, [item]);

  const salvar = async () => {
    if (!item) return;
    if (!descricao.trim()) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("acumuladores")
      .update({ descricao: descricao.trim() })
      .eq("id", item.id)
      .select("id, codigo, descricao, ativo")
      .single();
    setSaving(false);
    if (error || !data) {
      toast.error("Algo precisa de atenção", { description: error?.message });
      return;
    }
    onSaved(data as Acumulador);
    toast.success("Acumulador atualizado.");
    onClose();
  };

  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar acumulador</DialogTitle>
          <DialogDescription>O código não pode ser alterado.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Código</Label>
            <Input value={item?.codigo ?? ""} readOnly className="bg-muted/40" />
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Input value={descricao} onChange={e => setDescricao(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving} className="bg-brand text-brand-foreground hover:bg-brand/90">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Processando…" : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportarAcumModal({
  open, onClose, clienteId, existentes, onDone,
}: {
  open: boolean; onClose: () => void; clienteId: string;
  existentes: Acumulador[]; onDone: () => void;
}) {
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsed, setParsed] = useState<{ codigo: number; descricao: string }[]>([]);
  const [invalidos, setInvalidos] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) { setParsed([]); setInvalidos(0); setParsing(false); setSaving(false); }
  }, [open]);

  const onFile = async (file: File) => {
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      const items: { codigo: number; descricao: string }[] = [];
      let inval = 0;
      const seen = new Set<number>();
      for (const row of json) {
        const keys = Object.keys(row);
        const kCod = keys.find(k => /c[oó]digo/i.test(k));
        const kDesc = keys.find(k => /descri[cç][aã]o/i.test(k));
        const codRaw = kCod ? String(row[kCod] ?? "").replace(/\D/g, "") : "";
        const descRaw = kDesc ? String(row[kDesc] ?? "").trim() : "";
        const cod = parseInt(codRaw, 10);
        if (Number.isNaN(cod) || !descRaw) { inval++; continue; }
        if (seen.has(cod)) continue;
        seen.add(cod);
        items.push({ codigo: cod, descricao: descRaw });
      }
      setParsed(items);
      setInvalidos(inval);
    } catch {
      toast.error("Não conseguimos ler este arquivo.", { description: "Verifique se está no formato XLSX." });
    } finally {
      setParsing(false);
    }
  };

  const salvar = async () => {
    if (parsed.length === 0) return;
    setSaving(true);
    // UPSERT manual: separa novos e existentes
    const mapaExistente = new Map(existentes.map(e => [e.codigo, e]));
    const novos = parsed.filter(p => !mapaExistente.has(p.codigo));
    const atualizar = parsed.filter(p => {
      const ex = mapaExistente.get(p.codigo);
      return ex && ex.descricao !== p.descricao;
    });

    let erros = 0;

    if (novos.length) {
      const { error } = await supabase.from("acumuladores").insert(
        novos.map(n => ({ cliente_id: clienteId, codigo: n.codigo, descricao: n.descricao, ativo: true }))
      );
      if (error) erros++;
    }
    for (const u of atualizar) {
      const ex = mapaExistente.get(u.codigo)!;
      const { error } = await supabase.from("acumuladores").update({ descricao: u.descricao }).eq("id", ex.id);
      if (error) erros++;
    }

    setSaving(false);
    if (erros > 0) {
      toast.error("Algo precisa de atenção", { description: "Alguns acumuladores não foram salvos." });
    } else {
      toast.success(`${novos.length} novo(s) e ${atualizar.length} atualizado(s).`);
    }
    onDone();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar acumuladores</DialogTitle>
          <DialogDescription>
            Envie um arquivo XLSX com as colunas <b>Código</b> e <b>Descrição</b>. Códigos existentes
            terão a descrição atualizada; novos serão inseridos.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
          />
          <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={parsing}>
            {parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Selecionar arquivo
          </Button>

          {parsed.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {parsed.length} acumulador(es) reconhecidos
                {invalidos > 0 && ` · ${invalidos} linha(s) ignorada(s)`}
              </p>
              <div className="max-h-64 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">Código</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="w-28">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.slice(0, 200).map(p => {
                      const ex = existentes.find(e => e.codigo === p.codigo);
                      return (
                        <TableRow key={p.codigo}>
                          <TableCell className="tabular-nums">{p.codigo}</TableCell>
                          <TableCell>{p.descricao}</TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">
                              {ex ? (ex.descricao !== p.descricao ? "Atualizar" : "Sem mudança") : "Novo"}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={salvar}
            disabled={saving || parsed.length === 0}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Processando…" : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Aba Usuários
// ============================================================
function AbaUsuarios({ clienteId }: { clienteId: string }) {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [convidarOpen, setConvidarOpen] = useState(false);
  const [excluindo, setExcluindo] = useState<ProfileRow | null>(null);
  const [excluindoLoading, setExcluindoLoading] = useState(false);

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, nome, created_at")
      .eq("cliente_id", clienteId)
      .eq("role", "cliente")
      .order("created_at", { ascending: false });
    if (error) toast.error("Algo precisa de atenção", { description: error.message });
    setUsers((data ?? []) as ProfileRow[]);
    setLoading(false);
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [clienteId]);

  const reenviar = async (email: string) => {
    const { data, error } = await supabase.functions.invoke("convidar-cliente", {
      body: { email, cliente_id: clienteId },
    });
    if (error || (data && data.ok === false)) {
      const msg = (data as any)?.error || error?.message || "";
      toast.error("Algo precisa de atenção", { description: msg });
      return;
    }
    toast.success("Convite reenviado.");
  };

  const excluir = async () => {
    if (!excluindo) return;
    setExcluindoLoading(true);
    const { data, error } = await supabase.functions.invoke("excluir-usuario", {
      body: { user_id: excluindo.id },
    });
    setExcluindoLoading(false);
    if (error || (data && data.ok === false)) {
      const msg = (data as any)?.error || error?.message || "Não foi possível excluir.";
      toast.error("Algo precisa de atenção", { description: msg });
      return;
    }
    toast.success("Usuário removido com segurança.");
    setExcluindo(null);
    carregar();
  };

  return (
    <Card className="p-6 rounded-xl space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {users.length} usuário(s) vinculado(s) a este cliente.
        </p>
        <Button onClick={() => setConvidarOpen(true)} className="bg-brand text-brand-foreground hover:bg-brand/90">
          <UserPlus className="h-4 w-4" /> Convidar usuário
        </Button>
      </div>

      {loading ? (
        <div className="p-12 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Processando…
        </div>
      ) : users.length === 0 ? (
        <div className="p-10 text-center text-muted-foreground">
          Nenhum usuário convidado ainda.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Convidado em</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map(u => (
              <TableRow key={u.id}>
                <TableCell>{u.nome || <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-muted-foreground">{u.email}</TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {new Date(u.created_at).toLocaleDateString("pt-BR")}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => reenviar(u.email)}>
                        <Mail className="h-4 w-4 mr-2" /> Reenviar convite
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setExcluindo(u)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Cancelar convite e excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ConvidarModal
        open={convidarOpen}
        onClose={() => setConvidarOpen(false)}
        clienteId={clienteId}
        onInvited={() => carregar()}
      />

      <AlertDialog open={!!excluindo} onOpenChange={(v) => !v && !excluindoLoading && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar convite e excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              {excluindo?.email} perderá o acesso imediatamente. Se ainda não tinha confirmado o
              convite, o link enviado deixará de funcionar. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindoLoading}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); excluir(); }}
              disabled={excluindoLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {excluindoLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {excluindoLoading ? "Processando…" : "Excluir usuário"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function ConvidarModal({
  open, onClose, clienteId, onInvited,
}: { open: boolean; onClose: () => void; clienteId: string; onInvited: () => void }) {
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) { setEmail(""); setNome(""); setSaving(false); }
  }, [open]);

  const enviar = async () => {
    if (!email.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("convidar-cliente", {
      body: { email: email.trim(), cliente_id: clienteId, nome: nome.trim() || undefined },
    });
    setSaving(false);
    if (error || (data && data.ok === false)) {
      const msg = (data as any)?.error || error?.message || "Não foi possível enviar o convite.";
      toast.error("Algo precisa de atenção", { description: msg });
      return;
    }
    toast.success("Convite enviado com segurança.");
    onInvited();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar usuário</DialogTitle>
          <DialogDescription>
            Enviaremos um email com link para o usuário definir a senha de acesso.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Nome (opcional)</Label>
            <Input value={nome} onChange={e => setNome(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={enviar}
            disabled={saving || !email.trim()}
            className="bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Processando…" : "Enviar convite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Aba Competências
// ============================================================
type CompetenciaRow = {
  id: string;
  periodo: string;
  status: "aberta" | "concluida" | "exportada";
  tipo: "nfse_tomada" | "nfe_entrada" | "nfe_saida";
  total_notas: number;
  notas_classificadas: number;
  created_at: string;
  exportada_em: string | null;
  concluida_em: string | null;
};

const TIPO_LABEL: Record<CompetenciaRow["tipo"], string> = {
  nfse_tomada: "NFSe — Tomada",
  nfe_entrada: "NF-e Entrada",
  nfe_saida: "NF-e Saída",
};

const MESES_PT = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

function formatPeriodo(p: string) {
  const m = p.match(/^(\d{4})-(\d{2})$/);
  if (!m) return p;
  return `${MESES_PT[parseInt(m[2], 10) - 1]} / ${m[1]}`;
}

function StatusCompetenciaBadge({ status }: { status: CompetenciaRow["status"] }) {
  if (status === "exportada") {
    return (
      <Badge variant="outline" className="bg-success/10 text-success border-success/30">
        Exportada
      </Badge>
    );
  }
  if (status === "concluida") {
    return (
      <Badge variant="outline" className="bg-brand-soft text-brand border-brand/20">
        Classificação validada
      </Badge>
    );
  }
  return <Badge variant="secondary">Aberta</Badge>;
}

function AbaCompetencias({ clienteId }: { clienteId: string }) {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const destacar = searchParams.get("destacar");

  const [loading, setLoading] = useState(true);
  const [comps, setComps] = useState<CompetenciaRow[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<CompetenciaRow | null>(null);

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("competencias")
      .select("id, periodo, status, tipo, total_notas, notas_classificadas, created_at, exportada_em, concluida_em")
      .eq("cliente_id", clienteId)
      .order("periodo", { ascending: false });
    if (error) toast.error("Algo precisa de atenção", { description: error.message });
    setComps((data ?? []) as CompetenciaRow[]);
    setLoading(false);
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [clienteId]);

  // Destaque temporário da competência recém-importada
  useEffect(() => {
    if (!destacar || loading) return;
    if (!comps.some((c) => c.id === destacar)) return;
    setHighlightId(destacar);
    const t = setTimeout(() => {
      setHighlightId(null);
      const sp = new URLSearchParams(searchParams);
      sp.delete("destacar");
      setSearchParams(sp, { replace: true });
    }, 3000);
    return () => clearTimeout(t);
  }, [destacar, loading, comps, searchParams, setSearchParams]);

  const irImportar = () =>
    nav("/app/escritorio/importar", { state: { cliente_id: clienteId } });

  if (loading) {
    return (
      <Card className="p-12 rounded-xl flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  if (comps.length === 0) {
    return (
      <Card className="p-12 rounded-xl text-center space-y-5">
        <div className="h-14 w-14 rounded-full bg-muted mx-auto flex items-center justify-center">
          <FileSpreadsheet className="h-7 w-7 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground max-w-md mx-auto">
          Nenhuma competência importada ainda. Carregue a primeira planilha mensal para começar a classificar.
        </p>
        <Button
          onClick={irImportar}
          className="bg-brand text-brand-foreground hover:bg-brand/90"
        >
          <Upload className="h-4 w-4" />
          Importar primeira competência
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {comps.length} {comps.length === 1 ? "competência cadastrada" : "competências cadastradas"}.
        </p>
        <Button
          onClick={irImportar}
          className="bg-brand text-brand-foreground hover:bg-brand/90"
        >
          <Plus className="h-4 w-4" />
          Importar competência
        </Button>
      </div>

      <Card className="rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Período</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Notas</TableHead>
              <TableHead>Classificadas</TableHead>
              <TableHead>Importada em</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {comps.map((c) => {
              const total = c.total_notas ?? 0;
              const classif = c.notas_classificadas ?? 0;
              const pct = total > 0 ? (classif / total) * 100 : 0;
              const isHighlight = highlightId === c.id;
              return (
                <motion.tr
                  key={c.id}
                  initial={isHighlight ? { backgroundColor: "hsl(var(--brand-soft) / 0.5)" } : false}
                  animate={isHighlight
                    ? { backgroundColor: ["hsl(var(--brand-soft) / 0.5)", "hsl(var(--brand-soft) / 0)"] }
                    : { backgroundColor: "hsl(var(--brand-soft) / 0)" }}
                  transition={{ duration: 3, ease: "easeOut" }}
                  className="border-b last:border-b-0"
                >
                  <TableCell className="font-medium">{formatPeriodo(c.periodo)}</TableCell>
                  <TableCell><StatusCompetenciaBadge status={c.status} /></TableCell>
                  <TableCell className="text-right tabular-nums">{total}</TableCell>
                  <TableCell>
                    <div className="relative inline-flex items-center justify-center min-w-[88px] h-7 px-3 rounded overflow-hidden bg-muted/40">
                      <div
                        className="absolute inset-y-0 left-0 bg-brand-soft transition-all"
                        style={{ width: `${pct}%` }}
                      />
                      <span className="relative tabular-nums text-sm">
                        {classif} / {total}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(c.created_at).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => nav(`/app/escritorio/competencias/${c.id}`)}
                      >
                        Abrir
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => setExcluindo(c)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir importação
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </motion.tr>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {excluindo && (
        <ExcluirImportacaoDialog
          open={!!excluindo}
          onOpenChange={(v) => !v && setExcluindo(null)}
          competenciaId={excluindo.id}
          periodoLabel={formatPeriodo(excluindo.periodo)}
          tipoLabel={TIPO_LABEL[excluindo.tipo]}
          status={excluindo.status}
          totalNotas={excluindo.total_notas ?? 0}
          onExcluido={() => { setExcluindo(null); carregar(); }}
        />
      )}
    </div>
  );
}

// ============================================================
// Aba Operações — tipos de operação atendidos pelo cliente
// ============================================================
type TipoOperacao = "nfse_tomada" | "nfe_entrada" | "nfe_saida";

type OperacaoRow = {
  cliente_id: string;
  tipo: TipoOperacao;
  layout_export: string;
};

const TIPOS: {
  key: TipoOperacao;
  titulo: string;
  descricao: string;
  layouts: { value: string; label: string }[];
}[] = [
  {
    key: "nfse_tomada",
    titulo: "NFSe — Serviços Tomados",
    descricao: "Notas fiscais de serviço recebidas pelo cliente.",
    layouts: [{ value: "dominio_leiaute_18", label: "Domínio — Leiaute 18 (Serviços)" }],
  },
  {
    key: "nfe_entrada",
    titulo: "NF-e — Entrada",
    descricao: "Mercadorias compradas pelo cliente.",
    layouts: [{ value: "dominio_separador", label: "Domínio — com Separador" }],
  },
  {
    key: "nfe_saida",
    titulo: "NF-e — Saída",
    descricao: "Mercadorias vendidas pelo cliente.",
    layouts: [{ value: "dominio_separador", label: "Domínio — com Separador" }],
  },
];

function AbaOperacoes({ clienteId }: { clienteId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [original, setOriginal] = useState<Record<TipoOperacao, OperacaoRow | null>>({
    nfse_tomada: null,
    nfe_entrada: null,
    nfe_saida: null,
  });
  const [estado, setEstado] = useState<Record<TipoOperacao, { ativo: boolean; layout: string }>>({
    nfse_tomada: { ativo: false, layout: "dominio_leiaute_18" },
    nfe_entrada: { ativo: false, layout: "dominio_separador" },
    nfe_saida: { ativo: false, layout: "dominio_separador" },
  });
  const [bloqueio, setBloqueio] = useState<{ tipo: TipoOperacao; titulo: string } | null>(null);

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("cliente_operacoes")
      .select("cliente_id, tipo, layout_export")
      .eq("cliente_id", clienteId);
    if (error) {
      toast.error("Algo precisa de atenção", { description: error.message });
      setLoading(false);
      return;
    }
    const orig: Record<TipoOperacao, OperacaoRow | null> = {
      nfse_tomada: null,
      nfe_entrada: null,
      nfe_saida: null,
    };
    const est = {
      nfse_tomada: { ativo: false, layout: "dominio_leiaute_18" },
      nfe_entrada: { ativo: false, layout: "dominio_separador" },
      nfe_saida: { ativo: false, layout: "dominio_separador" },
    };
    (data ?? []).forEach((r: OperacaoRow) => {
      orig[r.tipo] = r;
      est[r.tipo] = { ativo: true, layout: r.layout_export };
    });
    setOriginal(orig);
    setEstado(est);
    setLoading(false);
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [clienteId]);

  const dirty = useMemo(() => {
    return TIPOS.some(t => {
      const o = original[t.key];
      const e = estado[t.key];
      const eraAtivo = !!o;
      if (eraAtivo !== e.ativo) return true;
      if (eraAtivo && o!.layout_export !== e.layout) return true;
      return false;
    });
  }, [original, estado]);

  const handleToggle = async (tipo: TipoOperacao, novo: boolean) => {
    if (!novo && original[tipo]) {
      // Verifica se há competências desse tipo
      const { count, error } = await (supabase as any)
        .from("competencias")
        .select("id", { count: "exact", head: true })
        .eq("cliente_id", clienteId)
        .eq("tipo", tipo);
      if (error) {
        toast.error("Algo precisa de atenção", { description: error.message });
        return;
      }
      if ((count ?? 0) > 0) {
        const titulo = TIPOS.find(t => t.key === tipo)!.titulo;
        setBloqueio({ tipo, titulo });
        return;
      }
    }
    setEstado(prev => ({ ...prev, [tipo]: { ...prev[tipo], ativo: novo } }));
  };

  const handleLayout = (tipo: TipoOperacao, layout: string) => {
    setEstado(prev => ({ ...prev, [tipo]: { ...prev[tipo], layout } }));
  };

  const handleSalvar = async () => {
    setSaving(true);
    try {
      for (const t of TIPOS) {
        const o = original[t.key];
        const e = estado[t.key];
        const eraAtivo = !!o;
        if (e.ativo && !eraAtivo) {
          const { error } = await (supabase as any)
            .from("cliente_operacoes")
            .insert({ cliente_id: clienteId, tipo: t.key, layout_export: e.layout });
          if (error) throw error;
        } else if (!e.ativo && eraAtivo) {
          const { error } = await (supabase as any)
            .from("cliente_operacoes")
            .delete()
            .eq("cliente_id", clienteId)
            .eq("tipo", t.key);
          if (error) throw error;
        } else if (e.ativo && eraAtivo && o!.layout_export !== e.layout) {
          const { error } = await (supabase as any)
            .from("cliente_operacoes")
            .update({ layout_export: e.layout })
            .eq("cliente_id", clienteId)
            .eq("tipo", t.key);
          if (error) throw error;
        }
      }
      toast.success("Operações salvas com segurança.");
      await carregar();
    } catch (err: any) {
      toast.error("Algo precisa de atenção", { description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-8 rounded-xl flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Processando…
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6 sm:p-8 rounded-xl space-y-6">
        <div className="space-y-1">
          <h3 className="text-lg font-display font-semibold">Tipos de operação atendidos</h3>
          <p className="text-sm text-muted-foreground">
            Selecione abaixo os tipos de notas fiscais que este cliente atende.
          </p>
        </div>

        <div className="space-y-4">
          {TIPOS.map(t => {
            const e = estado[t.key];
            return (
              <div key={t.key} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <Label className="text-base font-medium">{t.titulo}</Label>
                    <p className="text-sm text-muted-foreground">{t.descricao}</p>
                  </div>
                  <Switch
                    checked={e.ativo}
                    onCheckedChange={(v) => handleToggle(t.key, v)}
                  />
                </div>
                {e.ativo && (
                  <div className="space-y-2 pt-2 border-t">
                    <Label className="text-xs text-muted-foreground">Layout de exportação</Label>
                    <select
                      value={e.layout}
                      onChange={(ev) => handleLayout(t.key, ev.target.value)}
                      className="flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {t.layouts.map(l => (
                        <option key={l.value} value={l.value}>{l.label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-4 rounded-xl bg-brand/5 border-brand/20">
        <p className="text-sm text-foreground">
          Esses tipos definem como a importação de notas fiscais e a exportação de TXT funcionam para este cliente.
          Você pode ativar mais de um tipo se o cliente atende serviços e mercadorias.
        </p>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={handleSalvar}
          disabled={!dirty || saving}
          className="bg-brand text-brand-foreground hover:bg-brand/90"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Processando…" : "Salvar alterações"}
        </Button>
      </div>

      <AlertDialog open={!!bloqueio} onOpenChange={(o) => !o && setBloqueio(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Não é possível desativar</AlertDialogTitle>
            <AlertDialogDescription>
              Este tipo ({bloqueio?.titulo}) possui competências já cadastradas e não pode ser desativado.
              Para deixar de atender, remova as competências primeiro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => setBloqueio(null)}
              className="bg-brand text-brand-foreground hover:bg-brand/90"
            >
              Entendi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
