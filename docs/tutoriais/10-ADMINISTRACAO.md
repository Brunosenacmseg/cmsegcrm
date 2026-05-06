# 10. Administração — Configurações, Importar Dados e Logs

## ⚙️ Configurações

### Para que serve
Cadastro de **dados mestres** do CRM: motivos de perda, produtos, campos personalizados (que aparecem em negócios e clientes) e templates de e-mail (usados em assinatura digital).

### Onde fica
Menu lateral → seção **Config → Configurações** (apenas admin).

### Abas

1. **✕ Motivos de Perda** — opções que aparecem ao marcar um negócio como Perdido.
2. **📦 Produtos** — produtos comercializados pela corretora (com preço base opcional).
3. **🧩 Campos personalizados** — campos extra que aparecem nas fichas de Negócio ou Cliente.
4. **📧 Templates de Email** — modelos prontos para envio em massa via Autentique.

---

### Aba Motivos de Perda

- Lista de motivos cadastrados (Ativos/Inativos).
- Botão para alternar status (Ativo ↔ Inativo).
- Edição inline e exclusão.

**Como cadastrar:**
1. Digite o nome no campo (ex: "Preço muito alto").
2. **`+ Adicionar`**.
3. Para editar, **✎** → altere → **`✓ Salvar`**.
4. Para excluir, 🗑 → confirme.

> Motivos importados do **RD Station** mantêm o `rd_id` para sincronização futura.

---

### Aba Produtos

Mesmo fluxo dos motivos:
- Nome (ex: "Seguro Auto").
- Preço base (opcional).
- Ativo / Inativo.

Esses produtos aparecem nas dropdowns de **Funis** (criação de negócio) e **Apólices**.

---

### Aba Campos personalizados

Permite estender as fichas de Negócio/Cliente com campos próprios.

**Tipos disponíveis:**
- Texto (única linha)
- Texto longo (textarea)
- Número
- Data
- Select (lista de opções)
- Sim/Não (checkbox)

**Como criar:**
1. Selecione **Entidade**: Negócio ou Cliente.
2. Preencha **Nome** (ex: "Modelo do veículo"); a **chave** (slug) é gerada automaticamente.
3. Selecione **Tipo**.
4. Se for `select`, defina as **opções** (uma por linha).
5. Marque **Obrigatório** se necessário.
6. **`+ Adicionar`**.

O campo passa a aparecer no card do negócio/cliente automaticamente.

---

### Aba Templates de Email

Modelos usados pelo módulo **Autentique** ao enviar documentos para assinatura.

**Categorias disponíveis:** assinatura, renovação, cobrança, geral.

**Variáveis suportadas:**
- `{{cliente}}` → nome do cliente
- `{{negocio}}` → título do negócio
- `{{documento}}` → nome do documento

**Como criar:**
1. **`+ Novo template`**.
2. **Nome** (ex: "Assinatura Vida").
3. **Categoria** (ex: assinatura).
4. **Assunto** do e-mail.
5. **Mensagem** com variáveis (ex: `Prezado {{cliente}}, segue o documento {{documento}}…`).
6. Marque **Padrão** se for o template padrão da categoria.
7. **`✓ Salvar`**.

### Dicas
- Manter os **motivos de perda** organizados ajuda nos relatórios de "Por que perdemos vendas?".
- Crie **campos personalizados** com parcimônia — se forem demais a ficha fica pesada.
- Templates **Padrão** evitam que o time precise escrever assunto/corpo todo dia.

---

## 📥 Importar Dados

### Para que serve
Bulk import de Clientes, Negócios, Apólices, Propostas e Tarefas a partir de planilhas (CSV ou XLSX), com mapeamento automático de colunas, preview e processamento em lotes.

### Onde fica
Menu lateral → seção **Config → Importar Dados** (apenas admin).

### Visão geral

- 5 cards com as entidades importáveis.
- Drop zone (arraste arquivo) ou botão para selecionar.
- Tabela de mapeamento (auto-detectado).
- Preview com 10 linhas.
- Importação em lotes de 200 registros.
- **Histórico** das últimas 15 importações.

### Recursos especiais

- **🔄 Sincronizar responsáveis** — atualiza o vendedor de negociações **existentes** a partir de um arquivo do RD Station, sem reimportar (faz match por nome ou CPF).
- **📋 Sincronizar planilha completa do RD CRM** — atualiza negociações existentes preenchendo apenas os campos vazios (não sobrescreve dados já preenchidos).

### Passo a passo — importar planilha

1. Clique no card da entidade desejada (ex: Clientes).
2. Faça upload do arquivo CSV ou XLSX.
3. Sistema detecta colunas e propõe mapeamento.
4. Ajuste colunas erradas (dropdown por linha).
5. **`Ver Preview`** — confira amostra.
6. **`✅ Confirmar Importação`**.
7. Acompanhe progresso (Lote X/Y).
8. Ao final: lidos / criados / atualizados / erros.

### Passo a passo — sincronizar responsáveis (RD)

1. Card **🔄 Sincronizar responsáveis**.
2. Faça upload da planilha exportada do RD com colunas: título, responsável, CPF/CNPJ.
3. **`Pré-visualizar`** mostra a previsão de mudanças.
4. **`Aplicar`** — atualiza vendedores nas negociações existentes.
5. Confira: quantos atualizados, sem match, erros.

### Dicas
- Sempre **exporte do sistema de origem** (RD, Excel manual, etc.) com a primeira linha contendo o nome das colunas.
- Faça uma **importação de teste** com poucos registros antes da carga completa.
- O **histórico** mostra cada importação para auditoria.

---

## 📜 Log do Sistema

### Para que serve
Auditoria completa: visualizar todo histórico de **acessos**, **logins** e **ações** dos usuários — com IP, localização, dispositivo e detalhes da ação.

### Onde fica
Menu lateral → seção **Config → Log do Sistema** (apenas admin).

### Abas

1. **Atividades no sistema** — todas as ações (CRUD, navegação, criação de registros).
2. **Logins** — histórico de acessos com sucesso/falha, geo-localização e ISP.

### Filtros (em ambas as abas)

- **Usuário** — todos ou específico.
- **De** / **Até** — janela temporal.
- **Buscar** — texto livre (ação, recurso, IP, cidade).

### Aba Atividades

Tabela: data/hora, usuário, ação (`page_view`, `create`, `update`, `delete`…), recurso (módulo afetado), pathname (URL), detalhe.

### Aba Logins

Tabela: data/hora, usuário, status (Sucesso / Falhou), IP, localização (cidade/estado/país, link Google Maps), ISP, dispositivo (user agent).

### Casos de uso

- "Quem deletou aquele cliente?" → filtro por `delete` na ação.
- "Está tendo tentativas de invasão?" → veja **Logins → status Falhou**.
- "Esse usuário acessa de fora do Brasil?" → veja a localização do login.

### Dicas
- Mostra os **últimos 100 registros** por filtro — refine se procura algo antigo.
- O log é **append-only**: não pode ser apagado pela interface (só por DBA).
- Use mensalmente como rotina de auditoria.

---

## 📋 Conclusão

Você chegou ao final dos tutoriais. Caso tenha dúvidas pontuais:

- Use o **Chat IA** 🤖 (canto inferior direito) — ele conhece o sistema.
- Sugira melhorias em **Melhorias CRM**.
- Reporte bugs ao admin.

Boas vendas! 🚀
