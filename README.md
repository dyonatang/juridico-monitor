# ⚖️ Jurídico Monitor

Acompanhamento processual do grupo: cadastra empresas, CPFs/CNPJs e processos, consulta os tribunais periodicamente, detecta andamentos novos e avisa — pelo dashboard, por e-mail/WhatsApp e pelo Claude (via MCP). Também **importa PDFs** (citações, petições, contratos): guarda o arquivo, lê com IA, encontra o número do processo e cadastra sozinho.

## Arquitetura (Google / Firebase)

```
┌──────────────────────┐  Cloud Scheduler (diário)  ┌───────────────────┐
│ Firebase App Hosting │ ─────────────────────────▶ │ /api/cron/sync     │──▶ DataJud (CNJ, grátis, por nº CNJ)
│ (Next.js / Cloud Run)│                            │                   │──▶ Judit / Escavador (pago, por CPF/CNPJ)
│                      │ ◀──────── webhook ──────── │ /api/webhooks/*    │
│  Dashboard           │                            └────────┬──────────┘
│  /api/mcp ◀──────────┼── Claude (MCP)                      ▼
└──────────────────────┘                            ┌───────────────────┐
                                                    │ Cloud Firestore    │ empresas · documentos · processos
                                                    └───────────────────┘ movimentacoes · alertas · sync_log
```

**Fontes de dados**

| Fonte | Custo | O que faz | Limitação |
|---|---|---|---|
| DataJud (CNJ) | grátis | capa + movimentações de um processo **pelo número** | não busca por CPF/CNPJ; não mostra partes |
| Judit.io | pago | busca e monitora por CPF/CNPJ/CNJ, webhook | contratar em judit.io/planos-api |
| Escavador | pago | idem, API v2 | contratar em escavador.com/business/api |

Sem provedor pago o sistema já funciona: você cadastra os processos pelo número e ele acompanha. Com Judit ou Escavador, ao cadastrar um CNPJ/CPF ele **descobre** os processos sozinho e recebe andamentos por webhook.

## Instalação

### 1. Projeto Firebase
1. https://console.firebase.google.com → *Adicionar projeto* (ex.: `juridico-monitor`). Plano **Blaze** (pague conforme o uso; o Firestore tem cota gratuita generosa — para este volume o custo fica em centavos).
2. *Firestore Database* → Criar banco → modo **produção** → região `southamerica-east1` (São Paulo).
2b. *Storage* → Começar → modo **produção** (guarda os PDFs importados). Anote o nome do bucket (`<projeto>.firebasestorage.app`).
3. *Configurações do projeto → Contas de serviço → Gerar nova chave privada* → baixa um JSON (só para rodar local).

### 2. Rodar local
```bash
npm install
```
Copie `.env.example` para `.env.local`; salve o JSON da conta de serviço como `firebase-key.json` na pasta do projeto (já apontado por `FIREBASE_SERVICE_ACCOUNT_FILE`) e gere os tokens:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
```bash
npm run dev
```
Abra http://localhost:3000 → tela de login (usuário/senha = `DASHBOARD_USER` / `DASHBOARD_PASSWORD`; a sessão dura 30 dias). As coleções do Firestore são criadas automaticamente no primeiro cadastro.

### 3. Publicar — Firebase App Hosting
```bash
npm install -g firebase-tools
firebase login
firebase init apphosting        # conecta ao repositório GitHub desta pasta
```
Depois crie os segredos (um por um):
```bash
firebase apphosting:secrets:set DASHBOARD_USER
```
(repita para `DASHBOARD_PASSWORD`, `SESSION_SECRET`, `MCP_TOKEN`, `CRON_SECRET`, `WEBHOOK_SECRET`, `ANTHROPIC_API_KEY` — e `JUDIT_API_KEY` / `RESEND_API_KEY` se usar). Ajuste `APP_URL` no `apphosting.yaml` para a URL que o App Hosting gerar e faça push — cada push na branch principal publica.

Publique as regras do Firestore (bloqueiam acesso direto de clientes; o servidor usa admin):
```bash
firebase deploy --only firestore:rules
```

### 4. Agendar a sincronização — Cloud Scheduler
Console Google Cloud → *Cloud Scheduler* → Criar job:
- Frequência: `0 6,12,18 * * *` (06h, 12h, 18h) · Fuso `America/Sao_Paulo`
- Alvo: HTTP · `GET https://SEU-APP/api/cron/sync?secret=CRON_SECRET`

### 5. Conectar o Claude (MCP)
Servidor MCP em `https://SEU-APP/api/mcp`, protegido por Bearer token (`MCP_TOKEN`).

**Claude Desktop / Claude.ai → Configurações → Conectores → Adicionar conector personalizado:**
- URL: `https://SEU-APP/api/mcp` · Autenticação: Bearer token = `MCP_TOKEN`

**Claude Code:**
```bash
claude mcp add --transport http juridico https://SEU-APP/api/mcp --header "Authorization: Bearer SEU_MCP_TOKEN"
```

Ferramentas: `resumo_geral`, `alertas_pendentes`, `andamentos_recentes`, `listar_processos`, `detalhes_processo`, `documentos_importados`, `listar_documentos_monitorados`, `cadastrar_documento`, `cadastrar_processo`, `sincronizar_agora`, `marcar_alertas_lidos`.

Para o Claude **te avisar** proativamente, crie uma tarefa agendada no Claude (ex.: todo dia às 8h):
> "Chame `alertas_pendentes` no conector jurídico. Se houver alertas, me envie um resumo e depois marque como lidos."

