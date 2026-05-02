-- ─────────────────────────────────────────────────────────────
-- 046_tokio_marine.sql
-- Integração Tokio Marine via upload de arquivos XML.
-- Importa: Propostas/Apólices, Parcelas a Pagar, Extrato de
-- Comissões Pagas e Endossos.
-- ─────────────────────────────────────────────────────────────

-- Histórico de execuções de importação (espelha importacoes_porto)
create table if not exists public.importacoes_tokio (
  id              uuid primary key default uuid_generate_v4(),
  tipo_arquivo    text,                 -- APOLICES | PARCELAS | COMISSOES | ENDOSSOS
  nome_arquivo    text,
  data_geracao    text,
  qtd_registros   int,
  qtd_importados  int default 0,
  qtd_erros       int default 0,
  erros           jsonb,
  status          text default 'processando',
  criado_em       timestamptz default now(),
  concluido_em    timestamptz
);

alter table public.importacoes_tokio enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='importacoes_tokio' and policyname='autenticados leem importacoes_tokio') then
    create policy "autenticados leem importacoes_tokio" on public.importacoes_tokio for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='importacoes_tokio' and policyname='autenticados escrevem importacoes_tokio') then
    create policy "autenticados escrevem importacoes_tokio" on public.importacoes_tokio for all using (auth.role() = 'authenticated');
  end if;
end $$;

-- Endossos (não existia antes — usado também por outras seguradoras)
create table if not exists public.endossos (
  id                uuid primary key default uuid_generate_v4(),
  apolice_id        uuid references public.apolices(id) on delete cascade,
  cliente_id        uuid references public.clientes(id) on delete set null,
  numero_endosso    text not null,
  numero_apolice    text,
  tipo              text,                       -- alteração / cancelamento / cobrança / inclusão
  motivo            text,
  data_emissao      date,
  vigencia_ini      date,
  vigencia_fim      date,
  valor_premio      numeric(12,2),
  valor_iof         numeric(12,2),
  valor_diferenca   numeric(12,2),
  seguradora        text default 'Tokio Marine',
  fonte             text default 'Tokio Marine',
  dados_brutos      jsonb,
  criado_em         timestamptz default now()
);

create unique index if not exists ux_endossos_seg_num on public.endossos(seguradora, numero_endosso);
create index if not exists idx_endossos_apolice on public.endossos(apolice_id);
create index if not exists idx_endossos_cliente on public.endossos(cliente_id);

alter table public.endossos enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='endossos' and policyname='autenticados leem endossos') then
    create policy "autenticados leem endossos" on public.endossos for select using (auth.role() = 'authenticated');
  end if;
  if not exists (select 1 from pg_policies where tablename='endossos' and policyname='autenticados escrevem endossos') then
    create policy "autenticados escrevem endossos" on public.endossos for all using (auth.role() = 'authenticated');
  end if;
end $$;

-- Adiciona campos auxiliares em apólices (caso ainda não existam)
alter table public.apolices
  add column if not exists nome_segurado     text,
  add column if not exists cpf_cnpj_segurado text,
  add column if not exists dados_tokio       jsonb;
