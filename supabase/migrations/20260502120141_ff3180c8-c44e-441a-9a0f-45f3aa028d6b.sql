do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'public.notas_fiscais_itens'::regclass
    and contype = 'u'
    and pg_get_constraintdef(oid) ilike '%(nota_id, numero_item)%';
  if cname is null then
    alter table public.notas_fiscais_itens
      add constraint notas_fiscais_itens_nota_id_numero_item_key
      unique (nota_id, numero_item);
  end if;
end $$;