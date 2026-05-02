-- Enum de tipos de operação
create type tipo_operacao as enum ('nfse_tomada', 'nfe_entrada', 'nfe_saida');

-- Cliente declara quais tipos de operação atende e qual layout de exportação
create table public.cliente_operacoes (
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  tipo tipo_operacao not null,
  layout_export text not null,
  ativo boolean default true,
  created_at timestamptz default now(),
  primary key (cliente_id, tipo)
);

-- Migra estado atual: todos os clientes existentes são NFSe Tomada com Leiaute 18
insert into public.cliente_operacoes (cliente_id, tipo, layout_export)
  select id, 'nfse_tomada', 'dominio_leiaute_18' from public.clientes
  on conflict do nothing;

-- Competência sabe qual tipo
alter table public.competencias add column tipo tipo_operacao default 'nfse_tomada';

-- Notas ganham campos NFe (NFSe ignora)
alter table public.notas_fiscais add column tipo_documento text default 'nfse';
alter table public.notas_fiscais add column chave_nfe text;
alter table public.notas_fiscais add column tipo_operacao_nfe text;

create index idx_notas_chave on public.notas_fiscais(chave_nfe) where chave_nfe is not null;

-- Itens (granularidade por item — só usado em NFe)
create table public.notas_fiscais_itens (
  id uuid primary key default gen_random_uuid(),
  nota_id uuid not null references public.notas_fiscais(id) on delete cascade,
  numero_item integer not null,
  codigo_produto text,
  descricao_produto text,
  ncm text,
  cfop text,
  valor numeric(15,2) default 0,
  acumulador_id uuid references public.acumuladores(id) on delete restrict,
  classificado_em timestamptz,
  classificado_por uuid references public.profiles(id),
  raw_data jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (nota_id, numero_item)
);

create index idx_notas_itens_nota on public.notas_fiscais_itens(nota_id);
create index idx_notas_itens_acumulador on public.notas_fiscais_itens(acumulador_id);

-- RLS cliente_operacoes
alter table public.cliente_operacoes enable row level security;

create policy "co select" on public.cliente_operacoes for select
  using (public.is_escritorio() or cliente_id = public.meu_cliente_id());

create policy "co mut escritorio" on public.cliente_operacoes for all
  using (public.is_escritorio()) with check (public.is_escritorio());

-- RLS notas_fiscais_itens
alter table public.notas_fiscais_itens enable row level security;

create policy "nfi select" on public.notas_fiscais_itens for select
  using (public.is_escritorio() or nota_id in (
    select n.id from public.notas_fiscais n
    join public.competencias c on c.id = n.competencia_id
    where c.cliente_id = public.meu_cliente_id()
  ));

create policy "nfi update cliente" on public.notas_fiscais_itens for update
  using (nota_id in (
    select n.id from public.notas_fiscais n
    join public.competencias c on c.id = n.competencia_id
    where c.cliente_id = public.meu_cliente_id()
  ))
  with check (nota_id in (
    select n.id from public.notas_fiscais n
    join public.competencias c on c.id = n.competencia_id
    where c.cliente_id = public.meu_cliente_id()
  ));

create policy "nfi mut escritorio" on public.notas_fiscais_itens for all
  using (public.is_escritorio()) with check (public.is_escritorio());

-- Trigger contadores: agora considera tipo da competência
create or replace function public.atualiza_contadores_competencia() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  comp_id uuid;
  comp_tipo tipo_operacao;
begin
  if TG_TABLE_NAME = 'notas_fiscais' then
    comp_id := coalesce(new.competencia_id, old.competencia_id);
  elsif TG_TABLE_NAME = 'notas_fiscais_itens' then
    select n.competencia_id into comp_id
    from public.notas_fiscais n
    where n.id = coalesce(new.nota_id, old.nota_id);
  end if;

  if comp_id is null then return coalesce(new, old); end if;

  select tipo into comp_tipo from public.competencias where id = comp_id;

  if comp_tipo = 'nfse_tomada' or comp_tipo is null then
    update public.competencias set
      total_notas = (
        select count(*) from public.notas_fiscais
        where competencia_id = comp_id and coalesce(cancelada, false) = false
      ),
      notas_classificadas = (
        select count(*) from public.notas_fiscais
        where competencia_id = comp_id and coalesce(cancelada, false) = false
        and acumulador_id is not null
      )
    where id = comp_id;
  else
    update public.competencias set
      total_notas = (
        select count(*) from public.notas_fiscais_itens i
        join public.notas_fiscais n on n.id = i.nota_id
        where n.competencia_id = comp_id and coalesce(n.cancelada, false) = false
      ),
      notas_classificadas = (
        select count(*) from public.notas_fiscais_itens i
        join public.notas_fiscais n on n.id = i.nota_id
        where n.competencia_id = comp_id and coalesce(n.cancelada, false) = false
        and i.acumulador_id is not null
      )
    where id = comp_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_contadores_nfi on public.notas_fiscais_itens;
create trigger trg_contadores_nfi after insert or update or delete on public.notas_fiscais_itens
  for each row execute function public.atualiza_contadores_competencia();