-- Adiciona telefone_negocio em negocios (segue o mesmo padrão de email_negocio
-- adicionado em 029): telefone vinculado diretamente ao card de negociação,
-- separado do telefone do cliente.
alter table public.negocios
  add column if not exists telefone_negocio text;
