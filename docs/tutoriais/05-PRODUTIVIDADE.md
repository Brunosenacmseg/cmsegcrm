# 5. Produtividade — Tarefas, Autentique, Manuais e Melhorias

## ✅ Tarefas

### Para que serve
Gerenciador de tarefas com prazo, múltiplos responsáveis, vínculo a clientes/negócios e alerta de vencimento. Cada tarefa tem ciclo: **pendente → em andamento → concluída** (ou cancelada).

### Onde fica
Menu lateral → **Tarefas** (badge vermelho mostra quantas você tem pendentes).

### Quem pode usar
| Perfil | O que vê |
|---|---|
| Corretor | Tarefas onde é responsável ou criador |
| Líder | Tarefas da própria equipe |
| Admin | Todas, com filtro por equipe e usuário |

### Visão geral

- **Cards** das tarefas, com cor lateral indicando status (ouro=pendente, teal=em andamento, etc.).
- **Filtros**:
  - Status: Pendente / Em andamento / Concluída / Todas.
  - Responsável: Minhas / Atribuídas (por mim) / Todas.
  - (Admin) Equipe e Usuário.
- **Alerta** ⚠️ de tarefas vencendo nas próximas 48 h.
- **Botão `+ Nova Tarefa`**.

### Tipos de tarefa

`tarefa` (genérica) · `ligação` · `reunião` · `email` · `visita` · `outro`

### Passo a passo — criar tarefa

1. **`+ Nova Tarefa`**.
2. Preencha:
   - **Título** (ex: "Ligar para João Silva")
   - **Descrição** (detalhes)
   - **Tipo** (ligação, reunião, etc.)
   - **Prazo** (data + hora)
3. Selecione **um ou mais responsáveis** (se nenhum for marcado, você se torna responsável).
4. (Opcional) **Vincular a um cliente** (busca por nome).
5. **`✓ Criar Tarefa`** — outros responsáveis recebem notificação 🔔.

### Atualizar status

Cada cartão tem botões:
- **`Iniciar`** — passa de pendente para em andamento.
- **`✓ Concluir`** — marca como concluída.
- **`Cancelar`** — descarta sem concluir.

### Dicas
- Tarefas vinculadas ao **negócio** ou ao **cliente** aparecem na ficha respectiva.
- Use o filtro **Atribuídas (por mim)** para acompanhar o que você delegou ao time.
- Tarefas em vermelho na lista = atrasadas; em ouro = vencem hoje.

---

## ✍️ Autentique — assinaturas digitais

### Para que serve
Enviar documentos (PDF) para assinatura via **Autentique**, acompanhar status de cada signatário e baixar o PDF final assinado.

### Onde fica
Menu lateral → **Autentique** (visível para Admin e EQUIPE PÓS VENDA).

### Quem pode usar
- **Admin**: tudo.
- **EQUIPE PÓS VENDA**: tudo.

### Visão geral

- Tabela com: Documento, Vínculo (cliente/negócio), Status, Assinados/Total, Data, Links.
- Filtros por status: Todos / Pendente / Enviado / Assinado / Recusado.
- Botões:
  - **`+ Novo documento`** — sobe um PDF e cria o envelope.
  - **`🔄 Sincronizar status`** — atualiza o estado dos documentos via API do Autentique.

### Status

| Ícone | Significado |
|---|---|
| ⏳ Pendente | Aguardando primeiro envio |
| 📤 Enviado | Link gerado, aguardando assinaturas |
| ✅ Assinado | 100% assinado |
| ❌ Recusado | Algum signatário recusou |
| ⚠️ Expirado | Prazo vencido |
| 🚫 Cancelado | Cancelado manualmente |

### Passo a passo — enviar documento

1. **`+ Novo documento`**.
2. Anexe o **PDF** e dê um nome ao documento (ex: "Proposta Auto — João Silva").
3. **Vincule** a um negócio e/ou cliente (opcional, mas recomendado).
4. Adicione **signatários** (nome + e-mail). Use **`+ Adicionar signatário`** para múltiplos.
5. **Mensagem** opcional para os signatários.
6. **`✓ Enviar para assinatura`**. Cada signatário recebe e-mail com link.

