-- ═════════════════════════════════════════════════════════════════════
-- Restaura os 17 funis do RD Station CRM (com emojis + cores).
-- Idempotente: só insere os que ainda não existem (match por nome).
--
-- Depois desse SQL, vá em /dashboard/rdstation e rode "Sincronizar Tudo":
-- a sincronização vai:
--   - vincular cada funil ao pipeline RD correspondente (rd_id)
--   - atualizar etapas exatamente como estão no RD
--   - importar negociações no funil/etapa/status/vendedor corretos
-- ═════════════════════════════════════════════════════════════════════

do $$
declare
  v_funis jsonb := $json$
  [
    {"nome":"VENDA","tipo":"venda","emoji":"💼","cor":"#c9a84c","ordem":1,"etapas":["NOVO LEAD","CARDS ESCRITÓRIO","SEM CONTATO","INTERAÇÃO","ORÇAMENTO ENVIADO/NEGOCIAÇÃO","PROPOSTA ENVIADA","PENDENTE RASTREADOR","APÓLICE EMITIDA","AUTENTIQUE ENVIADO","PÓS VENDA","RASTREADOR PARA AGENDAR","PROCESSO FINALIZADO"]},
    {"nome":"FUNIL RECICLADO - VIDA","tipo":"venda","emoji":"🌿","cor":"#1cb5a0","ordem":2,"etapas":["Sem contato","Contato feito","Identificação do Interesse","SEM CONTATO","Apresentação","Proposta enviada"]},
    {"nome":"META + MULTICANAL","tipo":"venda","emoji":"📡","cor":"#4a80f0","ordem":3,"etapas":["NOVO LEAD MULTICANAL","TENTATIVA 1","TENTATIVA 2","TENTATIVA 3","INTERAÇÃO","ORÇAMENTO ENVIADO/NEGOCIAÇÃO","RETORNO COBRADO","PROPOSTA ENVIADA","APÓLICE EMITIDA","AUTENTIQUE ENVIADO","PÓS VENDA","PROCESSO FINALIZADO"]},
    {"nome":"SAUDE","tipo":"venda","emoji":"🩺","cor":"#3dc46a","ordem":4,"etapas":["NOVO LEAD","SEM CONTATO","INTERAÇÃO","ORÇAMENTO/NEGOCIAÇÃO","RETORNO COBRADO","LEMBRETE PROMOÇÃO","PROPOSTA ENVIADA","APÓLICE EMITIDA","AUTENTIQUE ENVIADO","PÓS VENDA","PROCESSO FINALIZADO"]},
    {"nome":"RENOVAÇÕES","tipo":"renovacao","emoji":"🔄","cor":"#9c5de4","ordem":5,"etapas":["RENOVAÇÕES À VENCER","VENCIMENTO ATÉ 10 DIAS","AGUARDANDO INTERAÇÃO","ORÇAMENTO ENVIADO","AGUARDANDO DATA DE CARTÃO","RENOVAÇÕES AUTOMÁTICAS","PROPOSTA EFETIVADA","APÓLICE EMITIDA","AUTENTIQUE ENVIADO","PÓS VENDA","RASTREADOR PARA AGENDAR","PROCESSO FINALIZADO"]},
    {"nome":"RCO","tipo":"renovacao","emoji":"📈","cor":"#5b8def","ordem":6,"etapas":["RENOVAÇÕES À VENCER","VENCIMENTO ATÉ 10 DIAS","CONTATO INICIADO","AGUARDANDO INTERAÇÃO","AGUARDANDO DATA DE EMISSÃO","PROPOSTA EFETIVADA","APÓLICE EMITIDA","AUTENTIQUE ENVIADO","PROCESSO FINALIZADO"]},
    {"nome":"ENDOSSO B2B","tipo":"venda","emoji":"🧾","cor":"#ff8a3d","ordem":7,"etapas":["ENDOSSO SOLICITADO","CALCULO ENVIADO","PROPOSTA EFETIVADA","PENDENTE RASTREADOR","ENDOSSO EMITIDO","AUTENTIQUE ENVIADO","PROCESSO FINALIZADO"]},
    {"nome":"CONSÓRCIO","tipo":"venda","emoji":"🏠","cor":"#d8425c","ordem":8,"etapas":["NOVO LEAD","TENTATIVA 1","TENTATIVA 2","TENTATIVA 3","INTERAÇÃO","ORÇAMENTO APRESENTADO","RETORNO COBRADO","LEMBRETE PROMOÇÃO","PROPOSTA ENVIADA","APÓLICE EMITIDA"]},
    {"nome":"CONTA PORTO BANK","tipo":"venda","emoji":"🏦","cor":"#a0a8b8","ordem":9,"etapas":["Sem contato","Contato feito","Identificação do Interesse","Apresentação","Proposta enviada"]},
    {"nome":"CARTÃO PORTO","tipo":"venda","emoji":"💳","cor":"#7aa3f8","ordem":10,"etapas":["Sem contato","Contato feito","Identificação do Interesse","Apresentação","Proposta enviada"]},
    {"nome":"FINANCIAMENTO E REFINANCIAMENTO","tipo":"venda","emoji":"💵","cor":"#4dd9c7","ordem":11,"etapas":["Sem contato","Contato feito","Identificação do Interesse","Apresentação","Proposta enviada"]},
    {"nome":"FUNIL COBRANÇA","tipo":"cobranca","emoji":"💰","cor":"#e05252","ordem":12,"etapas":["CLIENTES INADIMPLENTES","SOLICITAÇÃO TALLOS","TALLOS EM ANDAMENTO","MENSAGEM PADRÃO TALLOS","SEGUNDA TENTATIVA - TALLOS","TERCEIRA TENTATIVA - TALLOS","BOLETO ENVIADO (cancelamento)","PROCESSO FINALIZADO"]},
    {"nome":"FUNIL RASTREADOR","tipo":"venda","emoji":"📍","cor":"#e6c97a","ordem":13,"etapas":["NOVAS SOLICITAÇÕES","CONTATO TELEFÔNICO","MENSAGEM PADRÃO 1","MENSAGEM PADRÃO 2","AGENDADO","REAGENDADO 1","REAGENDADO 2","CONCLUÍDO","ENVIADO AO VENDEDOR","PROCESSO FINALIZADO"]},
    {"nome":"ASSISTÊNCIA 24HRS","tipo":"posVenda","emoji":"🛟","cor":"#7aa3f8","ordem":14,"etapas":["ABERTURA DE ASSISTÊNCIA","ENVIO DE DOCUMENTOS/FOTOS","AGENDAMENTO REALIZADO","REAGENDAMENTO 1","REAGENDAMENTO 2","AGUARDANDO SERVIÇO/REEMBOLSO","FINALIZADO","ABERTURA SAC","SAC FINALIZADO"]},
    {"nome":"SINISTRO","tipo":"posVenda","emoji":"🛡️","cor":"#4a80f0","ordem":15,"etapas":["SOLICITAÇÃO DE ABERTURA","AGUARDANDO DOCUMENTAÇÃO","AGUARDANDO VISTORIA","VISTORIA FEITA","AGUARDANDO DOCUMENTAÇÃO COMPLEMENTAR","ANALISE ESPECIAL / BAIXA DE GRAVAME","AGUARDANDO PROGRAMAÇÃO DE PGTO","VIDA","SINISTRO ENCERRADO"]},
    {"nome":"CANCELADOS / INADIMPLENTES","tipo":"cobranca","emoji":"🚫","cor":"#f08080","ordem":16,"etapas":["VERIFICAR APOLICE","CONTATO FEITO","ORÇAMENTO ENVIADO","REFEITO","CANCELADO"]},
    {"nome":"EMISSÃO E IMPLANTAÇÃO","tipo":"venda","emoji":"📤","cor":"#5b8def","ordem":17,"etapas":["AGUARDANDO EMISSÃO","EM IMPLANTAÇÃO","PENDENTE DOCUMENTOS","EMITIDO","FINALIZADO"]}
  ]
  $json$::jsonb;
  v_item jsonb;
begin
  for v_item in select * from jsonb_array_elements(v_funis)
  loop
    if not exists (select 1 from public.funis where nome = v_item->>'nome') then
      insert into public.funis (nome, tipo, emoji, cor, etapas, ordem)
      values (
        v_item->>'nome',
        v_item->>'tipo',
        v_item->>'emoji',
        v_item->>'cor',
        array(select jsonb_array_elements_text(v_item->'etapas')),
        (v_item->>'ordem')::int
      );
    end if;
  end loop;
end$$;

-- Conferência:
select nome, ordem, array_length(etapas, 1) as qtd_etapas, rd_id
from public.funis
order by ordem;