### 6. Leitura de PDF por IA (recomendado)
Crie uma chave em https://console.anthropic.com → *API keys* e defina `ANTHROPIC_API_KEY`. Com ela, a tela **Importar PDF** lê o documento inteiro (inclusive digitalizado), identifica tipo da peça, partes, resumo, prazos e providência, e vincula à empresa certa. Sem a chave, só extrai números de processo do texto. Modelo padrão `claude-opus-5` (troque com `ANTHROPIC_MODEL`). Custo típico: centavos por documento.

### 7. Notificações (opcional)
- **E-mail**: https://resend.com → `RESEND_API_KEY`, `NOTIFY_EMAIL_FROM`, `NOTIFY_EMAIL_TO`.
- **WhatsApp**: `NOTIFY_WEBHOOK_URL` apontando para um fluxo (n8n, Make, Evolution API, Z-API). O sistema envia `POST { resumo, alertas[] }`.

### 8. Provedor pago (opcional, para busca por CPF/CNPJ)
- Judit: `MONITOR_PROVIDER=judit`, `JUDIT_API_KEY=...`
- Escavador: `MONITOR_PROVIDER=escavador`, `ESCAVADOR_TOKEN=...`

Depois, em **CPFs / CNPJs** clique em *Ativar* nos documentos já cadastrados para criar o tracking e importar os processos existentes.

> ⚠️ O adaptador do Escavador segue a documentação pública v2; confirme os campos de `/monitoramentos` e do callback com o plano contratado. O da Judit segue a doc oficial de `tracking` e `lawsuits`.

### 9. Claude Code (recomendado) — sincronização manual com o jus.br e assistente pelo chat
O DataJud (fonte gratuita) tem atraso em relação ao jus.br oficial — às vezes dias, às vezes meses. Em vez de manter um robô automático rodando sozinho (decisão deliberada: login em conta gov.br pessoal não deve ficar em mãos de um agente sem supervisão), este projeto usa o [Claude Code](https://claude.com/claude-code) como "braço" manual:
1. Instale o Claude Code e abra esta pasta do projeto nele.
2. O arquivo [`.claude/skills/sincronizar-jusbr/SKILL.md`](.claude/skills/sincronizar-jusbr/SKILL.md) já vem no repositório — ele ensina o Claude a comparar os processos com o jus.br e importar o que estiver faltando.
3. No dashboard, o botão **"Sincronizar com jus.br"** (painel principal) abre o portal numa aba nova para você logar com sua própria conta gov.br.
4. Depois de logar, volte ao chat do Claude Code e peça: `/sincronizar-jusbr` (ou "sincronize os processos com o jus.br"). O Claude faz a comparação e a importação ao vivo, usando seu navegador — nunca guarda nem usa sua senha.

> A pasta `agente-jusbr/` (se existir no seu clone) é uma abordagem antiga de robô automático, **abandonada** — não a use; ela não reflete a forma atual (manual) de sincronizar.

## Estrutura

```
src/lib/store.ts             Firestore: coleções, consultas, lotes (única camada que fala com o banco)
src/lib/format.ts            CPF/CNPJ/CNJ: validação, formatação, tribunal ← número
src/lib/providers/           datajud.ts · judit.ts · escavador.ts (interface comum em types.ts)
src/lib/sync.ts              motor: consulta → diff de movimentações → alertas → notificação
src/lib/notify.ts            e-mail (Resend) e webhook
src/lib/repo.ts              cadastros (usados pelo dashboard e pelo MCP)
src/lib/leitor.ts            motor de leitura de PDF: texto local (pdf-parse) + análise estruturada pelo Claude
src/lib/importar.ts          importação de PDF: Storage → leitura → vínculo com empresa → cadastro dos processos
src/lib/jusbr.ts             ingestão do agente jus.br (processos com partes/movimentos + peças em texto)
src/app/api/ingestao         API do agente (GET alvos · POST processo/documento/status)
src/lib/storage.ts           Cloud Storage (PDFs)
src/lib/auth.ts              sessão por cookie assinado (login)
src/app/api/cron/sync        sincronização periódica (Cloud Scheduler)
src/app/api/webhooks/*       callbacks Judit / Escavador
src/app/api/mcp              servidor MCP (Streamable HTTP, Bearer)
src/app/(app)/…              painel · processos · importar · documentos · empresas · alertas
src/app/login                tela de login
src/app/api/arquivos/[id]    download do PDF (exige sessão)
src/components/              sidebar, formulários, pílulas
src/proxy.ts                 exige sessão em todas as telas
apphosting.yaml              config do App Hosting (instâncias, segredos)
firestore.rules              bloqueia acesso direto ao banco
```

## Modelo de dados (Firestore)
- `empresas/{id}` · `documentos/{cpf_ou_cnpj}` · `processos/{numero_cnj}` · `movimentacoes/{numero_cnj}_{hash}` · `alertas/{id}` · `arquivos/{id}` · `sync_log/{id}`
- IDs naturais (número do documento / do processo / hash da movimentação) garantem que nada seja cadastrado ou importado duas vezes.
- Datas em ISO-8601; listas pequenas são ordenadas em memória, por isso **não precisa criar índices compostos**.

## Como o sistema evita alertas falsos
Cada movimentação recebe um hash (data + código + descrição + complemento). Só entra alerta para hash inédito. Na **primeira carga** de um processo gera-se um único alerta-resumo, não um por movimentação.
