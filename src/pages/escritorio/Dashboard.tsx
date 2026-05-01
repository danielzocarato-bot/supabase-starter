import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Users, FileClock, ClipboardList } from "lucide-react";

const saudacao = () => {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
};

export default function DashboardEscritorio() {
  const { profile } = useAuth();
  const [stats, setStats] = useState({ clientes: 0, abertas: 0, aguardando: 0 });

  useEffect(() => {
    (async () => {
      const [c, a, n] = await Promise.all([
        supabase.from("clientes").select("id", { count: "exact", head: true }).eq("ativo", true),
        supabase.from("competencias").select("id", { count: "exact", head: true }).eq("status", "aberta"),
        supabase.from("notas_fiscais").select("id", { count: "exact", head: true }).is("acumulador_id", null).eq("cancelada", false),
      ]);
      setStats({ clientes: c.count || 0, abertas: a.count || 0, aguardando: n.count || 0 });
    })();
  }, []);

  const primeiroNome = (profile?.nome || profile?.email || "").split(" ")[0].split("@")[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-semibold">{saudacao()}, {primeiroNome}</h1>
        <p className="text-muted-foreground mt-1">Visão geral da operação do escritório.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">Clientes ativos</span>
            <Users className="h-4 w-4 text-brand" strokeWidth={1.5} />
          </div>
          <p className="text-3xl font-display font-semibold">{stats.clientes}</p>
        </Card>
        <Card className="p-6 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">Competências em aberto</span>
            <FileClock className="h-4 w-4 text-brand" strokeWidth={1.5} />
          </div>
          <p className="text-3xl font-display font-semibold">{stats.abertas}</p>
        </Card>
        <Card className="p-6 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-muted-foreground">Notas aguardando classificação</span>
            <ClipboardList className="h-4 w-4 text-brand" strokeWidth={1.5} />
          </div>
          <p className="text-3xl font-display font-semibold">{stats.aguardando}</p>
        </Card>
      </div>

      <Card className="p-8 rounded-xl text-center">
        <p className="text-muted-foreground">
          Comece cadastrando seu primeiro cliente. Em poucos passos, você organiza a estrutura completa pra que a classificação flua todo mês com segurança.
        </p>
      </Card>
    </div>
  );
}
