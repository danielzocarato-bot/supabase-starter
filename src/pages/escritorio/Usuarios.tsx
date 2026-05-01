import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
import { Plus, Search, Send, Trash2, Loader2 } from "lucide-react";

type UsuarioRow = {
  id: string;
  email: string;
  nome: string | null;
  role: "escritorio" | "cliente";
  cliente_id: string | null;
  cliente_razao: string | null;
  created_at: string;
  email_confirmed_at: string | null;
};

type ClienteOption = { id: string; razao_social: string };

type TabFiltro = "todos" | "escritorio" | "cliente";

const fmtData = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

export default function Usuarios() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<UsuarioRow[]>([]);
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [tab, setTab] = useState<TabFiltro>("todos");
  const [busca, setBusca] = useState("");
  const [buscaDeb, setBuscaDeb] = useState("");
  const [empresaFiltro, setEmpresaFiltro] = useState<string>("todas");

  const [convidarOpen, setConvidarOpen] = useState(false);
  const [reenviandoId, setReenviandoId] = useState<string | null>(null);
  const [excluirAlvo, setExcluirAlvo] = useState<UsuarioRow | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  // debounce busca
  useEffect(() => {
    const t = setTimeout(() => setBuscaDeb(busca), 200);
    return () => clearTimeout(t);
  }, [busca]);

  const carregar = async () => {
    setLoading(true);
    const [{ data: usuarios, error: errU }, { data: cli, error: errC }] = await Promise.all([
      supabase.rpc("usuarios_com_status"),
      supabase
        .from("clientes")
        .select("id, razao_social")
        .eq("ativo", true)
        .order("razao_social", { ascending: true }),
    ]);

    if (errU) toast.error("Algo precisa de atenção", { description: errU.message });
    if (errC) toast.error("Algo precisa de atenção", { description: errC.message });

    setRows((usuarios as UsuarioRow[]) || []);
    setClientes((cli as ClienteOption[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    carregar();
  }, []);

  const filtrados = useMemo(() => {
    const q = buscaDeb.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab === "escritorio" && r.role !== "escritorio") return false;
      if (tab === "cliente" && r.role !== "cliente") return false;
      if (tab === "cliente" && empresaFiltro !== "todas" && r.cliente_id !== empresaFiltro) {
        return false;
      }
      if (q) {
        const nome = (r.nome || "").toLowerCase();
        const email = (r.email || "").toLowerCase();
        if (!nome.includes(q) && !email.includes(q)) return false;
      }
      return true;
    });
  }, [rows, tab, buscaDeb, empresaFiltro]);

  const handleReenviar = async (u: UsuarioRow) => {
    setReenviandoId(u.id);
    const { data, error } = await supabase.functions.invoke("convidar-cliente", {
      body: {
        email: u.email,
        cliente_id: u.role === "cliente" ? u.cliente_id ?? undefined : undefined,
        nome: u.nome ?? undefined,
        role: u.role,
      },
    });
    setReenviandoId(null);
    if (error || (data && data.ok === false)) {
      const msg = (data && data.error) || error?.message || "Falha ao reenviar convite.";
      toast.error("Algo precisa de atenção", { description: msg });
      return;
    }
    toast.success("Convite reenviado.");
    carregar();
  };

  const confirmarExcluir = async () => {
    if (!excluirAlvo) return;
    setExcluindo(true);
    const { data, error } = await supabase.functions.invoke("excluir-usuario", {
      body: { user_id: excluirAlvo.id },
    });
    setExcluindo(false);

    if (error || (data && data.ok === false)) {
      const msg = (data && data.error) || error?.message || "Falha ao inativar usuário.";
      if (typeof msg === "string" && msg.toLowerCase().includes("escrit")) {
        toast.error("Não é possível inativar um usuário do escritório por aqui.");
      } else {
        toast.error("Algo precisa de atenção", { description: msg });
      }
      return;
    }
    toast.success("Usuário inativado com segurança.");
    setExcluirAlvo(null);
    carregar();
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-display font-semibold">Usuários</h1>
            <p className="text-muted-foreground mt-1">
              Gestão de todos os perfis com acesso à plataforma.
            </p>
          </div>
          <Button
            onClick={() => setConvidarOpen(true)}
            className="bg-brand text-brand-foreground hover:bg-brand/90 h-11 px-5"
            size="lg"
          >
            <Plus className="h-4 w-4" />
            Convidar usuário
          </Button>
        </div>

        <Card className="p-4 rounded-xl space-y-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabFiltro)}>
            <TabsList>
              <TabsTrigger value="todos">Todos</TabsTrigger>
              <TabsTrigger value="escritorio">Escritório</TabsTrigger>
              <TabsTrigger value="cliente">Cliente</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative max-w-md flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou email"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9 h-10"
              />
            </div>

            {tab === "cliente" && (
              <Select value={empresaFiltro} onValueChange={setEmpresaFiltro}>
                <SelectTrigger className="w-[260px] h-10">
                  <SelectValue placeholder="Empresa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as empresas</SelectItem>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.razao_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </Card>

        <Card className="rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-12 text-center text-muted-foreground"
            >
              Nenhum usuário cadastrado ainda.
            </motion.div>
          ) : filtrados.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              Nenhum usuário encontrado com esses filtros.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Convidado em</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.map((u) => {
                  const pendente = !u.email_confirmed_at;
                  const isSelf = user?.id === u.id;
                  return (
                    <TableRow key={u.id} className="group">
                      <TableCell className="font-medium">{u.nome || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        {u.role === "escritorio" ? (
                          <Badge className="bg-brand-soft text-brand hover:bg-brand-soft border-transparent">
                            Escritório
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Cliente</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.role === "cliente" ? u.cliente_razao || "—" : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {fmtData(u.created_at)}
                      </TableCell>
                      <TableCell>
                        {pendente ? (
                          <Badge className="bg-warning/15 text-warning hover:bg-warning/15 border-transparent">
                            Pendente
                          </Badge>
                        ) : (
                          <Badge className="bg-success/15 text-success hover:bg-success/15 border-transparent">
                            Confirmado
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1 opacity-70 group-hover:opacity-100">
                          {pendente && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={reenviandoId === u.id}
                              onClick={() => handleReenviar(u)}
                            >
                              {reenviandoId === u.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Send className="h-4 w-4" />
                              )}
                              Reenviar convite
                            </Button>
                          )}
                          {!isSelf && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setExcluirAlvo(u)}
                              className="text-muted-foreground hover:text-danger"
                            >
                              <Trash2 className="h-4 w-4" />
                              Inativar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <ConvidarDialog
        open={convidarOpen}
        onOpenChange={setConvidarOpen}
        clientes={clientes}
        onConvidado={carregar}
      />

      <AlertDialog open={!!excluirAlvo} onOpenChange={(o) => !o && setExcluirAlvo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inativar usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Ao inativar, este usuário perde o acesso imediato e a conta é removida. Esta
              ação não pode ser desfeita. Continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmarExcluir();
              }}
              disabled={excluindo}
              className="bg-danger text-danger-foreground hover:bg-danger/90"
            >
              {excluindo ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Inativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function ConvidarDialog({
  open,
  onOpenChange,
  clientes,
  onConvidado,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientes: ClienteOption[];
  onConvidado: () => void;
}) {
  const [tipo, setTipo] = useState<"escritorio" | "cliente">("cliente");
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [clienteId, setClienteId] = useState<string>("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (open) {
      setTipo("cliente");
      setEmail("");
      setNome("");
      setClienteId("");
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailLimpo = email.trim();
    if (!emailLimpo) {
      toast.error("Informe um email.");
      return;
    }
    if (tipo === "cliente" && !clienteId) {
      toast.error("Selecione a empresa do cliente.");
      return;
    }

    setEnviando(true);
    const { data, error } = await supabase.functions.invoke("convidar-cliente", {
      body: {
        email: emailLimpo,
        cliente_id: tipo === "cliente" ? clienteId : undefined,
        nome: nome.trim() || undefined,
        role: tipo,
      },
    });
    setEnviando(false);

    if (error || (data && data.ok === false)) {
      const msg = (data && data.error) || error?.message || "Falha ao enviar convite.";
      if (
        typeof msg === "string" &&
        msg.toLowerCase().includes("escrit") &&
        msg.toLowerCase().includes("cliente")
      ) {
        toast.error("Este email já está em uso por um usuário do escritório.");
      } else {
        toast.error("Algo precisa de atenção", { description: msg });
      }
      return;
    }

    toast.success("Convite enviado com segurança.");
    onOpenChange(false);
    onConvidado();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convidar usuário</DialogTitle>
          <DialogDescription>
            O usuário receberá um email seguro pra criar a senha e acessar a plataforma.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo de perfil</Label>
            <RadioGroup
              value={tipo}
              onValueChange={(v) => setTipo(v as "escritorio" | "cliente")}
              className="flex gap-6"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="escritorio" id="t-escritorio" />
                <Label htmlFor="t-escritorio" className="font-normal cursor-pointer">
                  Escritório
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="cliente" id="t-cliente" />
                <Label htmlFor="t-cliente" className="font-normal cursor-pointer">
                  Cliente
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@empresa.com.br"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nome">Nome (opcional)</Label>
            <Input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do usuário"
            />
          </div>

          {tipo === "cliente" && (
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Select value={clienteId} onValueChange={setClienteId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a empresa" />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.razao_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={enviando}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={enviando}
              className="bg-brand text-brand-foreground hover:bg-brand/90"
            >
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Enviar convite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
