-- ─────────────────────────────────────────────────────────────
-- 024_card_negocio_completo.sql
-- A) Notas só admin edita/exclui (qualquer um cria).
-- B) Tabela `config` para templates configuráveis (assinatura email).
-- C) anexos.cliente_id e anexos.categoria já existem; UI usará.
-- ─────────────────────────────────────────────────────────────

-- A) Notas: apenas admin pode editar e excluir (idempotente)
drop policy if exists "auth_atualiza_propria_nota" on public.negocio_notas;
drop policy if exists "auth_deleta_propria_nota"    on public.negocio_notas;
drop policy if exists "admin_atualiza_nota"         on public.negocio_notas;
drop policy if exists "admin_deleta_nota"           on public.negocio_notas;

create policy "admin_atualiza_nota" on public.negocio_notas for update using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
create policy "admin_deleta_nota" on public.negocio_notas for delete using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

-- B) Tabela de configurações (key-value) — admin gerencia, todos leem
create table if not exists public.config (
  chave         text primary key,
  valor         jsonb not null,
  atualizado_em timestamptz default now()
);
alter table public.config enable row level security;

drop policy if exists "auth_le_config" on public.config;
create policy "auth_le_config" on public.config for select using (auth.role() = 'authenticated');
drop policy if exists "admin_escreve_config" on public.config;
create policy "admin_escreve_config" on public.config for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

-- Template padrão de email para envio do Autentique
insert into public.config (chave, valor) values
('autentique_email_template', jsonb_build_object(
  'assunto', 'Documento para assinatura — CM.seg',
  'mensagem',
'Olá {{cliente}},

Segue o documento "{{documento}}" para sua assinatura digital.

Por favor, leia com atenção e clique no link recebido por e-mail para assinar.

Qualquer dúvida, entre em contato.

CM.seg — Corretora de Seguros'
))
on conflict (chave) do nothing;

-- C) Garante que anexos tem todas as colunas que precisamos
-- (categoria, negocio_id, cliente_id já existem desde 002)
-- Apenas adiciona índice para listar rápido por negocio:
create index if not exists idx_anexos_negocio on public.anexos(negocio_id) where negocio_id is not null;
