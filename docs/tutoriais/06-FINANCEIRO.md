# 6. Financeiro — Comissões, DRE, Contas a Pagar, Metas e Relatórios

## 💰 Comissões

### Para que serve
Registro, importação e acompanhamento de **comissões recebidas** das seguradoras, mais visualização das comissões **previstas** (negócios em aberto que vão gerar receita).

### Onde fica
Menu lateral → seção **Financeiro → Comissões**.

### Quem pode usar
| Perfil | Acesso |
|---|---|
| Corretor | Apenas suas comissões |
| Líder | Comissões da equipe |
| Admin | Tudo, com filtro por vendedor |

### Visão geral — três abas

1. **Recebidas** — comissões efetivamente lançadas (vêm de **Apólices → Comissão** ou da importação).
2. **Previstas** — extrato de comissões a receber, calculado a partir dos negócios.
3. **Importar Excel** — upload de planilha de seguradora, com mapeamento automático de colunas.

### Aba Recebidas

- Seletor de **ano** e **mês** (ou botão **`📆 Ver ano`** para visão anual).
- (Admin/Líder) Filtro por vendedor.
- Tabela com Cliente, Produto, Seguradora, Prêmio, Comissão (R$ e %), Vencimento, Apólice, Data de recebimento, Competência.
- Botão **`📥 Exportar relatório`** — gera Excel da visão atual.

### Aba Previstas

Extrato de quanto cada vendedor irá receber se os negócios em aberto fecharem — útil para planejamento financeiro.

### Aba Importar Excel — passo a passo

1. **`📥 Importar Excel`**.
2. Informe o **mês de competência**.
3. Arraste o arquivo `.xlsx` ou `.xls` da seguradora.
4. O sistema **sugere automaticamente o mapeamento** das colunas (Cliente, Produto, Seguradora, Prêmio, Comissão, %, Vencimento, Apólice). Ajuste se necessário.
5. **`Ver Preview`** mostra as primeiras linhas processadas.
6. **`✓ Confirmar Importação`** — registros são gravados na base.

### Dicas
- Faça a importação **mensalmente**, sempre na mesma data.
- A coluna **% comissão** é opcional — se não vier, é calculada a partir de prêmio e comissão.
- Após importar, abra a aba **Recebidas** e confira os totais.

---

## 💼 Financeiro / DRE

### Para que serve
Cofre financeiro com **DRE mensal**, lançamento de despesas, despesas recorrentes, categorias contábeis e gestão de acessos. Possui **senha extra** (não basta o login do CRM).

### Onde fica
Menu lateral → seção **Financeiro → Financeiro / DRE** (apenas admin).

### Quem pode usar
- **Admin** sempre.
- **Outros usuários** apenas se o admin liberar acesso na "Gestão de acessos" — e ainda precisam digitar a **senha do cofre** a cada sessão.

### Como abrir o cofre

1. Acesse o módulo.
2. Se não estiver desbloqueado nesta sessão, aparece o prompt **"Senha do cofre"**.
3. Digite a senha e clique **`Desbloquear`**.
4. A sessão fica liberada por **1 dia**.

> Se nenhuma senha estiver configurada, o admin pode criar a primeira em **`🔑 Definir senha do cofre`**.

### Abas

- **DRE** — visão mensal por categoria, com modo *Projeção* (pelo vencimento) ou *Real* (pelo pagamento).
- **Despesas** — CRUD de despesas (fixa, variável, recorrente).
- **Despesas recorrentes** — modelos para acelerar lançamentos do mês.
- **Categorias** — código contábil + nome + tipo (Despesa/Receita).
- **Acessos** (admin) — quem pode entrar, além dos administradores.

### Passo a passo — lançar despesa

1. **`+ Lançar despesa`**.
2. Selecione **Categoria DRE** (ou crie uma nova).
3. Preencha **Descrição**, **Valor**, **Vencimento**.
4. Opcional: **Data do pagamento** (preenchida ativa o modo "Real"), **Tipo** (FIXA/VARIÁVEL), **Forma de pagamento** (PIX, Boleto, TED, Cartão, Débito, Dinheiro), **Condição** (à vista/30d/60d/etc.), **Fornecedor**, **Observações**.
5. (Opcional) Marque **"Salvar como despesa recorrente"** para criar um modelo.
6. **`✓ Lançar`**.

### Passo a passo — visualizar DRE

1. Aba **DRE**.
2. Selecione **mês** e **ano**.
3. Selecione **modo**:
   - **Projeção** — usa a data de vencimento (mostra o que está previsto).
   - **Real** — usa a data de pagamento (mostra o que efetivamente saiu).
4. A tela mostra Receitas (por seguradora), Despesas (por categoria) e o **resultado líquido**.

### Passo a passo — gestão de acessos (admin)

1. Aba **Acessos**.
2. **`+ Liberar acesso`** → escolha o usuário → **`Liberar`**.
3. Para revogar, clique 🗑 ao lado do usuário.

