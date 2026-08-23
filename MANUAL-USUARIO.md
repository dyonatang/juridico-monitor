# Manual do Usuário — Jurídico Monitor

Guia simples de como usar o sistema no dia a dia. Para instalar e publicar o sistema, veja o [README.md](README.md) (parte técnica).

## O que o sistema faz

Acompanha processos judiciais de pessoas e empresas de um grupo: avisa quando sai uma movimentação nova, guarda os PDFs importantes (petições, decisões, citações) e explica em linguagem simples "como está" cada processo — como se fosse um advogado explicando pro cliente.

## Entrando no sistema

Acesse o endereço do site, informe usuário e senha. A sessão fica válida por 30 dias.

Existem dois perfis de usuário:
- **Administrador**: cadastra, edita e exclui tudo.
- **Leitura**: só consulta — não vê botões de alterar nada.

## Painel principal

Mostra um resumo: quantos processos ativos, quantos CPFs/CNPJs monitorados, alertas pendentes e a última sincronização. O botão **"Sincronizar com jus.br"** abre o portal oficial do jus.br numa aba nova, pra você logar com sua própria conta gov.br — depois disso, peça no chat do Claude Code: `/sincronizar-jusbr` (veja o README, seção 9).

## CPFs / CNPJs

É o cadastro único de pessoas e empresas do grupo que o sistema acompanha. Para cada um:
- Tipo (CPF ou CNPJ), número, nome, apelido interno (ex.: nome fantasia).
- Pode vincular um CPF a um CNPJ (ex.: um sócio a uma empresa do grupo).
- O número aparece mascarado na tela por padrão (ex.: `123.***.***-01`) — clique em "mostrar" pra ver completo.

Clique num item pra ver todos os processos daquela pessoa/empresa.

## Processos

Cada processo tem uma "capa" (tribunal, classe, partes, valor da causa, situação) e, sempre que possível, um quadro **"Como está"** — o resumo em linguagem simples do andamento atual e do que falta acontecer.

Também tem uma seção de **Risco e provisão**: uma classificação (Provável / Possível / Remoto, nos termos contábeis do CPC 25) e um valor provisionado, que o administrador pode preencher pra acompanhar a exposição financeira do grupo.

Botões disponíveis (perfil administrador):
- **Consultar agora**: força uma nova checagem na fonte gratuita (DataJud).
- **Pausar/Retomar**: para de monitorar sem excluir o histórico.
- **Excluir**: remove o processo e tudo relacionado a ele (cuidado, não tem como desfazer).

Cadastrar um processo novo: informe o número CNJ (formato `0000000-00.0000.0.00.0000`) — o sistema busca sozinho tribunal, classe e movimentações na fonte gratuita.

## Importar PDF

Envie um ou mais PDFs (petições, citações, decisões, contratos). O sistema:
1. Extrai o texto e lê com IA (se a leitura por IA estiver configurada).
2. Identifica automaticamente o(s) número(s) de processo, as partes, o tipo de peça e um resumo.
3. Tenta vincular a um CPF/CNPJ do cadastro pelo conteúdo do documento (ou você escolhe manualmente).
4. Cadastra o processo se ele ainda não existir, ou completa dados que estavam faltando.

Se o documento pedir alguma providência (prazo, comparecimento), isso aparece destacado com ⚠️.

## Alertas

Lista tudo que o sistema achou de novo: movimentação nova, processo novo descoberto, documento importado, ou erro numa consulta. Marque como lido individualmente ou tudo de uma vez.

## Usuários (só administrador)

Cria, bloqueia/desbloqueia, exclui usuários e redefine senhas. Sempre precisa existir pelo menos um administrador ativo.

## Auditoria (só administrador)

Registro de quem visualizou ou alterou cada informação — processo, CPF/CNPJ, PDF — e quem fez cada cadastro, edição ou exclusão. Serve para rastrear acesso a informações sensíveis.

## Perguntas comuns

**O sistema atualiza sozinho?**
Sim, automaticamente pela fonte gratuita (DataJud), algumas vezes ao dia. Só a comparação com o jus.br (que é mais rápido, mas exige login pessoal) é manual — veja a seção "Sincronizar com jus.br" acima.

**Posso confiar 100% nos dados?**
Os dados vêm de fontes oficiais (DataJud/CNJ) ou de PDFs reais importados — nunca são inventados. Mesmo assim, esse sistema é uma ferramenta de apoio, não substitui acompanhamento por um advogado.

**Perdi a senha, e agora?**
Peça pra um administrador redefinir sua senha na tela de Usuários.
