# 9. Automação e IA — Agentes de IA, Automações e Chat IA

## 🤖 Agentes de IA

### Para que serve
Criar **agentes virtuais** baseados em ChatGPT que respondem clientes automaticamente no WhatsApp, com personalidade, base de conhecimento e parâmetros próprios.

### Onde fica
Menu lateral → **Agentes de IA** (apenas admin).

### Visão geral

- Cards com cada agente cadastrado.
- Status (Ativo / Inativo) visível.
- Botões: **`🧪 Testar`**, **`✎ Editar`**, **🗑 Excluir**.
- **`+ Novo agente`** no topo.

### Campos do agente

| Campo | O que faz |
|---|---|
| **Nome** | Identificação interna |
| **Descrição** | Texto livre explicando o propósito |
| **Modelo** | GPT-4o, GPT-4o mini, GPT-4 Turbo, GPT-3.5 Turbo |
| **System Prompt** | Instruções que definem o **comportamento** do agente (obrigatório) |
| **Base de conhecimento** | FAQs, tabelas, procedimentos que o agente vai considerar |
| **Temperatura** | 0 a 1 (0 = direto/objetivo, 1 = criativo) |
| **Max tokens** | 64 a 8192 (tamanho máximo da resposta) |
| **Status** | Ativo / Inativo |

### Modelo recomendado para começar

**GPT-4o mini** — equilíbrio de custo e qualidade. Ótimo para a maioria dos casos.

### Passo a passo — criar agente

1. **`+ Novo agente`**.
2. Preencha **Nome** (ex: "Atendente WhatsApp Auto").
3. Em **Comportamento (System Prompt)**:
   ```
   Você é um atendente da CM Seguros. Responda em português do Brasil,
   tom cordial e objetivo. Nunca invente informações de seguros.
   Se o cliente pedir cotação, peça nome, CPF, placa e CEP do veículo.
   Para dúvidas técnicas, encaminhe para um humano dizendo
   "Vou chamar um corretor para te atender em instantes".
   ```
4. Em **Base de conhecimento**, cole referências (horário, FAQs, lista de produtos, links).
5. Ajuste **Temperatura** (0.7 funciona bem para atendimento) e **Max Tokens** (1024 é padrão).
6. Marque **Ativo** → **`✓ Salvar`**.

### Passo a passo — testar agente

1. No card, **`🧪 Testar`**.
2. Digite uma mensagem fictícia (ex: "Qual o horário de funcionamento?").
3. Clique **Enviar** e veja a resposta.
4. Ajuste o prompt se a resposta não estiver adequada.
5. **`🧪 Fechar teste`**.

### Vincular agente ao WhatsApp

1. Vá em **WhatsApp**.
2. No painel **🤖 Agente IA**, escolha o agente cadastrado.
3. Ative o toggle.
4. Mensagens recebidas serão respondidas automaticamente — você continua vendo a conversa.

### Dicas
- **Comece simples**: poucas regras claras no prompt funcionam melhor que prompts longos.
- **Inclua exemplos** na base de conhecimento para guiar tom e conteúdo.
- **Não use** o agente para fechar contratos. Use só para triagem e dúvidas iniciais.
- Excluir um agente **desvincula** automaticamente das instâncias WhatsApp que o usavam.

---

## ⚡ Automações

### Para que serve
Criar regras "**se / então**" que disparam ações quando eventos acontecem com os negócios — exemplo: quando um negócio é marcado como Perdido, criar automaticamente um cartão num funil de "Reciclagem".

### Onde fica
Menu lateral → **Automações** (apenas admin).

### Estrutura de uma automação

- **Trigger (Quando)** — o evento que dispara:
  - `negocio_criado`
  - `etapa_alterada`
  - `status_ganho`
  - `status_perdido`
- **Filtros opcionais**:
  - Funil específico
  - Etapa específica (se trigger = etapa_alterada)
  - Funis excluídos (não dispara nesses)
- **Ações (Então faça)** — uma ou mais:
  - **Criar negociação em outro funil** (com cópia de cliente, produto, vendedor, origem)
  - **Mover etapa**
  - **Criar tarefa** (título, responsável, prazo em dias)
  - **Notificar usuário** (título da notificação)
  - **Definir campo personalizado** (chave + valor)

### Passo a passo — criar automação

**Exemplo: reciclar perdidos do funil VENDA para um funil "Reciclados"**

1. **`+ Nova automação`**.
2. **Nome**: "Reciclar perdidos de Vida".
3. **Descrição**: "Move negociações perdidas para o funil de reciclagem".
4. **QUANDO**:
   - Evento: **Quando marcada como Perdido**.
   - Funil: **VENDA** (filtro).
   - Etapa: vazio (qualquer).
5. **ENTÃO FAÇA** → **`+ Adicionar ação`**:
   - Tipo: **Criar negociação em outro funil**.
   - Funil destino: **FUNIL RECICLADO - VIDA**.
   - Etapa destino: **Primeira etapa**.
   - Copiar do negócio original: marque cliente, produto, vendedor, origem.
6. Marque **Ativa** → **`✓ Salvar`**.

### Aba Histórico de execução

- Tabela com as últimas 50 execuções.
- Colunas: data, automação, trigger, negócio, resultado (OK ou Falhou).
- Erros são exibidos para diagnóstico.

### Desativar / excluir

- Toggle **Ativa/Inativa** no card pausa a regra.
- Excluir remove definitivamente (registros antigos no histórico permanecem).

### Dicas
- **Comece com 1-2 automações simples** antes de criar regras complexas.
- Sempre teste em um funil de **homologação** antes de aplicar em produção.
- Use **funis excluídos** para evitar loops (ex: a automação que move para "Reciclado" não deve disparar dentro de "Reciclado").
- Acompanhe o **histórico** semanalmente para garantir que está rodando sem erros.

---

## 🤖 Chat IA (assistente do CRM)

### Para que serve
Assistente flutuante (canto inferior direito de qualquer página) que tira dúvidas sobre o CRM, comenta seus dados (negócios, tarefas, metas) e responde perguntas técnicas de seguros.

### Onde fica
Botão flutuante 🤖 visível em **toda página do dashboard**.

### Quem pode usar
**Todos** os usuários.

### Visão geral

- Painel lateral abre ao clicar.
- Histórico mantido até você sair do CRM.
- 6 sugestões prontas:
  - "Quais são meus negócios em andamento?"
  - "Tenho alguma tarefa atrasada?"
  - "Como estou em relação às minhas metas?"
  - "O que é franquia no seguro auto?"
  - "Qual diferença entre seguro vida e previdência?"
  - "Como calcular prêmio de seguro?"
- 🗑 Limpar conversa.

### Como usar

- **Enter** envia.
- **Shift+Enter** quebra linha.
- O agente sabe seu `user_id` e pode consultar **seus** dados específicos (negócios, tarefas, metas).

### Exemplos de uso

- "Quais clientes meus têm renovação na próxima semana?"
- "Quais campos um cliente PF precisa ter preenchido?"
- "Explique o funil de Pós-venda."
- "Como envio um documento para assinatura digital?"

### Dicas
- O Chat IA usa **GPT-4o mini** (rápido e econômico).
- Se a resposta vier incorreta, peça para refazer com mais contexto: "Use minha visão de corretor".
- Para dúvidas profundas de uso (passo-a-passo de módulos), prefira consultar **estes tutoriais**.

---

→ Próximo: [10-ADMINISTRACAO.md](./10-ADMINISTRACAO.md)
