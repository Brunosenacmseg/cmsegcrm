-- ─────────────────────────────────────────────────────────────
-- 057_automacao_ganho_posvenda.sql
-- Em vez de um trigger no banco (que não pode ser editado pela UI),
-- registramos a automação na tabela public.automacoes para que ela
-- apareça em /dashboard/automacoes, podendo ser editada/desativada/
-- excluída pelo administrador como qualquer outra automação.
--
-- Estende o schema:
--   - automacoes.funis_excluidos uuid[]  → funis em que a automação NÃO dispara
--   - acao 'criar_negocio_em_funil' aceita "vendedor_lider_equipe": 'pos venda'
--     (a engine resolve o líder no momento da execução)
--
-- E insere a automação default: "Pós-venda — emissão automática ao Ganho".
-- ─────────────────────────────────────────────────────────────

-- 1) Limpa qualquer trigger anterior (caso o approach antigo tenha sido aplicado)
drop trigger if exists trg_automacao_ganho_para_emissao_upd on public.negocios;
drop trigger if exists trg_automacao_ganho_para_emissao_ins on public.negocios;
drop function if exists public.fn_automacao_ganho_para_emissao();

-- 2) Estende automacoes para suportar exclusão de funis
alter table public.automacoes
  add column if not exists funis_excluidos uuid[] not null default '{}'::uuid[];

-- 3) Insere a automação default (idempotente — só cria se não existir)
do $$
declare
  v_funil_emissao_id uuid;
  v_excluidos uuid[];
begin
  select id into v_funil_emissao_id
    from public.funis
   where public.pt_norm(nome) = public.pt_norm('EMISSÃO E IMPLANTAÇÃO')
   limit 1;

  if v_funil_emissao_id is null then
    raise notice 'Funil EMISSÃO E IMPLANTAÇÃO não encontrado — automação não será criada.';
    return;
  end if;

  -- Funis a excluir: cobrança, pósVenda e o próprio EMISSÃO
  select coalesce(array_agg(id), '{}'::uuid[])
    into v_excluidos
    from public.funis
   where tipo in ('cobranca','posVenda')
      or id = v_funil_emissao_id;

  if not exists (
    select 1 from public.automacoes
     where nome = 'Pós-venda — emissão automática ao Ganho'
  ) then
    insert into public.automacoes (
      nome, descricao, ativo, trigger,
      funil_id, etapa_filtro, funis_excluidos,
      acoes
    ) values (
      'Pós-venda — emissão automática ao Ganho',
      'Quando uma negociação é marcada como Ganho em qualquer funil (exceto Cobrança, Pós-venda/Sinistro e a própria Emissão e Implantação), cria automaticamente um card no funil EMISSÃO E IMPLANTAÇÃO atribuído ao líder da equipe Pós-venda.',
      true,
      'status_ganho',
      null,
      null,
      v_excluidos,
      jsonb_build_array(
        jsonb_build_object(
          'tipo', 'criar_negocio_em_funil',
          'funil_id', v_funil_emissao_id,
          'titulo', 'Pós-venda',
          'copiar', jsonb_build_array('cliente','produto','seguradora','premio','comissao_pct','placa','cpf','cep','vencimento'),
          'vendedor_lider_equipe', 'pos venda'
        )
      )
    );
  end if;
end$$;
