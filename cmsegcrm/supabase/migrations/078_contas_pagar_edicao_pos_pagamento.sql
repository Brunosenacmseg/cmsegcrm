-- ═══════════════════════════════════════════════════════════════════════
-- Migration 078: Contas a Pagar — edição pós-pagamento + múltiplos anexos
--
-- Objetivos:
--   1) Permitir que admin edite nome, valor, categoria e demais campos
--      mesmo após a conta ser paga.
--   2) Permitir incluir novos documentos em qualquer status, inclusive 'pago'.
--      Para isso, cria a tabela `contas_pagar_anexos` (relação 1:N), mantendo
--      o `anexo_id` original na própria conta para retrocompatibilidade.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. Atualizar política de UPDATE em contas_pagar ─────────────────
-- Antes: criador podia editar apenas se 'pendente'; admin sempre.
-- Agora: criador edita apenas se 'pendente'; admin edita SEMPRE
-- (inclusive 'pago' / 'recusado'). Comportamento já era o desejado para
-- admin, mas reescrevemos para deixar explícito e consistente.
drop policy if exists "atualiza_contas_pagar" on public.contas_pagar;
create policy "atualiza_contas_pagar" on public.contas_pagar for update using (
  (criado_por = auth.uid() and status = 'pendente')
  or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

-- ─── 2. Tabela de anexos múltiplos ───────────────────────────────────
create table if not exists public.contas_pagar_anexos (
  id            uuid primary key default uuid_generate_v4(),
  conta_id      uuid not null references public.contas_pagar(id) on delete cascade,
  bucket        text not null default 'cmsegcrm',
  path          text not null,
  nome_arquivo  text not null,
  tipo_mime     text,
  tamanho_kb    int,
  user_id       uuid references public.users(id),
  created_at    timestamptz default now()
);

create index if not exists contas_pagar_anexos_conta_idx
  on public.contas_pagar_anexos (conta_id, created_at desc);

alter table public.contas_pagar_anexos enable row level security;

-- SELECT: criador da conta ou admin
drop policy if exists "le_contas_pagar_anexos" on public.contas_pagar_anexos;
create policy "le_contas_pagar_anexos" on public.contas_pagar_anexos for select using (
  exists (
    select 1 from public.contas_pagar c
    where c.id = conta_id
      and (
        c.criado_por = auth.uid()
        or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
      )
  )
);

-- INSERT: criador (em qualquer status — pode anexar comprovante depois)
-- ou admin (sempre).
drop policy if exists "insere_contas_pagar_anexos" on public.contas_pagar_anexos;
create policy "insere_contas_pagar_anexos" on public.contas_pagar_anexos for insert with check (
  exists (
    select 1 from public.contas_pagar c
    where c.id = conta_id
      and (
        c.criado_por = auth.uid()
        or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
      )
  )
);

-- DELETE: admin sempre; criador apenas se a conta ainda estiver pendente
drop policy if exists "deleta_contas_pagar_anexos" on public.contas_pagar_anexos;
create policy "deleta_contas_pagar_anexos" on public.contas_pagar_anexos for delete using (
  exists (
    select 1 from public.contas_pagar c
    where c.id = conta_id
      and (
        exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
        or (c.criado_por = auth.uid() and c.status = 'pendente')
      )
  )
);
