---
name: revisar-rescisao
description: Analisa o desligamento de um funcionário do grupo (pedido de demissão, dispensa, ou pedido de demissão de empregada com estabilidade) e avisa se há risco de nulidade, verbas em aberto ou reversão em ação trabalhista. Use quando o usuário pedir para "revisar uma rescisão", "essa funcionária pode processar a gente por causa disso", "ela tem estabilidade", "o desligamento foi certo" ou similar, antes ou depois de um desligamento acontecer.
---

# Revisar rescisão de funcionário

Este skill existe porque desligamentos malfeitos — principalmente de empregados com
**estabilidade** (garantia de emprego) — são a origem mais comum das ações trabalhistas
que esse grupo enfrenta (ver casos já registrados no Jurídico Monitor, ex.: Erika
Cristine Cantanhede vs Bar Staff). A convenção coletiva aplicável ao grupo é a do
**Sindbares/Sintrahoteis** — sempre considere as cláusulas dela, não só a CLT genérica.

**IMPORTANTE — não pule etapas de leitura**: nunca invente fato que o usuário não
confirmou (datas, se assinou termo, se teve testemunha). Se faltar informação decisiva,
pergunte antes de dar o parecer — não adivinhe.

## Passo 1 — levantar os fatos

Pergunte (ou leia do que já foi enviado) o que falta destes pontos:
1. Data de admissão, cargo, data do desligamento.
2. Tipo de saída: pedido de demissão do próprio funcionário, dispensa sem justa causa,
   dispensa com justa causa, ou acordo (art. 484-A CLT)?
3. **A funcionária tem alguma garantia de emprego?** Pergunte especificamente:
   - Está grávida, ou poderia estar (mesmo que não soubesse na hora)?
   - É membro da CIPA (titular ou suplente) ou foi eleita há menos de 1 ano?
   - Sofreu acidente de trabalho nos últimos 12 meses?
   - É dirigente sindical?
   - Está a menos de X meses da aposentadoria conforme a convenção coletiva?
4. Se foi pedido de demissão: teve assistência do sindicato ou da SRTE/superintendência
   do trabalho na hora de assinar? Tem testemunha ou carta de próprio punho?
5. Tempo de casa — mais ou menos de 1 ano (define se homologação era obrigatória antes
   da reforma trabalhista, e se ainda assim a convenção coletiva exige).
6. Documentos existentes: carta de próprio punho, aviso prévio, TRCT, exame demissional,
   comunicações (WhatsApp/e-mail) sobre o desligamento.

## Passo 2 — o que a lei exige nesse tipo de caso

Aplique o que for pertinente aos fatos coletados — não recite tudo genericamente:

- **Estabilidade da gestante** (art. 10, II, "b", ADCT + Súmula 244 do TST): vale da
  confirmação da gravidez até 5 meses após o parto, **mesmo que a empresa não soubesse**
  da gravidez na hora da dispensa (item I da Súmula 244). Vale também durante aviso
  prévio indenizado (item III).
- **Validade do pedido de demissão de quem tem estabilidade** (art. 500 CLT): só é
  válido se feito **com assistência do respectivo sindicato** ou, na falta deste, de
  autoridade do Ministério do Trabalho (hoje SRTE/superintendência regional). Sem essa
  assistência, o pedido pode ser anulado pelo juiz — a empregada volta a ter direito à
  estabilidade (reintegração, ou indenização do período estabilitário se a reintegração
  não for mais possível).
- **CIPA** (art. 165 CLT, Súmula 339 TST): estabilidade do registro da candidatura até 1
  ano após o fim do mandato.
- **Acidente de trabalho** (art. 118, Lei 8.213/91): estabilidade de 12 meses após o
  fim do auxílio-doença acidentário, independente de pagamento de FGTS/indenização.
- **Convenção coletiva Sindbares/Sintrahoteis**: confira se ela impõe algo a mais
  (homologação obrigatória, prazo de quitação, multa por atraso) — não assuma que só a
  CLT genérica vale.

## Passo 3 — dar o parecer

Escreva como um advogado explicando pro cliente, no mesmo tom usado no `resumo_status`
do sistema (direto, sem juridiquês, 4-8 frases):
- Diga se o desligamento como foi feito é válido ou tem risco de nulidade, e por quê
  (cite o artigo/súmula só brevemente, o foco é a consequência prática).
- Se tiver risco, diga o tamanho dele em termos práticos: reintegração? indenização do
  período estabilitário? Quanto tempo de salário isso representa, se der pra estimar?
- Diga o que fazer agora pra reduzir o risco (ex.: regularizar com assistência sindical
  retroativa não resolve — nesse caso, diga que a saída é negociar um acordo, ou se
  preparar pra defesa mostrando que o desligamento foi por outro motivo legítimo).
- Se não houver garantia de emprego nem outro problema aparente, diga isso com a mesma
  clareza — não infle risco que não existe.

## Passo 4 — registrar no sistema (se for sobre um processo já cadastrado)

Se a pergunta for sobre uma ação trabalhista que já está no Jurídico Monitor:
1. `store.getProcesso(numero)` pra confirmar qual é.
2. Atualize `resumo_status` com o parecer do Passo 3 (use `store.atualizar("processos",
   numero, { resumo_status: "..." })` num script `.mts` efêmero — apague depois).
3. Se identificar pontos que ainda precisam ser provados (ex.: "se a gravidez já era
   perceptível na dispensa", "se houve assistência sindical no pedido de demissão"),
   registre como `pontos_controvertidos` (mesmo formato usado no caso da Maxxi) em vez
   de só deixar no texto solto — isso alimenta a tela "Pontos controvertidos" do
   processo.
4. Se o parecer mudar a avaliação de risco, sugira (não decida sozinho) uma
   `classificacao_risco` (provável/possível/remoto, CPC 25) — pergunte ao usuário antes
   de gravar, já que isso tem efeito contábil.

## O que NÃO fazer

- Não invente data, documento ou fato que o usuário não confirmou.
- Não dê o parecer sem saber se há alguma garantia de emprego envolvida — isso muda tudo.
- Não trate isso como uma opinião jurídica definitiva e vinculante — deixe claro que é
  uma análise de apoio, e que casos com valor alto ou risco real merecem confirmação de
  um advogado antes de qualquer decisão final.
- Não grave `classificacao_risco` no banco sem o usuário confirmar — só sugira.
