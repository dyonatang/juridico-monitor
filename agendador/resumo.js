/**
 * Avaliação da semana para o resumo de segunda-feira (função pura, testável sem Firebase).
 *
 * Só conta como problema o que exige atenção — oscilação do CNJ que se resolve sozinha
 * em poucas horas fica de fora:
 *  - processo AINDA atrasado (>14h sem verificação) na rodada mais recente;
 *  - processo que ficou atrasado sem interrupção a ponto de passar de 24h sem verificação;
 *  - 3+ rodadas que começaram e nunca terminaram;
 *  - 2+ janelas do robô (6h e 18h) sem nenhuma rodada (agendador parado).
 * v2.1 (12/11/2026): o robô deixou de rodar de hora em hora e passou a 2 janelas por dia.
 */
const HORAS_SEMANA = 7 * 24;
const HORA = 3600_000;
const DIA = 24 * HORA;
const TOLERANCIA_JANELAS_SEM_RODADA = 1;
const TOLERANCIA_INACABADAS = 2;
// "atrasado" já significa 14h sem verificação; 10h seguidas na lista = mais de 24h sem verificação.
const HORAS_SEGUIDAS_ATRASO_LONGO = 10;
// Janelas do robô em UTC: 6h e 18h de Brasília (UTC-3, sem horário de verão desde 2019).
const JANELAS_UTC = [9, 21];

/** Quantas janelas do robô dentro do período não tiveram nenhuma rodada. */
function janelasSemRodada(rodadas, inicio, fim) {
  let faltas = 0;
  let total = 0;
  for (let d = Math.floor(inicio / DIA) * DIA; d < fim; d += DIA) {
    for (const h of JANELAS_UTC) {
      const a = d + h * HORA;
      const b = a + HORA;
      if (a < inicio || b > fim) continue; // janela fora do período ou ainda em curso
      total++;
      if (!rodadas.some((r) => r.t >= a && r.t < b)) faltas++;
    }
  }
  return { faltas, total };
}

function numeroDe(p) {
  return typeof p === "string" ? p : p?.numero ?? JSON.stringify(p);
}

/** @param registros documentos do sync_log ({iniciado_em, finalizado_em, erros, detalhes}) */
function avaliarSemana(registros, fim) {
  const rodadas = registros
    .map((r) => ({ ...r, t: Date.parse(r.iniciado_em) }))
    .filter((r) => !Number.isNaN(r.t))
    .sort((a, b) => a.t - b.t);

  let inacabadas = 0;
  let comErro = 0;
  const seguidos = new Map(); // processo -> início da sequência atual em que aparece atrasado
  const atrasoLongo = new Map(); // processo -> maior sequência (horas)
  let ultimaConcluida = null;

  for (const r of rodadas) {
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
  const janelas = janelasSemRodada(rodadas, fim - HORAS_SEMANA * HORA, fim);

  const problemas = [];
  if (aindaAtrasados.length) {
    problemas.push(`${aindaAtrasados.length} processo(s) continuam há mais de 14h sem verificação agora (${aindaAtrasados.join(", ")})`);
  }
  const longosJaResolvidos = [...atrasoLongo.keys()].filter((p) => !aindaAtrasados.includes(p));
  if (longosJaResolvidos.length) {
    problemas.push(`${longosJaResolvidos.length} processo(s) ficaram mais de 24h sem verificação durante a semana, já normalizados (${longosJaResolvidos.join(", ")})`);
  }
  if (inacabadas > TOLERANCIA_INACABADAS) problemas.push(`${inacabadas} rodada(s) começaram e não terminaram`);
  if (janelas.faltas > TOLERANCIA_JANELAS_SEM_RODADA) problemas.push(`${janelas.faltas} de ${janelas.total} janela(s) do robô (6h/18h) sem nenhuma atualização`);

  return {
    problemas,
    resumo: {
      rodadas: rodadas.length,
      janelas: janelas.total,
      janelas_sem_rodada: janelas.faltas,
      rodadas_com_erro_pontual: comErro,
      rodadas_inacabadas: inacabadas,
      ainda_atrasados: aindaAtrasados.length,
    },
  };
}

module.exports = { avaliarSemana, HORAS_SEMANA, HORA };
