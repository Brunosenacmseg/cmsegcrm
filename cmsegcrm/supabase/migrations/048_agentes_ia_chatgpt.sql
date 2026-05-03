-- Migra agentes de IA do Claude/Anthropic para OpenAI/ChatGPT.

alter table public.ai_agentes
  alter column modelo set default 'gpt-4o-mini';

update public.ai_agentes
   set modelo = case
     when modelo ilike 'claude-opus%'   then 'gpt-4o'
     when modelo ilike 'claude-sonnet%' then 'gpt-4o-mini'
     when modelo ilike 'claude-haiku%'  then 'gpt-3.5-turbo'
     when modelo ilike 'claude-%'       then 'gpt-4o-mini'
     else modelo
   end
 where modelo ilike 'claude-%';
