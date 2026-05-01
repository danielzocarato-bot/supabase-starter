import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { AcruxLogo } from "@/components/AcruxLogo";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type Status = "validando" | "pronto" | "invalido";

export default function ResetPassword() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<Status>("validando");
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelado = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // 0) Mantém o hash disponível, mas só considera erro depois de tentar
    // recuperar a sessão. Alguns clientes de email disparam uma segunda
    // validação do link e deixam #error na URL mesmo após a sessão válida
    // já ter sido criada no navegador do usuário.
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    const hashParams = new URLSearchParams(hash);

    // 1) Instala listener ANTES de qualquer coisa async
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      if (sess && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "USER_UPDATED")) {
        if (!cancelado) setStatus("pronto");
      }
    });

    const estabelecer = async () => {
      // 2) Já tem sessão? (detectSessionInUrl já processou o hash)
      const { data: { session: sessAtual } } = await supabase.auth.getSession();
      if (sessAtual) {
        if (!cancelado) setStatus("pronto");
        return;
      }

      // 2.5) Fallback: processar #access_token diretamente se ainda não há sessão
      if (!sessAtual) {
        const hashParams2 = new URLSearchParams(window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "");
        const accessToken = hashParams2.get("access_token");
        const refreshToken = hashParams2.get("refresh_token");
        if (accessToken && refreshToken) {
          const { error: setErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (!setErr) {
            if (!cancelado) setStatus("pronto");
            return;
          }
        }
      }

      // 3) URL com ?code=... (PKCE)
      const code = searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          if (!cancelado) setStatus("pronto");
          return;
        }
      }

      // 4) URL com ?token_hash=...&type=...
      const token_hash = searchParams.get("token_hash");
      const type = searchParams.get("type") as "invite" | "recovery" | "signup" | "magiclink" | null;
      if (token_hash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash, type });
        if (!error) {
          if (!cancelado) setStatus("pronto");
          return;
        }
      }

      // 5) Antes de invalidar, revalida a sessão uma última vez.
      const { data: { session: s3 } } = await supabase.auth.getSession();
      if (s3) {
        if (!cancelado) setStatus("pronto");
        return;
      }

      // 6) Aguarda até 8s pelo evento async (detectSessionInUrl pode demorar)
      timer = setTimeout(async () => {
        const { data: { session: s2 } } = await supabase.auth.getSession();
        if (cancelado) return;

        if (s2) {
          setStatus("pronto");
          return;
        }

        if (hashParams.get("error")) {
          setStatus("invalido");
          return;
        }

        setStatus("invalido");
      }, 8000);
    };
    estabelecer();

    return () => {
      cancelado = true;
      if (timer) clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, [searchParams]);

  const submit = async (e: React.FormEvent) => {
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
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) {
      setLoading(false);
      toast.error("Algo precisa de atenção", { description: error.message });
      return;
    }
    // Limpa a sessão temporária do convite e força login completo
    await supabase.auth.signOut();
    setLoading(false);
    toast.success("Senha definida com segurança. Acesse com seu novo acesso.");
    nav("/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><AcruxLogo /></div>
        <Card className="p-8 rounded-xl border shadow-sm">
          {status === "validando" && (
            <div className="flex flex-col items-center justify-center gap-3 py-8">
              <Loader2 className="h-6 w-6 animate-spin text-brand" />
              <p className="text-sm text-muted-foreground">Validando link…</p>
            </div>
          )}
          {status === "invalido" && (
            <div className="space-y-4">
              <h1 className="text-2xl font-display font-semibold">Link inválido ou expirado</h1>
              <p className="text-sm text-muted-foreground">
                Este link de redefinição já foi utilizado ou expirou. Solicite um novo email para sua contabilidade.
              </p>
              <Button onClick={() => nav("/login", { replace: true })} className="w-full bg-brand text-brand-foreground hover:bg-brand/90 h-10">
                Voltar ao login
              </Button>
            </div>
          )}
          {status === "pronto" && (
            <>
              <h1 className="text-2xl font-display font-semibold mb-2">Definir nova senha</h1>
              <p className="text-sm text-muted-foreground mb-6">
                Crie uma senha com pelo menos 8 caracteres.
              </p>
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="senha">Nova senha</Label>
                  <Input id="senha" type="password" required minLength={8} value={senha} onChange={e => setSenha(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmar">Confirmar nova senha</Label>
                  <Input id="confirmar" type="password" required minLength={8} value={confirmar} onChange={e => setConfirmar(e.target.value)} />
                </div>
                <Button type="submit" disabled={loading} className="w-full bg-brand text-brand-foreground hover:bg-brand/90 h-10">
                  {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {loading ? "Processando…" : "Atualizar senha"}
                </Button>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
