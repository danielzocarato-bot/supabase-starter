create table public.exportacoes (
  id uuid primary key default gen_random_uuid(),
  competencia_id uuid not null references public.competencias(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  gerado_por uuid references public.profiles(id),
  gerado_por_email text,
  gerado_por_nome text,
  gerado_em timestamptz default now(),
  arquivo_nome text not null,
  formato text not null,
  total_notas integer,
  total_itens integer,
  bytes_size integer,
  hash_sha256 text,
  created_at timestamptz default now()
);

create index idx_exportacoes_competencia on public.exportacoes(competencia_id, gerado_em desc);
create index idx_exportacoes_cliente on public.exportacoes(cliente_id, gerado_em desc);

alter table public.exportacoes enable row level security;

create policy "exp select" on public.exportacoes for select
  using (public.is_escritorio() or competencia_id in (
    select id from public.competencias where cliente_id = public.meu_cliente_id()
  ));

create policy "exp insert servico" on public.exportacoes for insert
  with check (true);

create or replace function public.exportacoes_da_competencia(_competencia_id uuid)
returns table (
  id uuid,
  gerado_em timestamptz,
  gerado_por_email text,
  gerado_por_nome text,
  arquivo_nome text,
  formato text,
  total_notas integer,
  total_itens integer,
  bytes_size integer,
  hash_sha256 text
)
language sql
security definer
set search_path = public
as $$
  select e.id, e.gerado_em, e.gerado_por_email, e.gerado_por_nome,
         e.arquivo_nome, e.formato, e.total_notas, e.total_itens,
         e.bytes_size, e.hash_sha256
  from public.exportacoes e
  where e.competencia_id = _competencia_id
    and (
      public.is_escritorio()
      or e.competencia_id in (
        select id from public.competencias where cliente_id = public.meu_cliente_id()
      )
    )
  order by e.gerado_em desc;
$$;

grant execute on function public.exportacoes_da_competencia(uuid) to authenticated;