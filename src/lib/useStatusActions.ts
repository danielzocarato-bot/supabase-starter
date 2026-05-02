import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const MESES_PT = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];
function formatPeriodo(p: string) {
  const m = p.match(/^(\d{4})-(\d{2})$/);
  if (!m) return p;
  return `${MESES_PT[parseInt(m[2], 10) - 1]} / ${m[1]}`;
}

type StatusComp = "aberta" | "concluida" | "exportada";

type CompetenciaLike = {
  id: string;
  cliente_id: string;
  periodo: string;
  status: StatusComp;
  exportada_em: string | null;
};

type ClienteLike = { id: string; razao_social: string } | null;

type ProfileLike = { id?: string; role?: string; nome?: string | null } | null;

export function useStatusActions({
  competencia,
  setCompetencia,
  cliente,
  profile,
  totalClassificavel,
}: {
  competencia: CompetenciaLike | null;
  setCompetencia: (c: CompetenciaLike) => void;
  cliente: ClienteLike;
  profile: ProfileLike;
  totalClassificavel: number;
}) {
  const [acaoLoading, setAcaoLoading] = useState(false);
  const [confirmConcluirOpen, setConfirmConcluirOpen] = useState(false);
  const [confirmReabrirOpen, setConfirmReabrirOpen] = useState(false);

  const handleConcluir = async () => {
    if (!competencia) return;
    setAcaoLoading(true);
    const { error } = await supabase
      .from("competencias")
      .update({ status: "concluida", concluida_em: new Date().toISOString() })
      .eq("id", competencia.id);
    setAcaoLoading(false);
    if (error) {
      toast.error("Algo precisa de atenção", { description: error.message });
      return;
    }
    setCompetencia({ ...competencia, status: "concluida" });
    setConfirmConcluirOpen(false);
    if (profile?.role === "cliente") {
      toast.success("Classificação validada com segurança.");
    } else {
      toast.success("Competência marcada como concluída.");
    }

    if (profile?.role === "cliente" && cliente) {
      try {
        const { data: escritorioUsers } = await supabase
          .from("profiles")
          .select("email")
          .eq("role", "escritorio");
        const periodoLabel = formatPeriodo(competencia.periodo);
        const ctaUrl = `${window.location.origin}/app/escritorio/competencias/${competencia.id}`;
        for (const u of escritorioUsers ?? []) {
          if (!u.email) continue;
          await supabase.functions.invoke("send-transactional-email", {
            body: {
              templateName: "competencia-concluida",
              recipientEmail: u.email,
              idempotencyKey: `concluida-${competencia.id}-${u.email}`,
              templateData: {
                nomeCliente: profile.nome ?? cliente.razao_social,
                razaoSocial: cliente.razao_social,
                periodoLabel,
                totalNotas: totalClassificavel,
                ctaUrl,
              },
            },
          });
        }
      } catch (e) {
        console.error("[handleConcluir] Falha ao enviar email:", e);
      }
    }
  };

  const handleReabrir = async () => {
    if (!competencia) return;
    setAcaoLoading(true);
    const { error } = await supabase
      .from("competencias")
      .update({ status: "aberta", concluida_em: null })
      .eq("id", competencia.id);
    setAcaoLoading(false);
    if (error) {
      toast.error("Algo precisa de atenção", { description: error.message });
      return;
    }
    setCompetencia({ ...competencia, status: "aberta" });
    setConfirmReabrirOpen(false);
    toast.success("Competência reaberta.");

    try {
      const { data: clientesUsers } = await supabase
        .from("profiles")
        .select("email, nome")
        .eq("cliente_id", competencia.cliente_id)
        .eq("role", "cliente");
      const periodoLabel = formatPeriodo(competencia.periodo);
      const ctaUrl = `${window.location.origin}/app/cliente/competencias/${competencia.id}`;
      for (const u of clientesUsers ?? []) {
        if (!u.email) continue;
        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "competencia-reaberta",
            recipientEmail: u.email,
            idempotencyKey: `reaberta-${competencia.id}-${Date.now()}-${u.email}`,
            templateData: {
              nome: u.nome ?? null,
              periodoLabel,
              ctaUrl,
            },
          },
        });
      }
    } catch (e) {
      console.error("[handleReabrir] Falha ao enviar email:", e);
    }
  };

  return {
    acaoLoading,
    confirmConcluirOpen,
    setConfirmConcluirOpen,
    confirmReabrirOpen,
    setConfirmReabrirOpen,
    handleConcluir,
    handleReabrir,
  };
}
