import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Plus, Search, Users, ArrowRight } from "lucide-react";
import { formatCNPJ, onlyDigits } from "@/lib/format";

type ClienteRow = {
  id: string;
  razao_social: string;
  cnpj: string;
  codigo_empresa_dominio: number;
  ativo: boolean;
  acumuladores_count: number;
  competencias_abertas_count: number;
};

export default function Clientes() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [rows, setRows] = useState<ClienteRow[]>([]);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const carregar = async () => {
    setLoading(true);
    const { data: clientes, error } = await supabase
      .from("clientes")
      .select("id, razao_social, cnpj, codigo_empresa_dominio, ativo")
      .order("razao_social", { ascending: true });

    if (error) {
      toast.error("Algo precisa de atenção", { description: error.message });
      setLoading(false);
      return;
    }

    const ids = (clientes || []).map(c => c.id);
    let acumMap = new Map<string, number>();
    let compMap = new Map<string, number>();

    if (ids.length) {
      const [{ data: acums }, { data: comps }] = await Promise.all([
        supabase.from("acumuladores").select("cliente_id").in("cliente_id", ids).eq("ativo", true),
        supabase.from("competencias").select("cliente_id, status").in("cliente_id", ids).eq("status", "aberta"),
      ]);
      (acums || []).forEach(a => acumMap.set(a.cliente_id, (acumMap.get(a.cliente_id) || 0) + 1));
      (comps || []).forEach(c => compMap.set(c.cliente_id, (compMap.get(c.cliente_id) || 0) + 1));
    }

    setRows(
      (clientes || []).map(c => ({
        ...c,
        acumuladores_count: acumMap.get(c.id) || 0,
        competencias_abertas_count: compMap.get(c.id) || 0,
      }))
    );
    setLoading(false);
  };

  useEffect(() => { carregar(); }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return rows;
    const qDigits = onlyDigits(q);
    return rows.filter(r => {
      const razao = r.razao_social.toLowerCase();
      const cnpjDigits = onlyDigits(r.cnpj);
      return razao.includes(q) || (qDigits && cnpjDigits.includes(qDigits));
    });
  }, [rows, busca]);

  const handleToggleAtivo = async (cliente: ClienteRow, novoEstado: boolean) => {
    setTogglingId(cliente.id);
    const { error } = await supabase.from("clientes").update({ ativo: novoEstado }).eq("id", cliente.id);
    setTogglingId(null);
    if (error) {
      toast.error("Algo precisa de atenção", { description: error.message });
      return;
    }
    setRows(prev => prev.map(r => (r.id === cliente.id ? { ...r, ativo: novoEstado } : r)));
    toast.success(novoEstado ? "Cliente reativado." : "Cliente inativado com segurança.");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-semibold">Clientes</h1>
          <p className="text-muted-foreground mt-1">Gestão das empresas atendidas pelo escritório.</p>
        </div>
        <Button
          onClick={() => nav("/app/escritorio/clientes/novo")}
          className="bg-brand text-brand-foreground hover:bg-brand/90 h-11 px-5"
          size="lg"
        >
          <Plus className="h-4 w-4" />
          Novo Cliente
        </Button>
      </div>

      <Card className="p-4 rounded-xl">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por razão social ou CNPJ"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="pl-9 h-10"
          />
        </div>
      </Card>

      <Card className="rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Processando…
          </div>
        ) : rows.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-12 text-center max-w-xl mx-auto"
          >
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-brand-soft text-brand mb-4">
              <Users className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <h2 className="text-xl font-display font-semibold mb-2">Sua carteira ainda está vazia</h2>
            <p className="text-muted-foreground mb-6">
              Comece cadastrando seu primeiro cliente. Em poucos passos, você organiza a estrutura
              completa pra que a classificação flua todo mês com segurança.
            </p>
            <Button
              onClick={() => nav("/app/escritorio/clientes/novo")}
              className="bg-brand text-brand-foreground hover:bg-brand/90"
            >
              <Plus className="h-4 w-4" />
              Cadastrar primeiro cliente
            </Button>
          </motion.div>
        ) : filtrados.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            Nenhum cliente encontrado para "{busca}".
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Razão Social</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead className="text-right">Cód. Domínio</TableHead>
                <TableHead className="text-right">Acumuladores</TableHead>
                <TableHead className="text-right">Comp. em aberto</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map(c => (
                <TableRow key={c.id} className="group">
                  <TableCell className="font-medium">{c.razao_social}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">{formatCNPJ(c.cnpj)}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.codigo_empresa_dominio}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.acumuladores_count}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.competencias_abertas_count > 0 ? (
                      <Badge variant="secondary" className="bg-brand-soft text-brand hover:bg-brand-soft">
                        {c.competencias_abertas_count}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={c.ativo}
                        disabled={togglingId === c.id}
                        onCheckedChange={(v) => handleToggleAtivo(c, v)}
                        aria-label="Ativo"
                      />
                      <span className={`text-xs ${c.ativo ? "text-success" : "text-muted-foreground"}`}>
                        {c.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => nav(`/app/escritorio/clientes/${c.id}`)}
                      className="opacity-70 group-hover:opacity-100"
                    >
                      Abrir
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