### Dicas
- A **senha do cofre** é independente da senha de login. Trate como informação confidencial.
- Use o modo **Projeção** para planejamento; **Real** para conferência contábil.
- Para automatizar despesas mensais (aluguel, salário, plano de saúde), use **Recorrentes**.

---

## 💳 Contas a Pagar

### Para que serve
Centraliza compromissos financeiros (boletos, fornecedores, despesas operacionais) com fluxo de aprovação e pagamento. Quando uma conta é marcada como paga, automaticamente vira despesa no DRE.

### Onde fica
Menu lateral → seção **Financeiro → Contas a Pagar** (apenas admin).

### Visão geral

- Filtros por status: Pendentes / Aprovadas / Pagas / Recusadas.
- Existem dois tipos:
  - **Contas a pagar** propriamente ditas.
  - **Compras para aprovação** — requisições de compra que precisam de aprovação antes de virarem conta.
- Cards de resumo: total pendente, aprovado, pago.

### Campos da conta

- Nome/Referência *
- Valor *
- Vencimento *
- Fornecedor
- Categoria DRE
- Descrição
- PDF/Boleto anexado
- Status, data de pagamento, forma de pagamento

### Fluxo

1. **Lançamento** — qualquer usuário com permissão cria a conta (`+ Lançar conta`).
2. **Aprovação** — admin clica **`✓ Aprovar`** ou **`✕ Recusar`** (com motivo).
3. **Pagamento** — admin clica **`💸 Pagar`**, informa data, forma e categoria DRE → cria despesa automaticamente no Financeiro.
4. **Anexação de boleto/NF** — botão **`📎 Documentos`**.

### Dicas
- Sempre **anexe o boleto/PDF** para auditoria.
- Categoria DRE no momento do pagamento é o que define onde a despesa entra no DRE.
- "Pedir ajuste" permite que o RH/admin solicite alterações antes de aprovar.

---

## 🎯 Metas

### Para que serve
Definir e acompanhar **metas individuais** de vendedores, com cálculo automático do progresso a partir dos negócios e comissões.

### Onde fica
Menu lateral → **Metas**.

### Quem pode usar
| Perfil | Acesso |
|---|---|
| Corretor | Apenas suas metas |
| Líder | Cria/edita metas de sua equipe |
| Admin | Tudo |

### Tipos de meta

- **Prêmio (R$)** — valor de prêmio fechado no período.
- **Nº de Negócios** — quantidade de deals fechados.
- **Novos Clientes** — clientes cadastrados.
- **Comissão (R$)** — comissão recebida.

### Visão geral

- Cards por colaborador, com:
  - Título da meta, tipo, valor alvo
  - Período (início e fim)
  - Barra de progresso e ✅ "ATINGIDA" quando ≥ 100%
  - Dias restantes (vermelho se ≤ 7)
- Sidebar com ranking 🥇🥈🥉.
- Botão **`🔄 Recalcular`** — força atualização dos valores atuais a partir das tabelas de origem.

### Passo a passo — criar meta (admin/líder)

1. **`+ Nova Meta`**.
2. Selecione o **colaborador**.
3. Preencha **Título**, **Tipo**, **Valor**, **Período (início/fim)**.
4. (Opcional) Descrição.
5. **`🎯 Criar Meta`** — colaborador recebe notificação.

### Dicas
- Use **Recalcular** após importar comissões, para refletir o atingimento real.
- Metas de **comissão** são especialmente úteis para incentivar vendas com maior margem (ex: produtos com comissão alta).
- Excluir uma meta marca como **inativa** (não apaga histórico).

---

## 📊 Relatórios

### Para que serve
Visão consolidada do desempenho — prêmio, comissão, conversão e novos clientes — com filtros por período, equipe e usuário.

### Onde fica
Menu lateral → **Relatórios**.

### Quem pode usar
| Perfil | Acesso |
|---|---|
| Corretor | Apenas seus dados |
| Líder | Dados da equipe |
| Admin | Tudo, com filtros globais |

### Visão geral

- **Seletor de período**: Este mês / Trimestre / Este ano.
- **Filtros**: Equipe (admin) / Usuário.
- **KPIs** no topo:
  - Prêmio total
  - Comissão total
  - Média de comissão (%)
  - Taxa de conversão (negócios ganhos ÷ total)
- **Cards de Negócios**: total / ativos / ganhos / perdidos / novos clientes.
- **Gráfico de barras**: prêmio mensal do ano corrente.
- **Tabela**: Top 6 seguradoras com volume.

### Passo a passo

1. Selecione **período** desejado.
2. Aplique filtros (equipe / usuário) para "fatiar" os números.
3. Analise:
   - **Taxa de conversão** baixa? Identifique gargalos no funil.
   - **Concentração em uma seguradora**? Risco — diversifique.
   - **Mês com pico**? Procure por campanha que justifique.

### Dicas
- Use **Relatórios** mensalmente em reunião com o time.
- Combine com **Metas** para ver não só o resultado, mas o atingimento.
- Para análises mais profundas, exporte via **Apólices → Exportar Excel**.

---

→ Próximo: [07-EMPRESA-RH.md](./07-EMPRESA-RH.md)
