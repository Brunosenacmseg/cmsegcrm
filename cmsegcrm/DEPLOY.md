# CM.segCRM — Guia de Deploy
## Do zero ao ar em ~15 minutos, sem TI

---

## PASSO 1 — Criar banco no Supabase (grátis)

1. Acesse https://supabase.com e crie uma conta gratuita
2. Clique em **New Project** → escolha um nome (ex: `cmsegcrm`) e senha forte
3. Aguarde ~2 minutos o projeto subir
4. No menu lateral, clique em **SQL Editor**
5. Cole todo o conteúdo do arquivo `supabase/migrations/001_schema.sql` e clique em **Run**
6. Vá em **Settings → API** e copie:
   - `Project URL` → é o seu `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → é o seu `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

## PASSO 2 — Subir o código no GitHub

1. Crie uma conta em https://github.com (se não tiver)
2. Clique em **New repository** → nome: `cmsegcrm` → **Create**
3. Na sua máquina, abra o terminal na pasta do projeto e rode:

```bash
git init
git add .
git commit -m "CM.segCRM inicial"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/cmsegcrm.git
git push -u origin main
```

---

## PASSO 3 — Deploy na Vercel (grátis)

1. Acesse https://vercel.com e faça login com sua conta GitHub
2. Clique em **Add New → Project**
3. Selecione o repositório `cmsegcrm`
4. Em **Environment Variables**, adicione:

| Nome | Valor |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | (cole a URL do Supabase) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (cole a anon key) |
| `SUPABASE_SERVICE_ROLE_KEY` | (cole a service_role key — necessária para integrações) |
| `RDSTATION_CRM_TOKEN` | (token do RD Station CRM — opcional, ver abaixo) |

5. Clique em **Deploy** e aguarde ~2 minutos
6. A Vercel vai gerar um link como `cmsegcrm.vercel.app` — esse é o seu sistema online!

---

## PASSO 4 — Primeiro acesso

1. Acesse seu link `cmsegcrm.vercel.app/login`
2. Clique em **Criar conta** e cadastre o usuário administrador
3. Para adicionar corretores, vá em **Usuários** no menu → **Adicionar Corretor**

---

## Domínio personalizado (opcional)

Se quiser um domínio como `crm.suacorretora.com.br`:
1. Compre um domínio em https://registro.br (~R$40/ano)
2. Na Vercel, vá em **Settings → Domains** e adicione seu domínio
3. Siga as instruções para apontar o DNS

---

## Custos

| Serviço | Plano Gratuito |
|---------|---------------|
| Supabase | 500MB banco, 50k usuários |
| Vercel | Deploys ilimitados, SSL grátis |
| **Total** | **R$ 0/mês** para começar |

---

## Integração RD Station CRM (opcional)

Para importar contatos, funis, negócios e atividades do RD Station CRM:

1. **Aplicar migration**: rode no SQL Editor do Supabase o arquivo `supabase/migrations/003_rd_station.sql`
2. **Obter o token**: no RD Station CRM → **Configurações → Integrações → Token de API**
3. **Configurar a variável** `RDSTATION_CRM_TOKEN` na Vercel (Settings → Environment Variables) com o valor do token
4. Faça redeploy para aplicar a env var
5. No CRM, acesse **Integrações → RD Station CRM** (apenas admin) e clique em **Importar tudo**

A importação é idempotente — pode ser executada quantas vezes precisar; registros existentes (mesmo `rd_id`) são atualizados em vez de duplicados. Ordem recomendada: usuários → funis → contatos → negócios → atividades (o botão "Importar tudo" já segue essa ordem).

---

## Suporte

Em caso de dúvidas, o Claude pode te ajudar com qualquer passo!
