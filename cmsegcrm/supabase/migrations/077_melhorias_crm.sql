-- ═══════════════════════════════════════════════════════════════════════
-- Migration 077: Módulo "Melhorias CRM"
-- Sugestões de melhorias do sistema. Cards com anexos, resposta do
-- administrador e status (aberta/concluida/nao_pode_ser_feita/depois).
-- Privacidade: cada sugestão só é visível para o autor e para os admins.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.melhorias_crm (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.users(id) on delete cascade,
  titulo          text not null,
  descricao       text,
  status          text not null default 'aberta'
                  check (status in ('aberta','concluida','nao_pode_ser_feita','sera_feita_depois')),
  resposta        text,
  respondido_por  uuid references public.users(id),
  respondido_em   timestamptz,
  criado_em       timestamptz default now(),
  atualizado_em   timestamptz default now()
);

create index if not exists melhorias_crm_user_idx     on public.melhorias_crm (user_id, criado_em desc);
create index if not exists melhorias_crm_status_idx   on public.melhorias_crm (status, criado_em desc);

-- Anexos próprios do módulo: ficam num bucket isolado (cmsegcrm) sob a
-- pasta `melhorias/<melhoria_id>/`. Tabela separada da `anexos` para evitar
-- mistura com negócio/cliente/apólice e simplificar a RLS.
create table if not exists public.melhorias_crm_anexos (
  id            uuid primary key default uuid_generate_v4(),
  melhoria_id   uuid not null references public.melhorias_crm(id) on delete cascade,
  bucket        text not null default 'cmsegcrm',
  path          text not null,
  nome_arquivo  text not null,
  tipo_mime     text,
  tamanho_kb    int,
  user_id       uuid references public.users(id),
  created_at    timestamptz default now()
);
create index if not exists melhorias_crm_anexos_melhoria_idx on public.melhorias_crm_anexos (melhoria_id);

-- Trigger para manter atualizado_em
create or replace function public.tg_melhorias_crm_set_updated()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists trg_melhorias_crm_set_updated on public.melhorias_crm;
create trigger trg_melhorias_crm_set_updated
  before update on public.melhorias_crm
  for each row execute function public.tg_melhorias_crm_set_updated();

-- ─── RLS ─────────────────────────────────────────────────────────────
alter table public.melhorias_crm        enable row level security;
alter table public.melhorias_crm_anexos enable row level security;

do $$ begin
  -- SELECT: autor da sugestão ou admin
  if not exists (select 1 from pg_policies where tablename='melhorias_crm' and policyname='melhorias_select_dono_ou_admin') then
    create policy "melhorias_select_dono_ou_admin" on public.melhorias_crm for select using (
      auth.uid() = user_id
      or public.current_user_role() in ('admin','financeiro')
    );
  end if;

  -- INSERT: qualquer usuário autenticado pode criar sua própria sugestão
  if not exists (select 1 from pg_policies where tablename='melhorias_crm' and policyname='melhorias_insert_proprio') then
    create policy "melhorias_insert_proprio" on public.melhorias_crm for insert
      with check (auth.uid() = user_id);
  end if;

  -- UPDATE: o autor pode editar enquanto estiver aberta; admin pode tudo
  if not exists (select 1 from pg_policies where tablename='melhorias_crm' and policyname='melhorias_update_dono_ou_admin') then
    create policy "melhorias_update_dono_ou_admin" on public.melhorias_crm for update using (
      (auth.uid() = user_id and status = 'aberta')
      or public.current_user_role() in ('admin','financeiro')
    );
  end if;

  -- DELETE: autor (qualquer status) ou admin
  if not exists (select 1 from pg_policies where tablename='melhorias_crm' and policyname='melhorias_delete_dono_ou_admin') then
    create policy "melhorias_delete_dono_ou_admin" on public.melhorias_crm for delete using (
      auth.uid() = user_id
      or public.current_user_role() in ('admin','financeiro')
    );
  end if;

  -- Anexos: visível para autor da melhoria ou admin
  if not exists (select 1 from pg_policies where tablename='melhorias_crm_anexos' and policyname='melhorias_anexos_select') then
    create policy "melhorias_anexos_select" on public.melhorias_crm_anexos for select using (
      exists (
        select 1 from public.melhorias_crm m
        where m.id = melhoria_id
          and (m.user_id = auth.uid() or public.current_user_role() in ('admin','financeiro'))
      )
    );
  end if;

  if not exists (select 1 from pg_policies where tablename='melhorias_crm_anexos' and policyname='melhorias_anexos_insert') then
    create policy "melhorias_anexos_insert" on public.melhorias_crm_anexos for insert
      with check (
        exists (
          select 1 from public.melhorias_crm m
          where m.id = melhoria_id
            and (m.user_id = auth.uid() or public.current_user_role() in ('admin','financeiro'))
        )
      );
  end if;

  if not exists (select 1 from pg_policies where tablename='melhorias_crm_anexos' and policyname='melhorias_anexos_delete') then
    create policy "melhorias_anexos_delete" on public.melhorias_crm_anexos for delete using (
      exists (
        select 1 from public.melhorias_crm m
        where m.id = melhoria_id
          and (m.user_id = auth.uid() or public.current_user_role() in ('admin','financeiro'))
      )
    );
  end if;
end $$;
