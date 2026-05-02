import { supabase } from "@/integrations/supabase/client";

/**
 * Exclui uma competência inteira: itens → notas → competência.
 * Sem FK cascade no banco, então a ordem importa.
 * RLS: apenas perfil 'escritorio' tem permissão de DELETE.
 */
export async function excluirCompetencia(competenciaId: string): Promise<void> {
  // 1) Buscar ids das notas para apagar itens em lote
  const { data: notas, error: errNotas } = await supabase
    .from("notas_fiscais")
    .select("id")
    .eq("competencia_id", competenciaId);
  if (errNotas) throw errNotas;

  const notaIds = (notas ?? []).map((n) => n.id);

  // 2) Apaga itens (se houver notas)
  if (notaIds.length > 0) {
    const { error: errItens } = await supabase
      .from("notas_fiscais_itens")
      .delete()
      .in("nota_id", notaIds);
    if (errItens) throw errItens;
  }

  // 3) Apaga notas
  const { error: errDelNotas } = await supabase
    .from("notas_fiscais")
    .delete()
    .eq("competencia_id", competenciaId);
  if (errDelNotas) throw errDelNotas;

  // 4) Apaga competência
  const { error: errComp } = await supabase
    .from("competencias")
    .delete()
    .eq("id", competenciaId);
  if (errComp) throw errComp;
}
