-- Garante que tipo nunca seja nulo (default já é 'nfse_tomada')
update public.competencias set tipo = 'nfse_tomada' where tipo is null;
alter table public.competencias alter column tipo set not null;
alter table public.competencias alter column tipo set default 'nfse_tomada'::tipo_operacao;

-- Troca a unique key (cliente_id, periodo) por (cliente_id, periodo, tipo)
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.competencias'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) ilike '%(cliente_id, periodo)%'
    and pg_get_constraintdef(oid) not ilike '%tipo%';
  if cname is not null then
    execute format('alter table public.competencias drop constraint %I', cname);
  end if;
end $$;

alter table public.competencias
  add constraint competencias_cliente_id_periodo_tipo_key
  unique (cliente_id, periodo, tipo);