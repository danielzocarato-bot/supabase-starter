create or replace function public.usuarios_com_status()
returns table (
  id uuid,
  email text,
  nome text,
  role user_role,
  cliente_id uuid,
  cliente_razao text,
  created_at timestamptz,
  email_confirmed_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select 
    p.id, p.email, p.nome, p.role, p.cliente_id,
    c.razao_social as cliente_razao,
    p.created_at,
    u.email_confirmed_at
  from public.profiles p
  left join public.clientes c on c.id = p.cliente_id
  left join auth.users u on u.id = p.id
  where (select role from public.profiles where id = auth.uid()) = 'escritorio'
  order by p.created_at desc;
$$;

grant execute on function public.usuarios_com_status() to authenticated;