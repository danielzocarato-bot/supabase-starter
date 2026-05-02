import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ClassificacaoNFSe from "./ClassificacaoNFSe";
import ClassificacaoNFe from "./ClassificacaoNFe";

type Tipo = "nfse_tomada" | "nfe_entrada" | "nfe_saida";

export default function Classificacao() {
  const { id } = useParams<{ id: string }>();
  const [tipo, setTipo] = useState<Tipo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("competencias")
        .select("tipo")
        .eq("id", id)
        .maybeSingle();
      if (!data) setNotFound(true);
      else setTipo(((data.tipo as Tipo) ?? "nfse_tomada"));
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Processando…</span>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-lg font-medium">Competência não encontrada.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Verifique se o link está correto.
          </p>
        </div>
      </div>
    );
  }

  return tipo === "nfse_tomada" ? <ClassificacaoNFSe /> : <ClassificacaoNFe />;
}
