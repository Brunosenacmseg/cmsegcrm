-- ═══════════════════════════════════════════════════════════════════
-- 089 — Mapeamento de campos RD Station → CMSEGCRM
-- Singleton (id=1, entidade='negocios') que guarda a configuração de
-- mapeamento manual entre campos do RD (padrão + custom_fields) e
-- colunas locais da tabela negocios. Aplicado tanto no sync admin
-- quanto no webhook em tempo real, sobrescrevendo o mapeamento default.
--
-- Formato do jsonb `mapeamento`:
--   [
--     { "rd_path": "amount_total",                    "local_col": "premio" },
--     { "rd_path": "deal_custom_fields[Placa].value", "local_col": "placa" }
--   ]
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.rdstation_mapeamento_campos (
  id              int primary key default 1,
  entidade        text not null,
  mapeamento      jsonb not null default '[]'::jsonb,
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid references public.users(id),
  constraint rdstation_mapeamento_singleton check (id = 1)
);

alter table public.rdstation_mapeamento_campos enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='rdstation_mapeamento_campos' and policyname='admin_le_rdmapping') then
    create policy "admin_le_rdmapping" on public.rdstation_mapeamento_campos for select using (
      exists (select 1 from public.users where id = auth.uid() and role = 'admin')
    );
  end if;
  if not exists (select 1 from pg_policies where tablename='rdstation_mapeamento_campos' and policyname='admin_escreve_rdmapping') then
    create policy "admin_escreve_rdmapping" on public.rdstation_mapeamento_campos for all using (
      exists (select 1 from public.users where id = auth.uid() and role = 'admin')
    );
  end if;
end $$;

insert into public.rdstation_mapeamento_campos (id, entidade)
values (1, 'negocios')
on conflict (id) do nothing;
