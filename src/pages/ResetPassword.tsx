import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { AcruxLogo } from "@/components/AcruxLogo";
import { toast } from "sonner";

export default function ResetPassword() {
  const nav = useNavigate();
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setLoading(false);
    if (error) {
      toast.error("Algo precisa de atenção", { description: error.message });
      return;
    }
    toast.success("Senha atualizada.");
    nav("/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><AcruxLogo /></div>
        <Card className="p-8 rounded-xl border shadow-sm">
          <h1 className="text-2xl font-display font-semibold mb-6">Definir nova senha</h1>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="senha">Nova senha</Label>
              <Input id="senha" type="password" required minLength={8} value={senha} onChange={e => setSenha(e.target.value)} />
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-brand text-brand-foreground hover:bg-brand/90 h-10">
              {loading ? "Processando…" : "Atualizar senha"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
