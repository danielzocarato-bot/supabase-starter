
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public
AS $$ begin new.updated_at = now(); return new; end; $$;

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pgmq
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pgmq
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pgmq
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pgmq
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN PERFORM pgmq.create(dlq_name); EXCEPTION WHEN OTHERS THEN NULL; END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN PERFORM pgmq.delete(source_queue, message_id); EXCEPTION WHEN undefined_table THEN NULL; END;
  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.atualiza_config_escritorio() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.atualiza_contadores_competencia() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promover_primeiro_escritorio(uuid) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.excluir_competencia_cascade(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dashboard_em_andamento() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dashboard_atencao() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.usuarios_com_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.exportacoes_da_competencia(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.existe_escritorio() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_escritorio() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.meu_cliente_id() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.excluir_competencia_cascade(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_em_andamento() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_atencao() TO authenticated;
GRANT EXECUTE ON FUNCTION public.usuarios_com_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.exportacoes_da_competencia(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.existe_escritorio() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_escritorio() TO authenticated;
GRANT EXECUTE ON FUNCTION public.meu_cliente_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.promover_primeiro_escritorio(uuid) TO authenticated;
