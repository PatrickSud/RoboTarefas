# RoboTarefas - Painel Web

Painel React/Vite para gerenciar contas do robô e visualizar execuções salvas no Supabase.

## Configuração local

Crie `web/.env` com:

```env
VITE_SUPABASE_URL="https://seu-projeto.supabase.co"
VITE_SUPABASE_ANON_KEY="sua-anon-key-publica"
```

Use a chave `anon public`, não use a `service_role` no frontend.

## Segurança no Supabase

Execute no SQL Editor:

```txt
supabase/web_panel_rls.sql
```

Depois crie um usuário em `Authentication > Users` e adicione o `user_id` dele como administrador:

```sql
insert into public.app_admins (user_id)
values ('UUID_DO_USUARIO_AUTH')
on conflict (user_id) do nothing;
```

## Comandos

```bash
npm install
npm run dev
npm run build
npm run lint
```
