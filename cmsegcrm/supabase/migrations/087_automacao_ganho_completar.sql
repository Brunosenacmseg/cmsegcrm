-- ─────────────────────────────────────────────────────────────
-- 087_automacao_ganho_completar.sql
-- Completa a automação "Pós-venda — emissão automática ao Ganho":
--
--   • Adiciona negocios.proposta_id (FK propostas) — permite que o card de
--     Emissão & Implantação herde a proposta vinculada à venda original.
--   • Atualiza a automação default para também copiar:
--       - vendedor       (mantém o vendedor original em vez de sobrescrever)
--       - comissao_valor (valor R$ além do percentual)
--       - proposta       (proposta_id)
--       - renovacao      (deriva do tipo do funil de origem → custom_fields)
--   • Substitui `vendedor_lider_equipe` (que sobrescrevia o vendedor) por
--     `equipe_alvo` (apenas atribui a equipe, mantendo o vendedor original).
-- ─────────────────────────────────────────────────────────────

-- 1) Coluna proposta_id em negocios + FK + índice
do $$ begin
  alter table public.negocios add column if not exists proposta_id uuid;
exception when others then null; end $$;

do $$ begin
  alter table public.negocios
    add constraint negocios_proposta_id_fkey
    foreign key (proposta_id) references public.propostas(id) on delete set null;
exception when others then null; end $$;

create index if not exists idx_negocios_proposta_id on public.negocios(proposta_id) where proposta_id is not null;

-- 2) Atualiza o registro da automação default (idempotente)
do $$
declare
  v_funil_emissao_id uuid;
  v_acoes_novas      jsonb;
begin
  select id into v_funil_emissao_id
    from public.funis
   where public.pt_norm(nome) = public.pt_norm('EMISSÃO E IMPLANTAÇÃO')
   limit 1;

  if v_funil_emissao_id is null then
    raise notice 'Funil EMISSÃO E IMPLANTAÇÃO não encontrado — automação não será atualizada.';
    return;
  end if;

  v_acoes_novas := jsonb_build_array(
    jsonb_build_object(
      'tipo',      'criar_negocio_em_funil',
      'funil_id',  v_funil_emissao_id,
      'titulo',    'Pós-venda',
      'copiar',    jsonb_build_array(
                     'cliente','produto','seguradora','premio',
                     'comissao_pct','comissao_valor',
                     'placa','cpf','cep','vencimento',
                     'vendedor','equipe','origem',
                     'proposta','renovacao'
                   ),
      'equipe_alvo', 'pos venda'
    )
  );

  update public.automacoes
     set acoes = v_acoes_novas,
         descricao = 'Quando uma negociação é marcada como Ganho em qualquer funil (exceto Cobrança, Pós-venda/Sinistro e a própria Emissão e Implantação), cria automaticamente um card no funil EMISSÃO E IMPLANTAÇÃO atribuído à equipe Pós-venda, mantendo o vendedor original e copiando comissão, seguradora, proposta vinculada e flag de renovação.'
   where nome = 'Pós-venda — emissão automática ao Ganho';
end$$;
