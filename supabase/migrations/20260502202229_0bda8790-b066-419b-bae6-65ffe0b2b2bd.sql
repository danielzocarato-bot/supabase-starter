alter table public.configuracoes_escritorio
  add column if not exists sieg_email text,
  add column if not exists sieg_password text;

comment on column public.configuracoes_escritorio.sieg_email is
  'Email do usuário SIEG vinculado à API key usada para buscar XMLs.';

comment on column public.configuracoes_escritorio.sieg_password is
  'Senha do usuário SIEG vinculado à API key usada para autenticação nas buscas de XMLs.';