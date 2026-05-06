import { supabase } from "@/integrations/supabase/client";

/**
 * Exclui uma competência inteira (itens → notas → exportações → competência)
 * via RPC atômica `excluir_competencia_cascade` (security definer).
 * Apenas perfil 'escritorio' tem permissão.
 */
export async function excluirCompetencia(competenciaId: string): Promise<void> {
  const { error } = await supabase.rpc("excluir_competencia_cascade" as any, {
    _competencia_id: competenciaId,
  });
  if (error) throw error;
}
