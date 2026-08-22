# Agente jus.br

Robô que entra no **jus.br** (Portal de Serviços do PJe) com o login gov.br do Dyonatan, varre os CPFs/CNPJs cadastrados no Jurídico Monitor, descobre processos novos, atualiza movimentações e **baixa as peças** (decisões, sentenças, petições) para o sistema — que lê com IA, resume e gera alerta. Roda sozinho, todo dia, sem depender de ninguém.

## Instalação no servidor (Windows ou Linux, Node 20+)

```bash
cd agente-jusbr
npm run instalar          # instala dependências + navegador Chromium
copy .env.example .env    # (Linux: cp)
```
Edite `.env`: `SISTEMA_URL` (endereço do Jurídico Monitor) e `INGEST_TOKEN` (o mesmo do sistema).

### Login no gov.br (uma vez)
```bash
npm run login
```
Abre um navegador; entre com a conta gov.br (senha + código do app). Quando aparecer a tela "Consultar Processos", o agente confirma e salva a sessão na pasta `perfil/`. **Não apague essa pasta.**

### Teste
```bash
npm run testar
```
Confere: sistema acessível → sessão ativa → API do jus.br respondendo.

### Rodada manual
```bash
npm run rodar
```

## Agendar todo dia

**Windows (Agendador de Tarefas):** Criar Tarefa Básica → Diariamente 06:00 → Ação "Iniciar um programa":
- Programa: `cmd.exe`
- Argumentos: `/c cd /d "C:\caminho\agente-jusbr" && npm run rodar >> logs\agendador.log 2>&1`
- Marque "Executar estando o usuário conectado ou não".

**Linux (cron):**
```
0 6 * * * cd /opt/agente-jusbr && /usr/bin/npm run rodar >> logs/cron.log 2>&1
```

## Quando a sessão do gov.br expira
O agente detecta, **gera um alerta no sistema** ("Sessão do gov.br expirou…") e sai com código 2. Basta acessar o servidor e rodar `npm run login` de novo.

## Códigos de saída
`0` ok · `1` terminou com erros (veja `logs/`) · `2` sessão expirada

## O que ele envia ao sistema
- `POST /api/ingestao {tipo:"processo"}` — capa, partes (com CPF/CNPJ → vincula à empresa certa), movimentos
- `POST /api/ingestao {tipo:"documento"}` — texto da peça (+ arquivo original se `BAIXAR_BINARIO=true`)
- `POST /api/ingestao {tipo:"status"}` — resumo da rodada ou erro

Limites por rodada: `MAX_PECAS_POR_RODADA` (padrão 60) — no primeiro dia, com ~40 processos, pode levar algumas rodadas para importar todo o histórico de peças.
