-- ─────────────────────────────────────────────────────────────
-- 027_contas_pagar.sql
-- Modulo Contas a Pagar:
--   - Qualquer usuário pode lançar conta/boleto.
--   - Tipo "conta_pagar": vai pra fila do admin pagar.
--   - Tipo "compra_aprovacao": vai pra fila do admin aprovar.
--   - Anexo PDF opcional (Storage cmsegcrm).
--   - Status: pendente / aprovado / pago / recusado.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.contas_pagar (
  id              uuid primary key default uuid_generate_v4(),
  tipo            text not null default 'conta'
                  check (tipo in ('conta','compra_aprovacao')),
  nome            text not null,
  valor           numeric(12,2) not null check (valor >= 0),
  vencimento      date not null,
  descricao       text,
  anexo_id        uuid references public.anexos(id) on delete set null,
  status          text not null default 'pendente'
                  check (status in ('pendente','aprovado','pago','recusado')),
  fornecedor      text,
  forma_pagto     text,
  data_pagamento  date,
  obs_admin       text,                          -- comentário do admin ao aprovar/pagar/recusar
  categoria_id    uuid references public.financeiro_categorias(id),
  -- vincula com despesa criada após pagar (pra DRE)
  despesa_id      uuid references public.financeiro_despesas(id) on delete set null,
  criado_por      uuid references public.users(id),
  aprovado_por    uuid references public.users(id),
  pago_por        uuid references public.users(id),
  recusado_por    uuid references public.users(id),
  criado_em       timestamptz default now(),
  atualizado_em   timestamptz default now()
);

create index if not exists idx_contas_pagar_status on public.contas_pagar(status);
create index if not exists idx_contas_pagar_tipo   on public.contas_pagar(tipo);
create index if not exists idx_contas_pagar_venc   on public.contas_pagar(vencimento);
create index if not exists idx_contas_pagar_user   on public.contas_pagar(criado_por);

alter table public.contas_pagar enable row level security;

-- Leitura: o próprio criador OU admin
drop policy if exists "le_contas_pagar" on public.contas_pagar;
create policy "le_contas_pagar" on public.contas_pagar for select using (
  criado_por = auth.uid()
  or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

-- Insert: qualquer authenticated, mas precisa setar criado_por = self
drop policy if exists "insere_contas_pagar" on public.contas_pagar;
create policy "insere_contas_pagar" on public.contas_pagar for insert with check (
  auth.role() = 'authenticated' and criado_por = auth.uid()
);

-- Update: criador (enquanto pendente) OU admin (sempre)
drop policy if exists "atualiza_contas_pagar" on public.contas_pagar;
create policy "atualiza_contas_pagar" on public.contas_pagar for update using (
  (criado_por = auth.uid() and status = 'pendente')
  or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

-- Delete: criador (se pendente) ou admin
drop policy if exists "deleta_contas_pagar" on public.contas_pagar;
create policy "deleta_contas_pagar" on public.contas_pagar for delete using (
  (criado_por = auth.uid() and status = 'pendente')
  or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

create or replace function public.contas_pagar_set_atualizado()
returns trigger as $$ begin new.atualizado_em = now(); return new; end; $$ language plpgsql;
drop trigger if exists contas_pagar_atualizado on public.contas_pagar;
create trigger contas_pagar_atualizado before update on public.contas_pagar
  for each row execute procedure public.contas_pagar_set_atualizado();
