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
  const [mode, setMode] = useState<"login" | "forgot" | "bootstrap">("login");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [confirmar, setConfirmar] = useState("");
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
    console.log("[promover_primeiro_escritorio] resultado bruto", { data, error, userId: user.id });
    setLoading(false);
    if (error || data === false) {
      toast.error("Não foi possível promover. Verifique se já existe um escritório cadastrado.");
      return;
    }
    if (data === true) {
      toast.success("Promoção concluída. Carregando seu painel…");
      window.location.replace("/login");
    }
  };

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senha !== confirmar) {
      toast.error("Algo precisa de atenção", { description: "As senhas não coincidem." });
      return;
    }
    if (senha.length < 8) {
      toast.error("Algo precisa de atenção", { description: "A senha precisa ter pelo menos 8 caracteres." });
      return;
    }
    setLoading(true);
    const { data: existe } = await supabase.rpc("existe_escritorio");
    if (existe) {
      setLoading(false);
      setExisteEscritorio(true);
      toast.error("Já existe um escritório cadastrado neste ambiente.");
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { data: { nome }, emailRedirectTo: `${window.location.origin}/login` },
    });
    if (error) {
      setLoading(false);
      toast.error("Algo precisa de atenção — tente novamente.", { description: error.message });
      return;
    }
    if (nome && data.user) {
      await supabase.from("profiles").update({ nome }).eq("id", data.user.id);
    }
    if (!data.session) {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (signInErr) {
        setLoading(false);
        toast.error("Conta criada, mas o login falhou. Entre manualmente.");
        setMode("login");
        return;
      }
    }
    setLoading(false);
    toast.success("Conta criada com segurança. Agora promova-se a escritório.");
    setMode("login");
    setConfirmar("");
    setNome("");
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
            {mode === "login" ? "Entrar" : mode === "forgot" ? "Recuperar acesso" : "Criar conta inicial"}
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {mode === "login"
              ? "Acesse para classificar suas notas com segurança."
              : mode === "forgot"
              ? "Informe seu email para receber as instruções."
              : "Esta conta será a base do ambiente. Em seguida, promova-se a escritório."}
          </p>

          <form
            onSubmit={mode === "login" ? handleLogin : mode === "forgot" ? handleForgot : handleBootstrap}
            className="space-y-4"
          >
            {mode === "bootstrap" && (
              <div className="space-y-2">
                <Label htmlFor="nome">Nome completo</Label>
                <Input id="nome" type="text" required value={nome} onChange={e => setNome(e.target.value)} />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
            </div>

            {(mode === "login" || mode === "bootstrap") && (
              <div className="space-y-2">
                <Label htmlFor="senha">Senha</Label>
                <Input id="senha" type="password" required minLength={mode === "bootstrap" ? 8 : undefined} value={senha} onChange={e => setSenha(e.target.value)} />
              </div>
            )}

            {mode === "bootstrap" && (
              <div className="space-y-2">
                <Label htmlFor="confirmar">Confirmar senha</Label>
                <Input id="confirmar" type="password" required minLength={8} value={confirmar} onChange={e => setConfirmar(e.target.value)} />
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full bg-brand text-brand-foreground hover:bg-brand/90 h-10">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading
                ? "Processando…"
                : mode === "login"
                ? "Entrar"
                : mode === "forgot"
                ? "Enviar instruções"
                : "Criar conta inicial"}
            </Button>
          </form>

          {mode !== "bootstrap" && (
            <div className="mt-4 flex justify-between text-sm">
              <button
                type="button"
                onClick={() => setMode(mode === "login" ? "forgot" : "login")}
                className="text-brand hover:underline"
              >
                {mode === "login" ? "Esqueci minha senha" : "Voltar ao login"}
              </button>
            </div>
          )}

          {mode === "bootstrap" && (
            <div className="mt-4 text-sm">
              <button type="button" onClick={() => setMode("login")} className="text-brand hover:underline">
                Voltar ao login
              </button>
            </div>
          )}

          {existeEscritorio === false && (
            <div className="mt-6 pt-6 border-t space-y-4">
              <div>
                <p className="text-sm font-medium mb-1">Configuração inicial</p>
                <p className="text-xs text-muted-foreground">
                  Crie a primeira conta deste ambiente. Esta opção fica disponível apenas até o primeiro escritório ser cadastrado.
                </p>
              </div>

              {!user && mode !== "bootstrap" && (
                <Button variant="outline" onClick={() => setMode("bootstrap")} disabled={loading} className="w-full">
                  Criar conta inicial
                </Button>
              )}

              {user && (
                <Button variant="outline" onClick={handlePromover} disabled={loading} className="w-full">
                  Promover usuário a escritório
                </Button>
              )}
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
