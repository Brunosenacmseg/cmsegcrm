-- ─────────────────────────────────────────────────────────────
-- 025_email_templates.sql
-- Múltiplos templates de email para assinatura digital + envios.
-- Substitui o template único em config.autentique_email_template.
-- Mantém compat: se config tem o template legado, copiamos pra cá.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.email_templates (
  id            uuid primary key default uuid_generate_v4(),
  nome          text not null,                       -- "Padrão Apólice", "Renovação", etc
  categoria     text not null default 'assinatura'
                check (categoria in ('assinatura','geral','cobranca','renovacao')),
  assunto       text,
  mensagem      text not null,                       -- corpo, suporta {{cliente}} {{negocio}} {{documento}}
  is_default    boolean default false,               -- usado como pré-selecionado em novos envios
  ativo         boolean default true,
  criado_por    uuid references public.users(id),
  criado_em     timestamptz default now(),
  atualizado_em timestamptz default now()
);

create index if not exists idx_email_templates_cat_ativo on public.email_templates(categoria, ativo);
-- Garante apenas 1 default por categoria
create unique index if not exists email_templates_default_unico
  on public.email_templates(categoria) where is_default;

alter table public.email_templates enable row level security;

drop policy if exists "auth_le_email_templates" on public.email_templates;
create policy "auth_le_email_templates" on public.email_templates for select using (auth.role() = 'authenticated');

drop policy if exists "admin_escreve_email_templates" on public.email_templates;
create policy "admin_escreve_email_templates" on public.email_templates for all using (
  exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

drop trigger if exists email_templates_atualizado on public.email_templates;
create or replace function public.email_templates_set_atualizado()
returns trigger as $$ begin new.atualizado_em = now(); return new; end; $$ language plpgsql;
create trigger email_templates_atualizado
  before update on public.email_templates
  for each row execute procedure public.email_templates_set_atualizado();

-- ─── Seed: template padrão de assinatura ─────────────────────
-- Se já existe registro em config (do 024), migra pra tabela.
do $$
declare
  v_legacy jsonb;
  v_assunto text;
  v_mensagem text;
begin
  if not exists (select 1 from public.email_templates where categoria = 'assinatura') then
    select valor into v_legacy from public.config where chave = 'autentique_email_template';
    v_assunto  := coalesce(v_legacy->>'assunto', 'Documento para assinatura — CM.seg');
    v_mensagem := coalesce(v_legacy->>'mensagem',
'Olá {{cliente}},

Segue o documento "{{documento}}" para sua assinatura digital.

Por favor, leia com atenção e clique no link recebido por e-mail para assinar.

Qualquer dúvida, entre em contato.

CM.seg — Corretora de Seguros');

    insert into public.email_templates (nome, categoria, assunto, mensagem, is_default)
    values ('Padrão — Assinatura', 'assinatura', v_assunto, v_mensagem, true);

    -- Templates exemplo extras pra começar
    insert into public.email_templates (nome, categoria, assunto, mensagem, is_default)
    values
      ('Renovação de Apólice', 'assinatura',
       'Renovação da sua apólice — assine para garantir',
'Olá {{cliente}},

Sua apólice está pronta para renovação. Anexamos o documento "{{documento}}" para sua assinatura digital.

A renovação é necessária para manter a continuidade da cobertura.

Em caso de dúvidas, fale com nossa equipe.

CM.seg', false),
      ('Proposta Nova', 'assinatura',
       'Sua proposta — {{documento}}',
'Olá {{cliente}},

Como combinamos, segue a proposta "{{documento}}" para sua assinatura digital.

Após assinar, confirmaremos a emissão da apólice.

Atenciosamente,
CM.seg', false);
  end if;
end$$;
