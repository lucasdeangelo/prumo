# Prumo em produção numa máquina só (Fedora + Docker)

O app, o bot do WhatsApp, o modelo local (Ollama), o nginx, o túnel da Cloudflare e as tarefas agendadas rodam em containers num único `docker compose`. O banco e o login continuam no **Supabase Cloud**.

```
Internet ──HTTPS──▶ Cloudflare ──túnel──▶ cloudflared ──▶ nginx :80 ──▶ app :3000 ──▶ Supabase Cloud
Rede de casa ──http://fedora:8080──────────────────────▶ nginx                       ▲
                                         bot (WhatsApp) ──http://app:3000────────────┘
                                         bot ──▶ ollama :11434
                                         tasks (cron) ──▶ app /api/cron · pg_dump ──▶ ./backups
```

Nenhuma porta do roteador precisa ser aberta. Só o nginx publica uma porta (8080), e apenas na rede local.

| Serviço | O que faz | Dados persistentes |
| --- | --- | --- |
| `app` | Telas, ações do servidor, `/api` (webhook do Pluggy, API do bot, cron) | — |
| `nginx` | Entrada única: rede local e origem do túnel; cabeçalhos de segurança | — |
| `cloudflared` | Endereço público HTTPS (perfil `public`) | — |
| `bot` | WhatsApp (whatsapp-web.js + Chromium) | volume `prumo_bot-data` (sessão) |
| `ollama` / `ollama-pull` | Modelo pequeno do bot; o segundo só baixa o modelo | volume `prumo_ollama-models` |
| `tasks` | 08:00 lembretes; 03:30 backup do banco | `deploy/backups/` |

---

## 1. Preparar o Fedora

Docker CE (o compose deste projeto foi testado com Docker, não com Podman):

```bash
sudo dnf -y install dnf-plugins-core
sudo dnf config-manager addrepo --from-repofile=https://download.docker.com/linux/fedora/docker-ce.repo
sudo dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"   # depois saia e entre de novo na sessão
```

Em Fedora mais antigo (dnf 4), o segundo comando é `sudo dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo`.

O SELinux pode continuar ativo: os arquivos montados nos containers já usam o rótulo `:Z`.

Para a máquina não suspender (servidor 24/7):

```bash
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target
```

## 2. Baixar o projeto e configurar

```bash
git clone https://github.com/lucasdeangelo/prumo.git
cd prumo/deploy
cp .env.example .env
chmod 600 .env
```

Preencha o `deploy/.env` (cada item está comentado no arquivo). Para os segredos:

```bash
openssl rand -hex 32
```

- `INTERNAL_API_SECRET`, `CRON_SECRET`, `PLUGGY_WEBHOOK_SECRET`: um valor novo para cada. Em produção, não reaproveite os de desenvolvimento.
- `SUPABASE_DB_URL`: Supabase › Project Settings › Database › Connection string › **Session pooler**. A conexão direta (`db.xxx.supabase.co`) é só IPv6 e costuma falhar em internet doméstica.

## 3. Cloudflare Tunnel (endereço público)

Pré-requisito: um domínio gerenciado pela Cloudflare (plano gratuito).

1. Cloudflare › **Zero Trust** › Networks › **Tunnels** › Create a tunnel › *Cloudflared*.
2. Dê um nome (ex.: `prumo`) e copie o **token** mostrado no comando de instalação (o texto longo depois de `--token`). Cole em `TUNNEL_TOKEN` no `.env`. Não instale nada no Fedora: o container `cloudflared` faz isso.
3. Em **Public Hostname**: subdomínio `prumo`, domínio `seudominio.com.br`, Service **HTTP** e URL **`nginx:80`**.
4. Use o mesmo endereço em `APP_URL` (ex.: `https://prumo.seudominio.com.br`).

Para rodar só na rede de casa, deixe `COMPOSE_PROFILES=` vazio. Nesse caso, a sincronização com o Pluggy fica manual (sem webhook).

## 4. Supabase (login)

Supabase › Authentication › **URL Configuration**:

- Site URL: o `APP_URL`.
- Redirect URLs: `APP_URL/**` (ex.: `https://prumo.seudominio.com.br/**`).

Opcional, mas recomendado: Authentication › SMTP Settings com um provedor de e-mail. O envio padrão do Supabase tem limite baixo por hora (confirmação de cadastro, recuperação de senha).

As migrações já aplicadas continuam valendo. Para aplicar novas migrações a partir do Fedora, use `npx supabase db push` numa máquina com Node, ou rode do seu computador de desenvolvimento.

## 5. Subir

```bash
cd prumo/deploy
docker compose up -d --build
docker compose ps
curl -fsS http://localhost:8080/api/health    # {"ok":true}
```

O primeiro build leva alguns minutos. O `ollama-pull` baixa o modelo (cerca de 1,3 GB para `llama3.2:1b`) e termina sozinho. Para rodar sem IA, use `AI_ENABLED=false`: o bot continua funcionando com regras.

