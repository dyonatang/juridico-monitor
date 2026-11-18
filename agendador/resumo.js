/**
 * Avaliação da semana para o resumo de segunda-feira (função pura, testável sem Firebase).
 *
 * Só conta como problema o que exige atenção — oscilação do CNJ que se resolve sozinha
 * em poucas horas fica de fora:
 *  - processo AINDA atrasado (>30h sem verificação) na rodada mais recente;
 *  - processo que continuou atrasado na manhã seguinte (mais de 2 dias sem verificação);
 *  - 3+ rodadas que começaram e nunca terminaram;
 *  - 2+ janelas do robô (4h–10h ou 19h–23h) sem nenhuma rodada (agendador parado).
 * v2.2 (16/11/2026): os andamentos passaram a ser consultados uma vez por dia, das 4h às 10h.
 * v2.3 (18/11/2026): segunda janela, das 19h às 23h.
 */
const HORAS_SEMANA = 7 * 24;
const HORA = 3600_000;
const DIA = 24 * HORA;
const TOLERANCIA_JANELAS_SEM_RODADA = 1;
const TOLERANCIA_INACABADAS = 2;
// "atrasado" já significa 30h sem verificação; seguir na lista 20h+ depois = manhã seguinte também falhou.
const HORAS_SEGUIDAS_ATRASO_LONGO = 20;
// Janelas do robô em UTC (Brasília = UTC-3, sem horário de verão desde 2019):
// 4h–10h = 7h–13h UTC; 19h–23h = 22h–2h UTC (do dia seguinte).
const JANELAS_UTC = [{ inicio: 7, duracao: 6 }, { inicio: 22, duracao: 4 }];

/** Quantas janelas do robô dentro do período não tiveram nenhuma rodada. */
function janelasSemRodada(rodadas, inicio, fim) {
  let faltas = 0;
  let total = 0;
  for (let d = Math.floor(inicio / DIA) * DIA; d < fim; d += DIA) {
    for (const { inicio: h, duracao } of JANELAS_UTC) {
      const a = d + h * HORA;
      const b = a + duracao * HORA;
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
    problemas.push(`${aindaAtrasados.length} processo(s) continuam há mais de 30h sem verificação agora (${aindaAtrasados.join(", ")})`);
  }
  const longosJaResolvidos = [...atrasoLongo.keys()].filter((p) => !aindaAtrasados.includes(p));
  if (longosJaResolvidos.length) {
    problemas.push(`${longosJaResolvidos.length} processo(s) ficaram mais de 2 dias sem verificação durante a semana, já normalizados (${longosJaResolvidos.join(", ")})`);
  }
  if (inacabadas > TOLERANCIA_INACABADAS) problemas.push(`${inacabadas} rodada(s) começaram e não terminaram`);
  if (janelas.faltas > TOLERANCIA_JANELAS_SEM_RODADA) problemas.push(`${janelas.faltas} de ${janelas.total} janela(s) do robô (4h–10h / 19h–23h) sem nenhuma atualização`);

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
