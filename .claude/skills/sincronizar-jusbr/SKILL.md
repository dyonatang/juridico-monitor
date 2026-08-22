---
name: sincronizar-jusbr
description: Compara os processos do Jurídico Monitor com o jus.br (PDPJ) usando a conta gov.br do usuário logada no Chrome, importa movimentações e decisões que estão faltando no Firestore, e reporta o que mudou. Use quando o usuário pedir para "sincronizar com o jus.br", "atualizar os processos manualmente", "rodar o agente do jus.br" ou similar.
---

# Sincronizar com o jus.br

Este projeto é o **Jurídico Monitor** (Next.js + Firebase/Firestore), em
`Caranguejo do Assis - 01 - Arquivos/02 - Diretoria/Claude/Juridico IA/juridico-monitor`.
Ele monitora processos judiciais do grupo (Bar e Restaurante do Assis, Bar Staff, DFV
Participações + CPFs da família) usando o DataJud (API gratuita do CNJ) como fonte
principal. O DataJud tem atraso — às vezes de dias, às vezes de meses — em relação ao
que já está disponível no jus.br (portal oficial do CNJ, PDPJ), que reflete os sistemas
de cada tribunal quase em tempo real.

Este skill existe porque o usuário decidiu explicitamente **não** manter um agente
rodando sozinho (nem 24h, nem em servidor) — o fluxo é sempre disparado por ele e
executado por você, ao vivo, usando a sessão logada do Chrome dele via
`mcp__claude-in-chrome__*`. Nunca proponha construir um agente automático/headless para
isso — já foi decidido contra isso.

**IMPORTANTE — não pule etapas de leitura**: nunca invente ou aproxime texto de
movimentação/decisão. Todo texto gravado no sistema tem que vir exatamente do que foi
lido na tela do jus.br. Se não conseguir confirmar um dado, deixe de fora e avise o
usuário, não adivinhe.

## Passo 0 — carregar as ferramentas do Chrome

Se as ferramentas `mcp__claude-in-chrome__*` aparecerem como "deferred" (sem schema
carregado), use `ToolSearch` com uma única chamada carregando o conjunto:
`select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__find,mcp__claude-in-chrome__form_input,mcp__claude-in-chrome__get_page_text,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__tabs_close_mcp,mcp__claude-in-chrome__browser_batch`

## Passo 1 — abrir o jus.br e confirmar login

1. `tabs_context_mcp({createIfEmpty: true})` para ter uma aba.
2. `navigate` para `https://portaldeservicos.pdpj.jus.br/consulta`.
3. Tire um screenshot. Duas possibilidades:
   - Aparece a tela "gov.br - Acesse sua conta" pedindo CPF → a sessão expirou. **Não
     tente logar você mesmo** (envolve CPF/senha/2FA da conta do usuário — proibido).
     Avise o usuário e peça para ele logar nesse mesmo Chrome. Espere a confirmação
     dele antes de continuar.
   - Aparece "Consultar Processos" com o nome do usuário no canto superior direito
     (ex.: "DYONATAN GIOVANELLI") → já está logado, siga direto.

## Passo 2 — levantar o estado atual do nosso sistema

Rode um script tsx efêmero (delete depois) que lê direto do Firestore via
`src/lib/store.ts`, sem passar pelo Next.js:

```bash
npx tsx --env-file=.env.local <script>.mts
```

O script deve chamar `store.listarProcessos({ apenasAtivos: true })` e
`store.listarDocumentos()`, e imprimir por processo: `numero_cnj`, `numero_formatado`,
`ultima_movimentacao_em`, `total_movimentacoes`, `documento_id`. Isso dá a base de
comparação — **não adivinhe essas datas, leia do Firestore**.

## Passo 3 — buscar no jus.br por CPF/CNPJ (não por processo, um por um)

