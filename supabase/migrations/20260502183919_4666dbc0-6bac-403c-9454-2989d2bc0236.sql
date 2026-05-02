-- Singleton: 1 linha apenas, identificada por id=1
create table public.configuracoes_escritorio (
  id integer primary key default 1,
  reply_to_email text,
  from_name text default 'Acrux Contabilidade',
  endereco_completo text,
  telefone text,
  updated_at timestamptz default now(),
  updated_by uuid references public.profiles(id),
  constraint singleton check (id = 1)
);

-- Seed inicial
insert into public.configuracoes_escritorio (id, reply_to_email, from_name)
values (1, 'daniel.zocarato@gmail.com', 'Acrux Contabilidade')
on conflict do nothing;

-- RLS — só escritório vê e edita
alter table public.configuracoes_escritorio enable row level security;

create policy "config select escritorio" on public.configuracoes_escritorio for select
  using (public.is_escritorio());

create policy "config update escritorio" on public.configuracoes_escritorio for update
  using (public.is_escritorio()) with check (public.is_escritorio());

-- Trigger pra atualizar updated_at + updated_by automaticamente
create or replace function public.atualiza_config_escritorio() returns trigger 
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_config_escritorio_updated on public.configuracoes_escritorio;
create trigger trg_config_escritorio_updated before update on public.configuracoes_escritorio
  for each row execute function public.atualiza_config_escritorio();