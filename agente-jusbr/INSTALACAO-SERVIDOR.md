# Instalação no servidor (.4 → depois .253) — Windows

Resultado final: o Jurídico Monitor rodando no servidor (porta 3000) + o agente jus.br rodando todo dia às 06:00 e alimentando o sistema.

## 0. Pré-requisitos (uma vez)
1. **Node.js 20 LTS**: https://nodejs.org → "LTS" → instalar com as opções padrão.
2. **Git**: https://git-scm.com/download/win → instalar com as opções padrão.
3. Feche e abra o PowerShell depois de instalar.

## 1. Trazer o código
```powershell
mkdir C:\juridico
cd C:\juridico
git clone https://github.com/dyonatang/juridico-monitor.git
cd juridico-monitor
```
(abre uma janela para entrar no GitHub na primeira vez — autorize)

## 2. Copiar os 2 arquivos de segredo do seu PC
Do seu PC (pasta `juridico-monitor`) para `C:\juridico\juridico-monitor\` no servidor:
- `.env.local`
- `firebase-key.json`

Depois, no `.env.local` do servidor, ajuste a linha `APP_URL=` para `http://localhost:3000`.

## 3. Instalar e ligar o sistema
```powershell
cd C:\juridico\juridico-monitor
npm install
npm run build
npm start
```
Abra no navegador do servidor: http://localhost:3000 → tela de login → entre. Se aparecer o painel com os 40 processos, está certo. Deixe essa janela aberta por enquanto (o passo 6 faz iniciar sozinho).

## 4. Instalar o agente
Em **outro** PowerShell:
```powershell
cd C:\juridico\juridico-monitor\agente-jusbr
npm run instalar
copy .env.example .env
notepad .env
```
No `.env`, deixe assim (o token está no `.env.local` do sistema, linha `INGEST_TOKEN=`):
```
SISTEMA_URL=http://localhost:3000
INGEST_TOKEN=<cole aqui o valor de INGEST_TOKEN do .env.local>
PERFIL_DIR=./perfil
HEADLESS=true
BAIXAR_BINARIO=false
MAX_PECAS_POR_RODADA=60
```
Salve e feche.

## 5. Login no gov.br e teste
```powershell
npm run login
```
Abre um navegador: entre com a conta gov.br (CPF, senha, código do app). Quando a tela "Consultar Processos" aparecer, o terminal mostra `✓ login confirmado` e fecha sozinho.

```powershell
npm run testar
```
Esperado: `✓ sistema OK` · `✓ sessão do jus.br ativa` · `✓ API OK`.

Primeira rodada (leva alguns minutos):
```powershell
npm run rodar
```
Ao final imprime `RESUMO {...}`. Volte ao painel (http://localhost:3000): os alertas novos são as peças importadas.

## 6. Deixar tudo automático (Agendador de Tarefas)
Abra **Agendador de Tarefas** (tecla Windows → digite "agendador").

**Tarefa A — sistema sempre ligado**
- Criar Tarefa → Nome `Juridico Monitor` → marcar **Executar estando o usuário conectado ou não** e **Executar com privilégios mais altos**.
- Disparadores → Novo → **Ao iniciar** o computador.
- Ações → Nova → Programa: `cmd.exe` · Argumentos:
  `/c cd /d C:\juridico\juridico-monitor && npm start >> logs-sistema.txt 2>&1`
- Configurações → desmarque "Interromper a tarefa se for executada por mais de…".
- OK → clique com o direito na tarefa → **Executar** (pode fechar a janela do passo 3 depois disso).

**Tarefa B — agente diário**
- Criar Tarefa → Nome `Agente jus.br` → mesmas opções de execução.
- Disparadores → Novo → **Diariamente**, 06:00.
- Ações → Nova → Programa: `cmd.exe` · Argumentos:
  `/c cd /d C:\juridico\juridico-monitor\agente-jusbr && npm run rodar >> logs\agendador.txt 2>&1`
- OK → botão direito → **Executar** para testar.

## Quando a sessão do gov.br cair
O painel mostra o alerta "Sessão do gov.br expirou…". No servidor:
```powershell
cd C:\juridico\juridico-monitor\agente-jusbr
npm run login
```

## Atualizar o sistema quando eu mandar uma versão nova
```powershell
cd C:\juridico\juridico-monitor
git pull
npm install
npm run build
```
e reinicie a tarefa `Juridico Monitor` no Agendador (Finalizar → Executar).

## Migrar para o .253 depois
Repita os passos 0–6 no .253 e copie também a pasta `agente-jusbr\perfil` (sessão gov.br) para não precisar logar de novo. Depois desative as duas tarefas no .4.
