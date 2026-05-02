import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type ConfigEscritorio = {
  reply_to_email: string | null;
  from_name: string | null;
  endereco_completo: string | null;
  telefone: string | null;
  sieg_api_key: string | null;
  sieg_email: string | null;
  sieg_password: string | null;
  updated_at: string | null;
};

export default function Configuracoes() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<ConfigEscritorio | null>(null);
  const [form, setForm] = useState({
    reply_to_email: "",
    from_name: "",
    endereco_completo: "",
    telefone: "",
    sieg_api_key: "",
    sieg_email: "",
    sieg_password: "",
  });

  const carregar = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("configuracoes_escritorio")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      toast.error("Algo precisa de atenção", { description: error.message });
      setLoading(false);
      return;
    }
    setConfig(data);
    setForm({
      reply_to_email: data?.reply_to_email ?? "",
      from_name: data?.from_name ?? "",
      endereco_completo: data?.endereco_completo ?? "",
      telefone: data?.telefone ?? "",
      sieg_api_key: (data as any)?.sieg_api_key ?? "",
      sieg_email: (data as any)?.sieg_email ?? "",
      sieg_password: (data as any)?.sieg_password ?? "",
    });
    setLoading(false);
  };

  useEffect(() => {
    carregar();
  }, []);

  const dirty =
    config &&
    (form.reply_to_email !== (config.reply_to_email ?? "") ||
      form.from_name !== (config.from_name ?? "") ||
      form.endereco_completo !== (config.endereco_completo ?? "") ||
      form.telefone !== (config.telefone ?? "") ||
      form.sieg_api_key !== (config.sieg_api_key ?? "") ||
      form.sieg_email !== ((config as any).sieg_email ?? "") ||
      form.sieg_password !== ((config as any).sieg_password ?? ""));

  const handleSalvar = async () => {
    if (
      form.reply_to_email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.reply_to_email)
    ) {
      toast.error("Algo precisa de atenção", { description: "Email inválido." });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("configuracoes_escritorio")
      .update({
        reply_to_email: form.reply_to_email.trim() || null,
        from_name: form.from_name.trim() || null,
        endereco_completo: form.endereco_completo.trim() || null,
        telefone: form.telefone.trim() || null,
        sieg_api_key: form.sieg_api_key.trim() || null,
        sieg_email: form.sieg_email.trim() || null,
        sieg_password: form.sieg_password.trim() || null,
      } as any)
      .eq("id", 1);
    setSaving(false);
    if (error) {
      toast.error("Algo precisa de atenção", { description: error.message });
      return;
    }
    toast.success("Configurações salvas com segurança.");
    carregar();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Processando…
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Perfil pessoal e configurações do escritório.
        </p>
      </div>

      <Tabs defaultValue="escritorio">
        <TabsList>
          <TabsTrigger value="perfil">Meu perfil</TabsTrigger>
          <TabsTrigger value="escritorio">Escritório</TabsTrigger>
        </TabsList>

        <TabsContent value="perfil">
          <Card className="p-6 space-y-4">
            <div>
              <Label>Nome</Label>
              <Input value={profile?.nome ?? ""} disabled className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">
                A edição do perfil pessoal será habilitada em breve.
              </p>
            </div>
            <div>
              <Label>Email</Label>
              <Input value={profile?.email ?? ""} disabled className="mt-1" />
            </div>
            <div>
              <Label>Perfil</Label>
              <Input value={profile?.role ?? ""} disabled className="mt-1" />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="escritorio">
          <Card className="p-6 space-y-5">
            <div>
              <h2 className="text-lg font-medium">Identidade dos emails</h2>
              <p className="text-sm text-muted-foreground">
                Configure como os emails enviados pela plataforma aparecem para os
                clientes.
              </p>
            </div>

            <div>
              <Label>Nome do remetente</Label>
              <Input
                value={form.from_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, from_name: e.target.value }))
                }
                placeholder="Acrux Contabilidade"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Aparece como remetente nos emails. Ex: "Acrux Contabilidade
                {` <noreply@notify...>`}".
              </p>
            </div>

            <div>
              <Label>Email de resposta (reply-to)</Label>
              <Input
                type="email"
                value={form.reply_to_email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, reply_to_email: e.target.value }))
                }
                placeholder="contato@acrux-group.com.br"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Quando o cliente clica em "responder", a mensagem é entregue neste
                endereço. Use um email institucional que alguém monitora — não use
                no-reply.
              </p>
            </div>

            <div>
              <Label>Telefone (opcional)</Label>
              <Input
                value={form.telefone}
                onChange={(e) =>
                  setForm((f) => ({ ...f, telefone: e.target.value }))
                }
                placeholder="(11) 99999-9999"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Se preenchido, aparece no rodapé dos emails.
              </p>
            </div>

            <div>
              <Label>Endereço institucional (opcional)</Label>
              <Textarea
                value={form.endereco_completo}
                onChange={(e) =>
                  setForm((f) => ({ ...f, endereco_completo: e.target.value }))
                }
                placeholder="Rua X, 100 — Sala 200 — Bairro — Cidade/UF — CEP 00000-000"
                className="mt-1"
                rows={2}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Aparece no rodapé dos emails. Ajuda na credibilidade e evita
                reportes de spam.
              </p>
            </div>

            {config?.updated_at && (
              <p className="text-xs text-muted-foreground border-t pt-3">
                Última alteração:{" "}
                {new Date(config.updated_at).toLocaleString("pt-BR")}
              </p>
            )}
          </Card>

          {/* Card SIEG */}
          <Card className="p-6 space-y-5 mt-6">
            <div>
              <h2 className="text-lg font-medium">Integração SIEG</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Configure sua chave de API SIEG para buscar XMLs diretamente do Cofre, sem upload manual.
              </p>
            </div>

            <div>
              <Label htmlFor="sieg_api_key">API Key SIEG</Label>
              <Input
                id="sieg_api_key"
                type="password"
                value={form.sieg_api_key}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sieg_api_key: e.target.value }))
                }
                placeholder="••••••••••"
                className="mt-1 font-mono"
                autoComplete="off"
              />
            <p className="text-xs text-muted-foreground mt-1">
                Encontre em <strong>Minha Conta → Integrações API SIEG</strong> dentro da plataforma SIEG.
                Se a SIEG retornar "Não Autenticado", verifique se a chave está ativa e se o IP do servidor está liberado no painel.
              </p>
            </div>
          </Card>

          <div className="flex justify-end pt-4">
            <Button
              onClick={handleSalvar}
              disabled={!dirty || saving}
              className="bg-brand text-brand-foreground hover:bg-brand/90"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {saving ? "Processando…" : "Salvar alterações"}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
