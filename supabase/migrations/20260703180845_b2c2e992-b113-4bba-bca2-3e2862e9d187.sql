
-- 1) Revoke UPDATE on raw_data column so it can only be modified via SECURITY DEFINER RPCs
REVOKE UPDATE (raw_data) ON public.notas_fiscais FROM authenticated, anon, PUBLIC;
REVOKE UPDATE (raw_data) ON public.notas_fiscais_itens FROM authenticated, anon, PUBLIC;

-- 2) Scope policies to authenticated only (drop {public} scope)
DROP POLICY IF EXISTS "config select escritorio" ON public.configuracoes_escritorio;
DROP POLICY IF EXISTS "config update escritorio" ON public.configuracoes_escritorio;
CREATE POLICY "config select escritorio" ON public.configuracoes_escritorio
  FOR SELECT TO authenticated USING (public.is_escritorio());
CREATE POLICY "config update escritorio" ON public.configuracoes_escritorio
  FOR UPDATE TO authenticated USING (public.is_escritorio()) WITH CHECK (public.is_escritorio());

DROP POLICY IF EXISTS "nfi mut escritorio" ON public.notas_fiscais_itens;
DROP POLICY IF EXISTS "nfi select" ON public.notas_fiscais_itens;
DROP POLICY IF EXISTS "nfi update cliente" ON public.notas_fiscais_itens;

CREATE POLICY "nfi mut escritorio" ON public.notas_fiscais_itens
  FOR ALL TO authenticated USING (public.is_escritorio()) WITH CHECK (public.is_escritorio());

CREATE POLICY "nfi select" ON public.notas_fiscais_itens
  FOR SELECT TO authenticated
  USING (
    public.is_escritorio()
    OR nota_id IN (
      SELECT n.id FROM public.notas_fiscais n
      JOIN public.competencias c ON c.id = n.competencia_id
      WHERE c.cliente_id = public.meu_cliente_id()
    )
  );

CREATE POLICY "nfi update cliente" ON public.notas_fiscais_itens
  FOR UPDATE TO authenticated
  USING (
    nota_id IN (
      SELECT n.id FROM public.notas_fiscais n
      JOIN public.competencias c ON c.id = n.competencia_id
      WHERE c.cliente_id = public.meu_cliente_id()
    )
  )
  WITH CHECK (
    nota_id IN (
      SELECT n.id FROM public.notas_fiscais n
      JOIN public.competencias c ON c.id = n.competencia_id
      WHERE c.cliente_id = public.meu_cliente_id()
    )
  );

-- 3) Revoke public execute from internal SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.segregar_nota(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remover_segregacao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.segregar_nota(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remover_segregacao(uuid) TO authenticated;