Abra `APP_URL` no celular e entre com a sua conta.

## 6. WhatsApp do bot

**Vincular um número novo:**

```bash
docker compose logs -f bot
```

Leia o QR code no WhatsApp (Aparelhos conectados › Conectar aparelho). A sessão fica no volume `prumo_bot-data` e sobrevive a reinícios e atualizações.

**Trazer a sessão que já existe** (para não ler o QR de novo). Pare o bot na outra máquina antes: duas cópias da mesma sessão rodando ao mesmo tempo derrubam uma à outra. Copie a pasta da sessão (`~/.prumo-bot/session` ou, nas versões antigas, `bot/session`) para o Fedora, por exemplo em `~/prumo-session`, e rode:

```bash
docker compose stop bot
docker run --rm -v prumo_bot-data:/data -v ~/prumo-session:/src:ro,Z alpine \
  sh -c 'mkdir -p /data/session && cp -a /src/. /data/session/ && chown -R 1000:1000 /data'
docker compose start bot
docker compose logs -f bot   # deve aparecer "✅ Bot Prumo conectado!" sem pedir QR
```

Se o bot pedir QR mesmo assim, a sessão copiada não serviu. Leia o QR uma vez e pronto.

## 7. Webhook do Pluggy (atualização automática)

Com o túnel no ar e `PLUGGY_WEBHOOK_SECRET` preenchido (`docker compose up -d app` depois de mudar o `.env`):

```bash
cd prumo/deploy
docker run --rm --env-file .env -v "$PWD/../scripts:/s:ro,Z" node:22-alpine \
  sh -c 'node /s/pluggy-webhook.mjs "$APP_URL"'
```

Saída esperada: `Registrado: https://…/api/webhooks/pluggy`. A partir daí, quando o MeuPluggy fizer a atualização diária, o Prumo sincroniza sozinho. O webhook vale para o cliente Pluggy inteiro: o ambiente de desenvolvimento passa a não receber eventos, o que é o esperado.

## 8. Backups

Todo dia às 03:30, `deploy/backups/prumo-AAAA-MM-DD.dump` (schemas `public` e `auth`), guardando os últimos `BACKUP_KEEP_DAYS` dias.

Testar agora:

```bash
docker compose exec tasks backup.sh
ls -lh backups/
```

Copie essa pasta para outro lugar de tempos em tempos (outro disco ou a nuvem). Um backup que só existe no servidor some junto com ele.

Restaurar num banco vazio, com cuidado: sobrescreve dados.

```bash
docker run --rm -it -v "$PWD/backups:/b:ro,Z" postgres:17-alpine \
  pg_restore --no-owner --clean --if-exists -d 'postgresql://…' /b/prumo-AAAA-MM-DD.dump
```

## 9. Atualizar

```bash
cd prumo
git pull
cd deploy
docker compose up -d --build
docker image prune -f
```

Se a atualização trouxer migrações (`supabase/migrations`), aplique antes de subir o app novo.

## 10. Desenvolvimento x produção

O Supabase Cloud passa a ser o banco de **produção**. Para desenvolver sem mexer nos dados reais, use o Supabase local (`npx supabase start` e a configuração `prumo-local`, porta 3100) e as contas de teste.

## Problemas comuns

| Sintoma | O que ver |
| --- | --- |
| Página não abre pelo domínio | `docker compose logs cloudflared`; no painel do túnel, o Public Hostname precisa apontar para `http://nginx:80` |
| Erro 1033 / logs com "failed to dial … quic" | A rede bloqueia QUIC (UDP 7844). O compose já usa HTTP/2 (`TUNNEL_TRANSPORT_PROTOCOL=http2`); num túnel manual, passe `--protocol http2` |
| Ações dão erro "Server Action not found" depois de atualizar | Recarregue a página (Ctrl+Shift+R): a aba aberta era da versão anterior |
| Login funciona na rede local, mas o link do e-mail leva ao domínio | É o esperado: os e-mails usam o `APP_URL` |
| Bot reinicia em loop | `docker compose logs bot`. "Profile in use" se resolve sozinho no próximo início; outra cópia da sessão rodando em outra máquina derruba esta |
| Lembretes não chegam | `docker compose logs tasks` (08:00) e se o WhatsApp está vinculado em Ajustes |
| Backup falha | `SUPABASE_DB_URL` precisa ser a do **Session pooler**, com a senha do banco |

## Limites conhecidos

- O limite de tentativas (convite, vínculo do WhatsApp) e os dados do casal (guardados por 1 minuto para acelerar as páginas) ficam na memória do app. Com um container, isso basta. Para rodar mais de uma réplica, os dois precisam ir para o banco.
- O projeto do Supabase está em `ca-central-1` (Canadá): cada consulta leva de 150 a 450 ms a partir do Brasil. Em `sa-east-1` (São Paulo) seria de 20 a 50 ms.
- O plano gratuito do MeuPluggy cobre só os dados do próprio titular: cada pessoa do casal conecta o seu.
