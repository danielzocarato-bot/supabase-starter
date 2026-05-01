import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { AcruxLogo } from "@/components/AcruxLogo";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function Login() {
  const nav = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [existeEscritorio, setExisteEscritorio] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.rpc("existe_escritorio").then(({ data }) => setExisteEscritorio(!!data));
  }, []);

  useEffect(() => {
    if (!authLoading && user && profile) {
      nav(profile.role === "escritorio" ? "/app/escritorio" : "/app/cliente", { replace: true });
    }
  }, [user, profile, authLoading, nav]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setLoading(false);
    if (error) {
      toast.error("Algo precisa de atenção", { description: error.message });
      return;
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) toast.error("Algo precisa de atenção", { description: error.message });
    else toast.success("Enviamos as instruções para seu email.");
  };

  const handlePromover = async () => {
    if (!user) {
      toast.error("Faça login primeiro com a conta que deve virar escritório.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("promover_primeiro_escritorio", { _user_id: user.id });
    setLoading(false);
    if (error || !data) {
      toast.error("Não foi possível promover. Já existe um escritório cadastrado.");
      return;
    }
    toast.success("Você é o primeiro escritório. Recarregando…");
    setTimeout(() => window.location.reload(), 800);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-md"
      >
        <div className="mb-8 flex justify-center">
          <AcruxLogo />
        </div>
        <Card className="p-8 rounded-xl border shadow-sm">
          <h1 className="text-2xl font-display font-semibold mb-1">
            {mode === "login" ? "Entrar" : "Recuperar acesso"}
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {mode === "login"
              ? "Acesse para classificar suas notas com segurança."
              : "Informe seu email para receber as instruções."}
          </p>

          <form onSubmit={mode === "login" ? handleLogin : handleForgot} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
            </div>

            {mode === "login" && (
              <div className="space-y-2">
                <Label htmlFor="senha">Senha</Label>
                <Input id="senha" type="password" required value={senha} onChange={e => setSenha(e.target.value)} />
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full bg-brand text-brand-foreground hover:bg-brand/90 h-10">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Processando…" : mode === "login" ? "Entrar" : "Enviar instruções"}
            </Button>
          </form>

          <div className="mt-4 flex justify-between text-sm">
            <button
              type="button"
              onClick={() => setMode(mode === "login" ? "forgot" : "login")}
              className="text-brand hover:underline"
            >
              {mode === "login" ? "Esqueci minha senha" : "Voltar ao login"}
            </button>
          </div>

          {existeEscritorio === false && user && (
            <div className="mt-6 pt-6 border-t">
              <p className="text-xs text-muted-foreground mb-3">
                Configuração inicial: ainda não há um escritório cadastrado. Promova o usuário atual para escritório.
              </p>
              <Button variant="outline" onClick={handlePromover} disabled={loading} className="w-full">
                Promover usuário a escritório
              </Button>
            </div>
          )}
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Acrux Contabilidade · uma forma mais inteligente de classificar suas notas
        </p>
      </motion.div>
    </div>
  );
}
