alter table public.configuracoes_escritorio
  drop column if exists sieg_email,
  drop column if exists sieg_password;

create index if not exists idx_profiles_cliente_id
  on public.profiles(cliente_id)
  where cliente_id is not null;

create index if not exists idx_competencias_tipo
  on public.competencias(tipo);

create index if not exists idx_notas_tipo_operacao
  on public.notas_fiscais(tipo_operacao_nfe)
  where tipo_operacao_nfe is not null;