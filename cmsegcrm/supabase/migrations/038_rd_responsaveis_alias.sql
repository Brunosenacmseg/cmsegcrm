-- ─────────────────────────────────────────────────────────────
-- 038_rd_responsaveis_alias.sql
-- Mapeamento "nome do responsável na planilha do RD CRM" -> email do
-- usuário no CRM próprio. Usado durante a sincronização para vincular
-- cards/clientes ao user correto.
-- Quando o nome não bater com nenhum alias, o sync deve cair no
-- fallback (bruno@cmseguros.com.br) e logar pro admin revisar.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.rd_responsaveis_alias (
  id           uuid primary key default uuid_generate_v4(),
  nome_planilha text not null,
  email        text not null,
  ativo        boolean default true,
  criado_em    timestamptz default now()
);
create unique index if not exists rd_resp_alias_nome_idx on public.rd_responsaveis_alias(lower(nome_planilha));

alter table public.rd_responsaveis_alias enable row level security;

drop policy if exists "auth_le_rd_resp_alias" on public.rd_responsaveis_alias;
create policy "auth_le_rd_resp_alias" on public.rd_responsaveis_alias
  for select using (auth.role() = 'authenticated');

drop policy if exists "admin_escreve_rd_resp_alias" on public.rd_responsaveis_alias;
create policy "admin_escreve_rd_resp_alias" on public.rd_responsaveis_alias
  for all using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

-- Seed dos vínculos informados
insert into public.rd_responsaveis_alias (nome_planilha, email) values
  ('Alice Sampaio',                          'alice@cmseguros.com.br'),
  ('Amanda Sgarbi',                          'amanda.sgarbi@cmseguros.com.br'),
  ('Bruno Henrique Rodrigues Bons Olhos',    'bruno.bonsolhos@cmseguros.com.br'),
  ('Bruno Sena',                             'bruno@cmseguros.com.br'),
  ('Cliferson Escapin',                      'cliferson.escapin@cmseguros.com.br'),
  ('Davyson Pimentel Tavares',               'dayvson.tavares@cmseguros.com.br'),
  ('Diego Assis Pereira',                    'diego.assis@cmseguros.com.br'),
  ('Felipe',                                 'felipe.sousa@cmseguros.com.br'),
  ('Gabriel Silvério',                       'gabriel@cmseguros.com.br'),
  ('Gean Araújo',                            'gean.araujo@cmseguros.com.br'),
  ('Giovana Silvério',                       'giovana.silverio@cmseguros.com.br'),
  ('Giovanna Picasso',                       'giovanna@cmseguros.com.br'),
  ('Grégori Schilling',                      'gregori.schilling@cmseguros.com.br'),
  ('Gustavo Araújo',                         'gustavo.araujo@cmseguros.com.br'),
  ('Heloisa',                                'heloisa@cmseguros.com.br'),
  ('Higor',                                  'higor.rosa@cmseguros.com.br'),
  ('Karen Mariano',                          'karen@cmseguros.com.br'),
  ('Larissa Araújo',                         'larissa.araujo@cmseguros.com.br'),
  ('Lilian Cruz',                            'lilian.cruz@cmseguros.com.br'),
  ('Maria Luísa',                            'marialuisa.duraes@cmseguros.com.br'),
  ('Mary',                                   'maryellen.rosa@cmseguros.com.br'),
  ('Natasha Bortolotto',                     'natasha@cmseguros.com.br'),
  ('RAPHAEL VELOSO',                         'raphael.silva@cmseguros.com.br'),
  ('thaina neves',                           'thaina@cmseguros.com.br'),
  ('Will',                                   'william.bonifacio@cmseguros.com.br')
on conflict (lower(nome_planilha)) do update set
  email = excluded.email,
  ativo = true;

-- Helper: resolve um nome de responsável vindo da planilha em um user_id.
-- Estratégia:
--   1) procura no alias por lower(nome_planilha) e busca user pelo email;
--   2) tenta casar pelo nome direto em public.users (case-insensitive);
--   3) cai no fallback bruno@cmseguros.com.br.
create or replace function public.rd_resolver_responsavel(p_nome text)
returns uuid
language plpgsql
stable
as $$
declare
  v_email text;
  v_uid   uuid;
begin
  if p_nome is null or btrim(p_nome) = '' then
    select id into v_uid from public.users where email = 'bruno@cmseguros.com.br' limit 1;
    return v_uid;
  end if;

  -- 1) alias
  select a.email into v_email
    from public.rd_responsaveis_alias a
   where lower(a.nome_planilha) = lower(btrim(p_nome))
     and a.ativo
   limit 1;

  if v_email is not null then
    select id into v_uid from public.users where lower(email) = lower(v_email) limit 1;
    if v_uid is not null then return v_uid; end if;
  end if;

  -- 2) match direto pelo nome do user
  select id into v_uid from public.users where lower(nome) = lower(btrim(p_nome)) limit 1;
  if v_uid is not null then return v_uid; end if;

  -- 3) fallback Bruno
  select id into v_uid from public.users where email = 'bruno@cmseguros.com.br' limit 1;
  return v_uid;
end;
$$;
