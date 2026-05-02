alter table public.configuracoes_escritorio
  add column if not exists sieg_api_key text;

comment on column public.configuracoes_escritorio.sieg_api_key is
  'API key da conta SIEG do escritório. Usada pra buscar XMLs do Cofre SIEG via API.';