A forma eficiente é buscar por **CPF da Parte** / **CNPJ da Parte** (não por "Número do
Processo"), porque cada busca já lista TODOS os processos daquela pessoa/empresa com a
coluna "Data Último Movimento" — muito mais rápido que abrir processo por processo.

Na tela de consulta:
1. Clique no dropdown "Pesquisar por" → escolha "CPF da Parte" ou "CNPJ da Parte".
2. Use `find` para achar o campo de input (o texto do placeholder muda conforme o tipo
   escolhido), `form_input` para preencher o CPF/CNPJ formatado (ex.:
   `134.160.117-08` ou `40.502.207/0001-89`), clique em "Buscar".
3. Leia a tabela de resultados com `get_page_text` — ela já traz "Data Último
   Movimento" por processo, direto, sem precisar abrir cada um.

Repita para cada CPF/CNPJ cadastrado em `/documentos` do sistema (hoje: 5 CPFs da
família + os CNPJs das empresas do grupo — confira a lista atual em `/documentos` do
dashboard, não assuma que é sempre a mesma).

## Passo 4 — comparar e listar as divergências

Para cada processo, compare a "Data Último Movimento" do jus.br com o
`ultima_movimentacao_em` do nosso sistema (passo 2). Classifique:
- **Bate certinho** → nada a fazer.
- **Sistema atrasado** (jus.br tem data mais recente) → precisa sincronizar.
- **Zero movimentações no sistema** (`total_movimentacoes: 0` ou campo ausente) mas
  jus.br tem histórico → precisa importar tudo.
- **Sistema com data mais recente que o jus.br** → não corrija sem investigar; pode ser
  processo com mais de uma tramitação/grau (o DataJud mescla graus, a lista do jus.br
  às vezes mostra só uma tramitação por vez — veja o passo 5).

## Passo 5 — abrir e extrair de cada processo divergente

1. Busque por "Número do Processo" (formato `0000000-00.0000.0.00.0000`).
2. Se aparecer "Selecione abaixo a tramitação que deseja visualizar" com mais de uma
   linha, o processo tem mais de um grau (ex.: 1º grau + STJ). Abra **cada
   tramitação relevante** — normalmente a mais recente é a que importa, mas confira
   todas se a data não bater.
3. Clique na linha → abre uma nova aba (`autosdigitais?processo=...`).
4. Aba "Movimentos": `get_page_text` já traz a lista completa com data + descrição de
   cada andamento. Copie tudo que for mais recente que o `ultima_movimentacao_em`
   atual do processo (ou tudo, se for um processo zerado).
5. Aba "Documentos": veja quais documentos têm nome substantivo — **Decisão**,
   **Despacho**, **Sentença**, **Acórdão**, **Ementa** — e ignore os puramente
   protocolares (Termo de Ciência, Certidão de Publicação, Termo de Disponibilização,
   Ato ordinatório) a menos que o usuário peça o histórico completo.
6. Clique no documento substantivo pra carregar no visualizador, então:
   `get_page_text`.
   - **Se o texto do documento aparecer** (comum em PDFs renderizados via PDF.js, que
     têm uma camada de texto no DOM principal): pronto, use esse texto — vem completo,
     sem corte.
   - **Se o texto NÃO aparecer** (comum em documentos `.html`, que o jus.br renderiza
     dentro de um web component `<app-html-viewer>` com Shadow DOM — `get_page_text`
     não enxerga dentro de Shadow DOM): aplique este workaround, que resolve o
     problema de truncamento de uma vez por todas —
     ```js
     const el = document.querySelector('app-html-viewer');
     const div = [...el.shadowRoot.children].find(c => c.tagName === 'DIV');
     const holder = document.createElement('div');
     holder.id = '__extract__';
     holder.innerText = div.innerText;
     document.body.appendChild(holder);
     holder.innerText.length; // só pra conferir que não é 0
     ```
     rode via `javascript_tool` (o retorno dessa chamada TRUNCA em ~1000-1100
     caracteres — nunca tente retornar o texto direto por aqui). Depois disso, chame
     `get_page_text` de novo: agora o texto injetado está na luz do DOM principal e
     sai **completo**, sem limite de tamanho.
7. Repita para cada documento substantivo relevante do período que está faltando.

## Passo 6 — montar o JSON e gravar no Firestore

1. Use o `Write` tool pra criar um arquivo JSON (nunca heredoc do Bash — no Windows,
   heredoc corrompe acentuação UTF-8 e já causou dado com `�` em produção antes).
   Formato, chaveado por `numero_cnj` (20 dígitos, sem formatação):
   ```json
   {
     "00138304620118080035": {
       "fonte": "jusbr",
       "arquivar": false,
       "movimentos": [
         { "data": "2026-07-24", "descricao": "texto exato lido do jus.br" }
       ],
       "documento": {
         "nome": "nome do documento",
         "juntado_em": "2026-07-01",
         "resumo": "resumo seu, 2-4 frases, do que o documento decidiu de fato",
         "texto": "texto integral extraído, real, sem paráfrase"
       }
     }
   }
   ```
   `arquivar: true` quando o movimento mostrar "Arquivado Definitivamente" — isso marca
   `ativo: false` no processo (não precisa mais monitorar).
   `documento` é opcional — só inclua se achou algo substantivo pra aquele processo.

2. Escreva um script tsx efêmero que lê esse JSON e, pra cada entrada:
   - `store.getProcesso(numero)` — se não achar, o numero_cnj está errado, confira os
     dígitos (é fácil errar um dígito ao contar manualmente).
   - `store.hashesDoProcesso(processo.id)` pra saber quais já existem.
   - Gera hash de cada movimento com a MESMA função do `src/lib/sync.ts`:
     `sha256("${dataHora}|${codigo??""}|${descricao}|${complemento??""}")`, usando
     `dataHora = "${data}T12:00:00.000Z"` (meio-dia UTC como convenção neutra pra
     movimentos sem horário exato — o jus.br não mostra horário na lista).
   - `store.inserirMovimentacoes(...)` só com os que não existem ainda (dedup automático
     por hash — rodar o script duas vezes é seguro, não duplica).
   - `store.atualizar("processos", processo.id, { ultimo_check, ultimo_erro: null,
     total_movimentacoes, ultima_movimentacao_em, ...(arquivar ? {ativo:false} : {}) })`.
   - Se tiver `documento`, `store.inserirAlertas([{ tipo: "nova_movimentacao",
     processo_id, documento_id: processo.documento_id, titulo, mensagem: resumo +
     "\n\n--- Texto integral ---\n" + texto }])` — só se `inseridas.length > 0` (não
     duplica alerta em reruns).
3. Rode com `npx tsx --env-file=.env.local <script>.mts`.
4. Confira a saída: cada processo deve mostrar quantas movimentações novas entraram e
   qual ficou sendo a última data.
5. Apague o script `.mts` e o JSON temporários (`rm`) — não fazem parte do repositório,
   são só o meio de transporte pra essa sincronização pontual. `git status --short`
   deve voltar limpo depois.

## Passo 7 — reportar pro usuário

Feche as abas do Chrome que não precisar mais (deixe a de consulta principal aberta,
caso o usuário queira olhar algo). Escreva um resumo curto e direto:
- Quantos processos bateram certinho vs. quantos precisaram de sincronização.
- Pra cada um que mudou: o que aconteceu de fato (não só "teve movimentação" — diga o
  resultado: ganhou, perdeu, foi arquivado, está pendente de quê).
- Destaque decisões que afetam dinheiro ou risco real (valores de causa, liminares,
  prazos) — isso é o que interessa de verdade pro usuário, não a lista burocrática de
  "Termo de Ciência".

## O que NÃO fazer

- Não logar na conta gov.br do usuário por ele.
- Não propor voltar a construir um agente automático/headless — já foi decidido que o
  fluxo é sempre manual, disparado pelo usuário, executado por você ao vivo.
- Não inventar texto de movimentação ou decisão — sempre o texto real extraído.
- Não usar heredoc do Bash pra gravar conteúdo com acentuação — use o `Write` tool.
- Não deixar scripts `.mts`/`.json` temporários no repositório depois de terminar.
