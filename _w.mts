import { fs } from "./src/lib/store";
const desde = new Date(Date.now() - 3 * 60_000).toISOString();
for (let i = 0; i < 40; i++) {
  const r = await fs().collection("sync_log").where("iniciado_em", ">=", desde).orderBy("iniciado_em", "desc").limit(3).get();
  const fin = r.docs.map(d => d.data()).filter(x => x.finalizado_em);
  if (fin.length) { for (const x of fin) console.log("RODOU:", x.iniciado_em, "->", x.finalizado_em, "| verificados", x.processos_verificados, "| novas", x.novas_movimentacoes, "| erros", x.erros, "| pendentes", x.detalhes?.pendentes, JSON.stringify(x.detalhes?.erros ?? [])); process.exit(0); }
  await new Promise(r => setTimeout(r, 30_000));
}
console.log("nenhuma rodada nova em 20 min"); process.exit(0);
