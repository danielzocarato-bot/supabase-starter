create or replace function public.promover_primeiro_escritorio(_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  escritorio_count integer;
  linhas_afetadas integer;
begin
  select count(*) into escritorio_count
  from public.profiles
  where role = 'escritorio';

  if escritorio_count > 0 then
    return false;
  end if;

  update public.profiles
     set role = 'escritorio',
         cliente_id = null
   where id = _user_id;

  get diagnostics linhas_afetadas = row_count;

  return linhas_afetadas = 1;
end;
$$;