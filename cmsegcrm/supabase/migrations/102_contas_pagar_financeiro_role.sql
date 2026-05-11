-- ═══════════════════════════════════════════════════════════════════════
-- Migration 102: Contas a Pagar — liberar role 'financeiro'
--
-- Objetivo:
--   Permitir que usuários com role = 'financeiro' tenham as mesmas
--   permissões de admin no módulo Contas a Pagar (ler, editar, mudar
--   status, deletar). Acesso ao DRE permanece inalterado.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── contas_pagar ────────────────────────────────────────────────────
drop policy if exists "le_contas_pagar" on public.contas_pagar;
create policy "le_contas_pagar" on public.contas_pagar for select using (
  criado_por = auth.uid()
  or exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role in ('admin','financeiro')
  )
);

drop policy if exists "atualiza_contas_pagar" on public.contas_pagar;
create policy "atualiza_contas_pagar" on public.contas_pagar for update using (
  (criado_por = auth.uid() and status = 'pendente')
  or exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role in ('admin','financeiro')
  )
);

drop policy if exists "deleta_contas_pagar" on public.contas_pagar;
create policy "deleta_contas_pagar" on public.contas_pagar for delete using (
  (criado_por = auth.uid() and status = 'pendente')
  or exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role in ('admin','financeiro')
  )
);

-- ─── contas_pagar_anexos ─────────────────────────────────────────────
drop policy if exists "le_contas_pagar_anexos" on public.contas_pagar_anexos;
create policy "le_contas_pagar_anexos" on public.contas_pagar_anexos for select using (
  exists (
    select 1 from public.contas_pagar c
    where c.id = conta_id
      and (
        c.criado_por = auth.uid()
        or exists (
          select 1 from public.users u
          where u.id = auth.uid() and u.role in ('admin','financeiro')
        )
      )
  )
);

drop policy if exists "insere_contas_pagar_anexos" on public.contas_pagar_anexos;
create policy "insere_contas_pagar_anexos" on public.contas_pagar_anexos for insert with check (
  exists (
    select 1 from public.contas_pagar c
    where c.id = conta_id
      and (
        c.criado_por = auth.uid()
        or exists (
          select 1 from public.users u
          where u.id = auth.uid() and u.role in ('admin','financeiro')
        )
      )
  )
);

drop policy if exists "deleta_contas_pagar_anexos" on public.contas_pagar_anexos;
create policy "deleta_contas_pagar_anexos" on public.contas_pagar_anexos for delete using (
  exists (
    select 1 from public.contas_pagar c
    where c.id = conta_id
      and (
        exists (
          select 1 from public.users u
          where u.id = auth.uid() and u.role in ('admin','financeiro')
        )
        or (c.criado_por = auth.uid() and c.status = 'pendente')
      )
  )
);
