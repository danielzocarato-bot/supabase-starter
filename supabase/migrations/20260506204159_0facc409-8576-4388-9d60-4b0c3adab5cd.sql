create or replace function public.excluir_competencia_cascade(_competencia_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_escritorio() then
    raise exception 'Apenas escritório pode excluir competências';
  end if;

  delete from public.notas_fiscais_itens
   where nota_id in (select id from public.notas_fiscais where competencia_id = _competencia_id);

  delete from public.notas_fiscais where competencia_id = _competencia_id;

  delete from public.exportacoes where competencia_id = _competencia_id;

  delete from public.competencias where id = _competencia_id;
end;
$$;

grant execute on function public.excluir_competencia_cascade(uuid) to authenticated;

drop policy if exists "exp insert servico" on public.exportacoes;

create policy "exp insert escritorio" on public.exportacoes
  for insert
  with check (public.is_escritorio());