### Acompanhar e baixar

- Use **`🔄 Sincronizar status`** sempre que quiser atualizar o estado.
- A coluna "Assinados" mostra `2/2` quando tudo concluído.
- O botão **PDF** baixa o documento final assinado.
- O link **Assinar** copia o URL público (caso queira reencaminhar manualmente).

### Dicas
- Sempre vincule o documento a um cliente/negócio — o histórico fica completo na ficha.
- Você pode **acionar a assinatura direto do Funil**: suba o PDF na aba Anexos do cartão e clique "Enviar para assinatura".

---

## 📚 Manuais & Processos

### Para que serve
Repositório central de documentos da empresa: manuais, processos, materiais de treinamento, normativos jurídicos. Suporta PDF, Word, Excel, PowerPoint, imagens, vídeos e ZIPs.

### Onde fica
Menu lateral → **Manuais & Processos** (seção *Empresa*).

### Quem pode usar
- **Todos** podem visualizar e baixar.
- **Admin / Líder** pode adicionar e excluir.

### Visão geral

- **Sidebar de categorias**: Todos / Geral / Manual de Vendas / Processos / Produtos / Treinamento / Jurídico — cada categoria com contador.
- **Busca** por título ou descrição.
- **Cards** dos arquivos com ícone (📄 PDF, 📊 planilha, 📝 Word, 🖼 imagem, 🎥 vídeo), tamanho, autor e data.
- **Botões por card**: 👁 Visualizar / ⬇ Baixar / 🗑 (admin/líder).

### Passo a passo — adicionar manual (admin/líder)

1. **`+ Adicionar arquivo`**.
2. Preencha **Título** (obrigatório), **Descrição** opcional e **Categoria**.
3. Faça upload do arquivo (drag-and-drop ou seletor).
4. **`📤 Enviar`** — barra de progresso indica o upload.

### Dicas
- Categorize bem para facilitar a busca futura.
- Para fluxos de onboarding de novos corretores, crie a categoria **Treinamento** com vídeos.
- O sistema suporta arquivos grandes — use o ZIP se for um pacote (ex: kit de campanha).

---

## 💡 Melhorias CRM

### Para que serve
Canal para todos os usuários enviarem **sugestões de melhoria** ao sistema. Admin/financeiro respondem com status e o usuário é notificado.

### Onde fica
Menu lateral → **Melhorias CRM** (seção *Empresa*).

### Quem pode usar
- **Todos** enviam sugestões e veem respostas.
- **Admin / Financeiro** respondem e definem o status.

### Visão geral

- Filtros por status: Todas / 🟡 Abertas / ✅ Concluídas / ⏭ Para depois / 🚫 Não pode ser feita.
- Cards com título, descrição, anexos, autor, data e (se houver) resposta da equipe.

### Status

| Status | Significado |
|---|---|
| 🟡 Aberta | Em análise |
| ✅ Concluída | Implementada |
| ⏭ Para depois | Aceita, mas com prazo futuro |
| 🚫 Não pode ser feita | Recusada (com justificativa) |

### Passo a passo — enviar sugestão

1. **`+ Nova sugestão`**.
2. Preencha **título** e **descrição** (explique o "por quê", não só o "o quê").
3. (Opcional) Anexe screenshot ou arquivo de apoio.
4. **`Enviar sugestão`** — admin recebe notificação.

### Passo a passo — responder (admin)

1. Abra a sugestão.
2. Clique **`💬 Responder / Marcar status`**.
3. Selecione status (Concluída / Não pode / Para depois).
4. (Opcional) Texto de explicação.
5. **`Salvar`** — autor recebe notificação.

### Reabrir sugestão

Caso uma sugestão tenha sido fechada como "Não pode" ou "Para depois", admin/autor pode clicar **`🔄 Reabrir`** voltando para "Aberta".

### Dicas
- Uma boa sugestão tem **contexto** (problema), **proposta** (o que mudar) e **valor** (impacto).
- Responda sempre — mesmo "Não pode ser feita" com motivação demonstra atenção e mantém o canal saudável.

---

→ Próximo: [06-FINANCEIRO.md](./06-FINANCEIRO.md)
