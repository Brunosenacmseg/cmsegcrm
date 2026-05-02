-- ═════════════════════════════════════════════════════════════════════
-- 032_funis_visibilidade_equipes.sql
--
-- Aplica a regra de visibilidade dos funis por equipe.
-- Tabela base: public.funis_equipes (criada na migration 009).
--   - Sem linhas pra um funil  → visível a todos (regra original).
--   - Com linhas               → só admin + membros das equipes listadas.
--
-- Mapeamento (conforme decisão de produto):
--   VENDA                            → Vendas Jundiaí, ADM
--   META + MULTICANAL                → SEP, Líder Jundiaí
--   FUNIL RECICLADO - VIDA           → Administradores
--   SAUDE                            → Administradores
--   RENOVAÇÕES                       → Vendas Jundiaí, ADM
--   ENDOSSO B2B                      → todos (sem linhas)
--   CONSÓRCIO                        → todos (sem linhas)
--   CONTA PORTO BANK                 → Administradores
--   CARTÃO PORTO                     → Administradores
--   FINANCIAMENTO E REFINANCIAMENTO  → todos (sem linhas)
--   FUNIL COBRANÇA                   → Cobrança
--   FUNIL RASTREADOR                 → ADM
--   ASSISTÊNCIA 24HRS                → ADM
--   SINISTRO                         → Sinistro
--
-- Idempotente: pode rodar mais de uma vez.
-- ═════════════════════════════════════════════════════════════════════

-- 1) Garante que as equipes existam (sem mexer em equipes já cadastradas).
insert into public.equipes (nome)
select x.nome
from (values
  ('Vendas Jundiaí'),
  ('ADM'),
  ('SEP'),
  ('Líder Jundiaí'),
  ('Cobrança'),
  ('Sinistro'),
  ('Administradores')
) as x(nome)
where not exists (
  select 1 from public.equipes e where lower(e.nome) = lower(x.nome)
);

-- 2) Helper local: aplica o mapeamento (funil_nome, equipe_nomes[]).
--    Limpa as linhas atuais do funil e reinsere as corretas.
do $$
declare
  v_map jsonb := $json$
  [
    {"funil":"VENDA",                            "equipes":["Vendas Jundiaí","ADM"]},
    {"funil":"META + MULTICANAL",                "equipes":["SEP","Líder Jundiaí"]},
    {"funil":"FUNIL RECICLADO - VIDA",           "equipes":["Administradores"]},
    {"funil":"SAUDE",                            "equipes":["Administradores"]},
    {"funil":"RENOVAÇÕES",                       "equipes":["Vendas Jundiaí","ADM"]},
    {"funil":"CONTA PORTO BANK",                 "equipes":["Administradores"]},
    {"funil":"CARTÃO PORTO",                     "equipes":["Administradores"]},
    {"funil":"FUNIL COBRANÇA",                   "equipes":["Cobrança"]},
    {"funil":"FUNIL RASTREADOR",                 "equipes":["ADM"]},
    {"funil":"ASSISTÊNCIA 24HRS",                "equipes":["ADM"]},
    {"funil":"SINISTRO",                         "equipes":["Sinistro"]}
  ]
  $json$::jsonb;
  v_item     jsonb;
  v_funil_id uuid;
  v_eq_nome  text;
  v_eq_id    uuid;
begin
  for v_item in select * from jsonb_array_elements(v_map)
  loop
    select id into v_funil_id
    from public.funis
    where lower(nome) = lower(v_item->>'funil')
    limit 1;

    if v_funil_id is null then
      raise notice 'Funil nao encontrado: %', v_item->>'funil';
      continue;
    end if;

    -- Reseta vínculos atuais e reaplica
    delete from public.funis_equipes where funil_id = v_funil_id;

    for v_eq_nome in
      select jsonb_array_elements_text(v_item->'equipes')
    loop
      select id into v_eq_id
      from public.equipes
      where lower(nome) = lower(v_eq_nome)
      limit 1;

      if v_eq_id is null then
        raise notice 'Equipe nao encontrada: %', v_eq_nome;
        continue;
      end if;

      insert into public.funis_equipes (funil_id, equipe_id)
      values (v_funil_id, v_eq_id)
      on conflict (funil_id, equipe_id) do nothing;
    end loop;
  end loop;
end$$;

-- 3) Funis que devem ficar "todos têm acesso" (ENDOSSO B2B, CONSÓRCIO,
--    FINANCIAMENTO E REFINANCIAMENTO): garantem zero linhas em funis_equipes.
delete from public.funis_equipes
where funil_id in (
  select id from public.funis
  where lower(nome) in (
    'endosso b2b',
    'consórcio',
    'financiamento e refinanciamento'
  )
);

-- Conferência (rode após aplicar):
-- select f.nome, coalesce(string_agg(e.nome, ', '), '— TODOS —') as equipes
-- from public.funis f
-- left join public.funis_equipes fe on fe.funil_id = f.id
-- left join public.equipes e on e.id = fe.equipe_id
-- group by f.nome
-- order by f.ordem;
