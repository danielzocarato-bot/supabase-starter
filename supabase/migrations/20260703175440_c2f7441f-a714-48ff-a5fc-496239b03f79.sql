-- Segregação de notas fiscais (nfse_tomada e documento_avulso)
-- permite dividir uma nota em múltiplas linhas para classificação em acumuladores diferentes

CREATE OR REPLACE FUNCTION public.segregar_nota(_nota_id uuid)
RETURNS public.notas_fiscais
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_orig public.notas_fiscais%ROWTYPE;
  comp_tipo public.tipo_operacao;
  comp_cliente uuid;
  idx int;
  serie_base text;
  serie_nova text;
  novo_raw jsonb;
  novo_id_externo text;
  nova public.notas_fiscais%ROWTYPE;
BEGIN
  SELECT * INTO n_orig FROM public.notas_fiscais WHERE id = _nota_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nota não encontrada';
  END IF;

  IF (n_orig.raw_data->>'segregada_de') IS NOT NULL THEN
    RAISE EXCEPTION 'Não é possível segregar uma linha que já é uma segregação';
  END IF;

  SELECT c.tipo, c.cliente_id INTO comp_tipo, comp_cliente
  FROM public.competencias c WHERE c.id = n_orig.competencia_id;

  IF comp_tipo IS NULL OR comp_tipo NOT IN ('nfse_tomada','documento_avulso') THEN
    RAISE EXCEPTION 'Segregação disponível apenas para nfse_tomada e documento_avulso';
  END IF;

  IF NOT (public.is_escritorio() OR comp_cliente = public.meu_cliente_id()) THEN
    RAISE EXCEPTION 'Sem permissão para essa competência';
  END IF;

  SELECT COALESCE(MAX(((raw_data->>'segregacao_indice')::int)), 0) + 1
    INTO idx
    FROM public.notas_fiscais
   WHERE competencia_id = n_orig.competencia_id
     AND raw_data->>'segregada_de' = n_orig.id::text;

  serie_base := COALESCE(
    NULLIF(n_orig.raw_data->>'serie',''),
    NULLIF(n_orig.raw_data->'ide'->>'serie',''),
    ''
  );
  serie_nova := serie_base || idx::text;

  novo_raw := COALESCE(n_orig.raw_data, '{}'::jsonb)
    || jsonb_build_object(
      'serie', serie_nova,
      'segregada_de', n_orig.id::text,
      'segregacao_indice', idx
    );
  IF novo_raw ? 'ide' AND jsonb_typeof(novo_raw->'ide') = 'object' THEN
    novo_raw := jsonb_set(novo_raw, '{ide,serie}', to_jsonb(serie_nova), true);
  END IF;

  novo_id_externo := n_orig.id_externo || '#SEG-' || idx::text;

  INSERT INTO public.notas_fiscais (
    competencia_id, id_externo, numero_nfe, emissao_nfe, data_competencia,
    prestador_cnpj, prestador_razao, prestador_uf, prestador_municipio,
    prestador_municipio_ibge, prestador_endereco, cnae_descricao, servico_municipal,
    valor_nfe, desconto, valor_contabil, observacao, cancelada, raw_data,
    acumulador_id, classificado_em, classificado_por,
    tipo_documento, chave_nfe, tipo_operacao_nfe, categoria_doc, data_vencimento
  )
  VALUES (
    n_orig.competencia_id, novo_id_externo, n_orig.numero_nfe, n_orig.emissao_nfe, n_orig.data_competencia,
    n_orig.prestador_cnpj, n_orig.prestador_razao, n_orig.prestador_uf, n_orig.prestador_municipio,
    n_orig.prestador_municipio_ibge, n_orig.prestador_endereco, n_orig.cnae_descricao, n_orig.servico_municipal,
    0, 0, 0, n_orig.observacao, n_orig.cancelada, novo_raw,
    NULL, NULL, NULL,
    n_orig.tipo_documento, n_orig.chave_nfe, n_orig.tipo_operacao_nfe, n_orig.categoria_doc, n_orig.data_vencimento
  )
  RETURNING * INTO nova;

  -- Para documento_avulso a tela de classificação opera por itens; cria 1 item vazio
  IF comp_tipo = 'documento_avulso' THEN
    INSERT INTO public.notas_fiscais_itens (nota_id, numero_item, codigo_produto, descricao_produto, ncm, cfop, valor, raw_data)
    VALUES (nova.id, 1, NULL, n_orig.observacao, NULL, NULL, 0, '{}'::jsonb);
  END IF;

  RETURN nova;
END;
$$;

CREATE OR REPLACE FUNCTION public.remover_segregacao(_nota_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_row public.notas_fiscais%ROWTYPE;
  comp_cliente uuid;
BEGIN
  SELECT * INTO n_row FROM public.notas_fiscais WHERE id = _nota_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nota não encontrada';
  END IF;

  IF (n_row.raw_data->>'segregada_de') IS NULL THEN
    RAISE EXCEPTION 'Só é possível remover linhas segregadas';
  END IF;

  SELECT c.cliente_id INTO comp_cliente
    FROM public.competencias c WHERE c.id = n_row.competencia_id;

  IF NOT (public.is_escritorio() OR comp_cliente = public.meu_cliente_id()) THEN
    RAISE EXCEPTION 'Sem permissão para essa competência';
  END IF;

  DELETE FROM public.notas_fiscais WHERE id = _nota_id;
END;
$$;

REVOKE ALL ON FUNCTION public.segregar_nota(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remover_segregacao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.segregar_nota(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remover_segregacao(uuid) TO authenticated;
