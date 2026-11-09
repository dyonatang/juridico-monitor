/**
 * Tela de espera mostrada NA HORA do clique, enquanto o servidor busca os dados.
 * O menu lateral continua na tela; só a área central troca por este esqueleto.
 * Sem isso, o clique parecia "não pegar" durante ~1s.
 */
export default function Carregando() {
  return (
    <div className="carregando" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      <div className="esq esq-titulo" />
      <div className="esq esq-sub" />
      <div className="esq esq-bloco" />
      <div className="esq esq-bloco" />
    </div>
  );
}
