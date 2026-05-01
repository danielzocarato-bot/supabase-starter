import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, MailX } from "lucide-react";

type State =
  | { kind: "loading" }
  | { kind: "valid" }
  | { kind: "already" }
  | { kind: "invalid" }
  | { kind: "submitting" }
  | { kind: "done" }
  | { kind: "error"; message: string };

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>({ kind: "loading" });

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
  const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

  useEffect(() => {
    if (!token) {
      setState({ kind: "invalid" });
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setState({ kind: "invalid" });
          return;
        }
        if (data?.valid === true) setState({ kind: "valid" });
        else if (data?.reason === "already_unsubscribed") setState({ kind: "already" });
        else setState({ kind: "invalid" });
      } catch {
        setState({ kind: "invalid" });
      }
    })();
  }, [token, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY]);

  async function confirmar() {
    if (!token) return;
    setState({ kind: "submitting" });
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/handle-email-unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data && data.success === false && data.reason !== "already_unsubscribed")) {
        setState({ kind: "error", message: "Algo precisa de atenção. Tente novamente em instantes." });
        return;
      }
      setState({ kind: "done" });
    } catch {
      setState({ kind: "error", message: "Algo precisa de atenção. Tente novamente em instantes." });
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md p-8 rounded-2xl shadow-sm">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="h-12 w-12 rounded-full bg-brand-soft flex items-center justify-center text-brand">
            <MailX className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">
            Cancelar inscrição
          </h1>

          {state.kind === "loading" && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Validando seu link…
            </p>
          )}

          {state.kind === "valid" && (
            <>
              <p className="text-sm text-muted-foreground">
                Confirme abaixo para deixar de receber e-mails da plataforma Acrux.
                Avisos críticos sobre sua conta continuarão sendo enviados.
              </p>
              <Button onClick={confirmar} className="mt-2 w-full">
                Confirmar cancelamento
              </Button>
            </>
          )}

          {state.kind === "submitting" && (
            <Button disabled className="mt-2 w-full">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Processando…
            </Button>
          )}

          {state.kind === "done" && (
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              <p className="text-sm text-muted-foreground">
                Pronto. Você não receberá mais e-mails informativos da Acrux.
              </p>
            </div>
          )}

          {state.kind === "already" && (
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              <p className="text-sm text-muted-foreground">
                Este endereço já está fora da nossa lista de envio.
              </p>
            </div>
          )}

          {state.kind === "invalid" && (
            <div className="flex flex-col items-center gap-2">
              <XCircle className="h-6 w-6 text-destructive" />
              <p className="text-sm text-muted-foreground">
                Link inválido ou expirado. Algo precisa de atenção — abra novamente o
                link mais recente recebido por e-mail.
              </p>
            </div>
          )}

          {state.kind === "error" && (
            <div className="flex flex-col items-center gap-2">
              <XCircle className="h-6 w-6 text-destructive" />
              <p className="text-sm text-muted-foreground">{state.message}</p>
              <Button variant="outline" onClick={confirmar}>
                Tentar novamente
              </Button>
            </div>
          )}

          <p className="text-xs text-muted-foreground mt-4">
            Acrux Contabilidade · uma forma mais inteligente de classificar suas notas
          </p>
        </div>
      </Card>
    </div>
  );
}
