/**
 * Avaliação da semana para o resumo de segunda-feira (função pura, testável sem Firebase).
 *
 * Só conta como problema o que exige atenção — oscilação do CNJ que se resolve sozinha
 * em poucas horas fica de fora:
 *  - processo AINDA atrasado (>6h sem verificação) na rodada mais recente;
 *  - processo que ficou atrasado sem interrupção a ponto de passar de 24h sem verificação;
 *  - 3+ rodadas que começaram e nunca terminaram;
 *  - 3+ horas sem nenhuma rodada (agendador parado).
 */
const HORAS_SEMANA = 7 * 24;
const HORA = 3600_000;
const TOLERANCIA_HORAS_SEM_RODADA = 2;
const TOLERANCIA_INACABADAS = 2;
// "atrasado" já significa 6h sem verificação; 18h seguidas na lista = mais de 24h sem verificação.
const HORAS_SEGUIDAS_ATRASO_LONGO = 18;

function numeroDe(p) {
  return typeof p === "string" ? p : p?.numero ?? JSON.stringify(p);
}

/** @param registros documentos do sync_log ({iniciado_em, finalizado_em, erros, detalhes}) */
function avaliarSemana(registros, fim) {
  const rodadas = registros
    .map((r) => ({ ...r, t: Date.parse(r.iniciado_em) }))
    .filter((r) => !Number.isNaN(r.t))
    .sort((a, b) => a.t - b.t);

  const horas = new Set();
  let inacabadas = 0;
  let comErro = 0;
  const seguidos = new Map(); // processo -> início da sequência atual em que aparece atrasado
  const atrasoLongo = new Map(); // processo -> maior sequência (horas)
  let ultimaConcluida = null;

  for (const r of rodadas) {
    horas.add(Math.floor(r.t / HORA));
    if (r.erros > 0) comErro++;
    if (!r.finalizado_em) {
      if (fim - r.t > HORA) inacabadas++;
      continue; // rodada sem fim não diz nada sobre quem está atrasado
    }
    ultimaConcluida = r;
    const agora = new Set((r.detalhes?.atrasados ?? []).map(numeroDe));
    for (const p of [...seguidos.keys()]) if (!agora.has(p)) seguidos.delete(p);
    for (const p of agora) {
      if (!seguidos.has(p)) seguidos.set(p, r.t);
      const h = (r.t - seguidos.get(p)) / HORA;
      if (h >= HORAS_SEGUIDAS_ATRASO_LONGO) atrasoLongo.set(p, Math.max(atrasoLongo.get(p) ?? 0, h));
    }
  }

  const aindaAtrasados = (ultimaConcluida?.detalhes?.atrasados ?? []).map(numeroDe);
  const horasSemRodada = Math.max(0, HORAS_SEMANA - horas.size);

  const problemas = [];
  if (aindaAtrasados.length) {
    problemas.push(`${aindaAtrasados.length} processo(s) continuam há mais de 6h sem verificação agora (${aindaAtrasados.join(", ")})`);
  }
  const longosJaResolvidos = [...atrasoLongo.keys()].filter((p) => !aindaAtrasados.includes(p));
  if (longosJaResolvidos.length) {
    problemas.push(`${longosJaResolvidos.length} processo(s) ficaram mais de 24h sem verificação durante a semana, já normalizados (${longosJaResolvidos.join(", ")})`);
  }
  if (inacabadas > TOLERANCIA_INACABADAS) problemas.push(`${inacabadas} rodada(s) começaram e não terminaram`);
  if (horasSemRodada > TOLERANCIA_HORAS_SEM_RODADA) problemas.push(`${horasSemRodada} hora(s) sem nenhuma atualização`);

  return {
    problemas,
    resumo: {
      rodadas: rodadas.length,
      horas_com_rodada: horas.size,
      rodadas_com_erro_pontual: comErro,
      rodadas_inacabadas: inacabadas,
      ainda_atrasados: aindaAtrasados.length,
    },
  };
}

module.exports = { avaliarSemana, HORAS_SEMANA, HORA };
