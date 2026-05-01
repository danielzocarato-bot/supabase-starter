
-- Enums
create type public.user_role as enum ('escritorio', 'cliente');
create type public.competencia_status as enum ('aberta', 'concluida', 'exportada');

-- Clientes
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  codigo_empresa_dominio integer not null unique,
  cnpj text not null unique,
  razao_social text not null,
  endereco text,
  uf text,
  municipio text,
  municipio_ibge text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nome text,
  role public.user_role not null default 'cliente',
  cliente_id uuid references public.clientes(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Acumuladores
create table public.acumuladores (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  codigo integer not null,
  descricao text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (cliente_id, codigo)
);

-- Competencias
create table public.competencias (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  periodo text not null,
  status public.competencia_status not null default 'aberta',
  arquivo_origem text,
  total_notas integer not null default 0,
  notas_classificadas integer not null default 0,
  created_at timestamptz not null default now(),
  concluida_em timestamptz,
  exportada_em timestamptz,
  unique (cliente_id, periodo)
);

-- Notas Fiscais
create table public.notas_fiscais (
  id uuid primary key default gen_random_uuid(),
  competencia_id uuid not null references public.competencias(id) on delete cascade,
  id_externo text not null,
  numero_nfe text,
  emissao_nfe date,
  data_competencia date,
  prestador_cnpj text,
  prestador_razao text,
  prestador_uf text,
  prestador_municipio text,
  prestador_municipio_ibge text,
  prestador_endereco text,
  cnae_descricao text,
  servico_municipal text,
  valor_nfe numeric(15,2),
  desconto numeric(15,2) not null default 0,
  valor_contabil numeric(15,2),
  observacao text,
  cancelada boolean not null default false,
  raw_data jsonb,
  acumulador_id uuid references public.acumuladores(id) on delete restrict,
  classificado_em timestamptz,
  classificado_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competencia_id, id_externo)
);

create index idx_notas_competencia on public.notas_fiscais(competencia_id);
create index idx_notas_acumulador on public.notas_fiscais(acumulador_id);

-- Funções helper
create or replace function public.is_escritorio()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'escritorio')
$$;

create or replace function public.meu_cliente_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select cliente_id from public.profiles where id = auth.uid()
$$;

-- Trigger novo usuário
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'cliente')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger contadores
create or replace function public.atualiza_contadores_competencia()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_comp uuid;
begin
  v_comp := coalesce(new.competencia_id, old.competencia_id);
  update public.competencias
  set total_notas = (select count(*) from public.notas_fiscais where competencia_id = v_comp),
      notas_classificadas = (select count(*) from public.notas_fiscais where competencia_id = v_comp and (acumulador_id is not null or cancelada = true))
  where id = v_comp;
  return null;
end;
$$;

create trigger trg_contadores_competencia
  after insert or update or delete on public.notas_fiscais
  for each row execute function public.atualiza_contadores_competencia();

-- Trigger updated_at notas
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger trg_notas_updated_at
  before update on public.notas_fiscais
  for each row execute function public.set_updated_at();

-- RLS
alter table public.profiles enable row level security;
alter table public.clientes enable row level security;
alter table public.acumuladores enable row level security;
alter table public.competencias enable row level security;
alter table public.notas_fiscais enable row level security;

-- profiles
create policy "profiles_select" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_escritorio());
create policy "profiles_update_self" on public.profiles for update to authenticated
  using (id = auth.uid());
create policy "profiles_escritorio_all" on public.profiles for all to authenticated
  using (public.is_escritorio()) with check (public.is_escritorio());

-- clientes
create policy "clientes_select" on public.clientes for select to authenticated
  using (public.is_escritorio() or id = public.meu_cliente_id());
create policy "clientes_escritorio_all" on public.clientes for all to authenticated
  using (public.is_escritorio()) with check (public.is_escritorio());

-- acumuladores
create policy "acumuladores_select" on public.acumuladores for select to authenticated
  using (public.is_escritorio() or (cliente_id = public.meu_cliente_id() and ativo = true));
create policy "acumuladores_escritorio_all" on public.acumuladores for all to authenticated
  using (public.is_escritorio()) with check (public.is_escritorio());

-- competencias
create policy "competencias_select" on public.competencias for select to authenticated
  using (public.is_escritorio() or cliente_id = public.meu_cliente_id());
create policy "competencias_escritorio_all" on public.competencias for all to authenticated
  using (public.is_escritorio()) with check (public.is_escritorio());

-- notas_fiscais
create policy "notas_select" on public.notas_fiscais for select to authenticated
  using (
    public.is_escritorio()
    or competencia_id in (select id from public.competencias where cliente_id = public.meu_cliente_id())
  );
create policy "notas_update_cliente" on public.notas_fiscais for update to authenticated
  using (competencia_id in (select id from public.competencias where cliente_id = public.meu_cliente_id()))
  with check (competencia_id in (select id from public.competencias where cliente_id = public.meu_cliente_id()));
create policy "notas_escritorio_all" on public.notas_fiscais for all to authenticated
  using (public.is_escritorio()) with check (public.is_escritorio());

-- Storage bucket
insert into storage.buckets (id, name, public) values ('planilhas', 'planilhas', false);

create policy "planilhas_escritorio_select" on storage.objects for select to authenticated
  using (bucket_id = 'planilhas' and public.is_escritorio());
create policy "planilhas_escritorio_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'planilhas' and public.is_escritorio());
create policy "planilhas_escritorio_update" on storage.objects for update to authenticated
  using (bucket_id = 'planilhas' and public.is_escritorio());
create policy "planilhas_escritorio_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'planilhas' and public.is_escritorio());

-- RPC para promover primeiro escritório (apenas se nenhum existir)
create or replace function public.promover_primeiro_escritorio(_user_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare existe boolean;
begin
  select exists(select 1 from public.profiles where role = 'escritorio') into existe;
  if existe then return false; end if;
  update public.profiles set role = 'escritorio', cliente_id = null where id = _user_id;
  return true;
end;
$$;

create or replace function public.existe_escritorio()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where role = 'escritorio') $$;
