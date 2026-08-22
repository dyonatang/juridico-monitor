#!/usr/bin/env node
/**
 * Agente jus.br → Jurídico Monitor
 *
 *   node agente.mjs login    abre o navegador para você entrar no gov.br (uma vez; a sessão fica salva em PERFIL_DIR)
 *   node agente.mjs rodar    rodada completa (agendar diariamente)
 *   node agente.mjs testar   só verifica sessão + acesso à API e ao sistema, sem gravar nada
 *
 * Fluxo da rodada:
 *   1. abre o portal com o perfil salvo; se a sessão caiu, avisa o sistema e sai com código 2
 *   2. captura o token da sessão (o portal envia "Authorization: Bearer ..." nas chamadas da API)
 *   3. busca /api/ingestao no sistema: CPFs/CNPJs a varrer, processos conhecidos e peças já importadas
 *   4. para cada CPF/CNPJ: GET /api/v2/processos?cpfCnpjParte=... → processos novos
 *   5. para cada processo: GET /api/v2/processos/{n} → capa, partes, movimentos, documentos
 *      → envia ao sistema; para cada peça nova, GET .../documentos/{id}/texto (+ binário opcional) → envia
 */
import "dotenv/config";
import { chromium } from "playwright";
import { appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const PORTAL = "https://portaldeservicos.pdpj.jus.br";
const API = `${PORTAL}/api/v2`;
const CONSULTA = `${PORTAL}/consulta`;

const cfg = {
  sistema: (process.env.SISTEMA_URL || "").replace(/\/$/, ""),
  token: process.env.INGEST_TOKEN || "",
  perfil: resolve(process.env.PERFIL_DIR || "./perfil"),
  headless: (process.env.HEADLESS ?? "true") !== "false",
  baixarBinario: (process.env.BAIXAR_BINARIO ?? "false") === "true",
  maxPecas: Number(process.env.MAX_PECAS_POR_RODADA || 60),
};

// ------------------------------------------------------------------ util
mkdirSync("logs", { recursive: true });
const logFile = `logs/${new Date().toISOString().slice(0, 10)}.log`;
function log(...a) {
  const linha = `${new Date().toLocaleTimeString("pt-BR")} ${a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")}`;
  console.log(linha);
  appendFileSync(logFile, linha + "\n");
}
const digitos = (s) => String(s ?? "").replace(/\D/g, "");
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function sistema(metodo, body) {
  if (!cfg.sistema || !cfg.token) throw new Error("Configure SISTEMA_URL e INGEST_TOKEN no .env");
  const r = await fetch(`${cfg.sistema}/api/ingestao`, {
    method: metodo,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let j;
  try { j = JSON.parse(txt); } catch { j = { raw: txt.slice(0, 300) }; }
  if (!r.ok) throw new Error(`sistema ${metodo} ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}
const avisarSistema = (nivel, mensagem) => sistema("POST", { tipo: "status", nivel, mensagem }).catch((e) => log("não consegui avisar o sistema:", e.message));

// ------------------------------------------------------------------ navegador / sessão
async function abrir(headless = cfg.headless) {
  const ctx = await chromium.launchPersistentContext(cfg.perfil, {
    headless,
    channel: "chromium", // Chromium completo (mesma identidade do modo visível) em vez do "headless shell"
    viewport: { width: 1400, height: 900 },
    locale: "pt-BR",
    args: ["--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  return { ctx, page };
}

/** true se a sessão gov.br está ativa. Espera até 45 s pela tela de consulta; loga o motivo quando falha. */
async function logado(page) {
  await page.goto(CONSULTA, { waitUntil: "domcontentloaded" }).catch(() => null);
  for (let i = 0; i < 45; i++) {
    await dormir(1000);
    const url = page.url();
    if (/sso\.acesso\.gov\.br|acesso\.gov\.br\/login|\/auth\/realms/i.test(url)) {
      log("portal redirecionou para o login gov.br:", url.slice(0, 90));
      return false;
    }
    if ((await page.locator("text=Pesquisar por").count()) > 0) return true;
    if (i === 20) log("ainda carregando…", url.slice(0, 90));
  }
  log("tela de consulta não apareceu. URL final:", page.url().slice(0, 120), "| título:", await page.title().catch(() => "?"));
  return false;
}

/** Faz uma busca pela interface para o portal emitir uma chamada com o token; devolve o token. */
async function capturarToken(page, cpfCnpj) {
  let token = null;
  const handler = (req) => {
    const a = req.headers()["authorization"];
    if (a && req.url().includes("/api/v2/")) token = a;
  };
  page.on("request", handler);
  try {
    await page.goto(CONSULTA, { waitUntil: "domcontentloaded" });
    await page.locator("mat-select, [role=combobox]").first().click();
    const tipo = digitos(cpfCnpj).length === 14 ? "CNPJ da Parte" : "CPF da Parte";
    await page.locator(`mat-option:has-text("${tipo}"), [role=option]:has-text("${tipo}")`).first().click();
    const campo = page.locator("input[placeholder*='000']").first();
    await campo.click();
    await campo.fill("");
    await page.keyboard.type(digitos(cpfCnpj), { delay: 20 });
    await page.locator("button:has-text('Buscar')").first().click();
    for (let i = 0; i < 40 && !token; i++) await dormir(250);
  } finally {
    page.off("request", handler);
  }
  if (!token) throw new Error("não consegui capturar o token da sessão (a tela do portal mudou?)");
  return token;
}

function criarApi(page, obterToken) {
  let token = null;
  async function chamar(path, opts = {}) {
    if (!token) token = await obterToken();
    const url = path.startsWith("http") ? path : `${API}${path.startsWith("/") ? "" : "/"}${path}`;
    let r = await page.request.get(url, { headers: { Authorization: token }, timeout: 60000 });
    if (r.status() === 401) {
      log("token expirou — renovando");
      token = await obterToken();
      r = await page.request.get(url, { headers: { Authorization: token }, timeout: 60000 });
    }
    if (!r.ok()) throw new Error(`jus.br ${r.status()} em ${path}`);
    if (opts.binario) return { bytes: await r.body(), mime: r.headers()["content-type"] ?? null };
    if (opts.texto) return await r.text();
    return await r.json();
  }
  return { chamar };
}

// ------------------------------------------------------------------ conversão (API v2 → formato do sistema)
function converterProcesso(det) {
  const raiz = Array.isArray(det) ? det[0] : det;
  const t = raiz?.tramitacaoAtual ?? raiz?.tramitacoes?.[0] ?? {};
  const partes = (t.partes ?? []).map((p) => ({
    nome: p.nome,
    polo: p.polo,
    documentos: (p.documentosPrincipais ?? p.cadastroReceitaFederal ?? []).map((d) => digitos(d.numero)).filter(Boolean),
  }));
  return {
    processo: {
      numero: raiz.numeroProcesso,
      tribunal: raiz.siglaTribunal ?? t.tribunal?.sigla ?? null,
      classe: t.classe?.[0]?.descricao ?? null,
      assunto: (t.assunto ?? []).map((a) => a.descricao).filter(Boolean).join("; ") || null,
      orgao: t.distribuicao?.[0]?.orgaoJulgador?.[0]?.nome ?? t.orgaoJulgador?.[0]?.nome ?? null,
      ajuizamento: t.dataHoraAjuizamento ?? null,
      valor: t.valorAcao ?? null,
      ativo: typeof t.ativo === "boolean" ? t.ativo : null,
      partes,
      movimentos: (t.movimentos ?? []).map((m) => ({ dataHora: m.dataHora, descricao: m.descricao, codigo: m.codigo ?? null })),
    },
    documentos: (t.documentos ?? []).map((d) => ({
      idCodex: String(d.idCodex),
      idOrigem: d.idOrigem ?? null,
      nome: d.nome,
      tipo: d.tipo?.nome ?? null,
      dataHoraJuntada: d.dataHoraJuntada ?? null,
      mime: d.arquivo?.tipo ?? null,
      sigilo: d.nivelSigilo ?? null,
      hrefTexto: d.hrefTexto,
      hrefBinario: d.hrefBinario,
    })),
  };
}

// ------------------------------------------------------------------ comandos
async function cmdLogin() {
  log("abrindo o navegador — entre com sua conta gov.br; a sessão fica salva em", cfg.perfil);
  const { ctx, page } = await abrir(false);
  await page.goto(CONSULTA);
  for (let i = 0; i < 120; i++) {
    await dormir(5000);
    if (page.url().startsWith(CONSULTA) && (await page.locator("text=Pesquisar por").count()) > 0) {
      log("✓ login confirmado. Pode fechar. A sessão está salva.");
      await dormir(3000);
      await ctx.close();
      return;
    }
  }
  log("tempo esgotado sem confirmar o login");
  await ctx.close();
  process.exit(1);
}

async function cmdTestar() {
  log("testando acesso ao sistema…");
  const alvos = await sistema("GET");
  log(`✓ sistema OK: ${alvos.documentos.length} CPF/CNPJ, ${alvos.processos.length} processos`);
  const { ctx, page } = await abrir();
  try {
    if (!(await logado(page))) { log("✗ sessão gov.br expirada — rode: npm run login"); process.exit(2); }
    log("✓ sessão do jus.br ativa");
    const primeiro = alvos.documentos[0];
    if (primeiro) {
      const api = criarApi(page, () => capturarToken(page, primeiro.numero));
      const busca = await api.chamar(`/processos?cpfCnpjParte=${primeiro.numero}`);
      log(`✓ API OK: ${busca.total ?? busca.numberOfElements ?? 0} processo(s) para ${primeiro.nome}`);
    }
  } finally {
    await ctx.close();
  }
}

async function cmdRodar() {
  const inicio = Date.now();
  const alvos = await sistema("GET");
  log(`alvos: ${alvos.documentos.length} CPF/CNPJ · ${alvos.processos.length} processos conhecidos`);
  const { ctx, page } = await abrir();
  const resumo = { buscas: 0, processosNovos: 0, processosAtualizados: 0, pecasNovas: 0, erros: [] };
  try {
    if (!(await logado(page))) {
      log("✗ sessão gov.br expirada");
      await avisarSistema("erro", "Sessão do gov.br expirou no agente jus.br. Entre no servidor e rode `npm run login` na pasta agente-jusbr.");
      process.exit(2);
    }
    const primeiro = alvos.documentos[0]?.numero ?? alvos.processos[0]?.numero;
    const api = criarApi(page, () => capturarToken(page, primeiro));

    // 1) varredura por CPF/CNPJ → processos novos
    const conhecidos = new Map(alvos.processos.map((p) => [digitos(p.numero), new Set(p.pecas_conhecidas)]));
    const novos = new Map(); // numero → documento_id (vínculo)
    for (const d of alvos.documentos) {
      try {
        const busca = await api.chamar(`/processos?cpfCnpjParte=${d.numero}`);
        resumo.buscas++;
        const itens = busca.content ?? [];
        if ((busca.total ?? itens.length) > itens.length) log(`⚠ ${d.nome}: ${busca.total} processos, só ${itens.length} lidos (paginação)`);
        for (const it of itens) {
          const n = digitos(it.numeroProcesso);
          if (n.length === 20 && !conhecidos.has(n) && !novos.has(n)) novos.set(n, d.id);
        }
        log(`${d.nome}: ${itens.length} processo(s)${[...novos.values()].filter((x) => x === d.id).length ? "" : ""}`);
        await dormir(800);
      } catch (e) {
        resumo.erros.push(`busca ${d.nome}: ${e.message}`);
        log("✗", e.message);
      }
    }
    log(`processos novos encontrados: ${novos.size}`);

    // 2) detalhe de cada processo (novos + conhecidos) → sistema
    const todos = [...novos.keys(), ...conhecidos.keys()];
    let pecasEnviadas = 0;
    for (const n of todos) {
      try {
        const det = await api.chamar(`/processos/${n}`);
        const { processo, documentos } = converterProcesso(det);
        const vinculo = novos.has(n) ? { documento_id: novos.get(n) } : undefined;
        const r = await sistema("POST", { tipo: "processo", processo, vinculo });
        const info = r.processos?.[0];
        if (info?.criado) resumo.processosNovos++; else resumo.processosAtualizados++;
        if (info?.novas) log(`${processo.numero}: ${info.novas} movimentação(ões) nova(s)`);

        // 3) peças ainda não importadas
        const ja = conhecidos.get(n) ?? new Set();
        const pendentes = documentos.filter((doc) => !ja.has(doc.idCodex) && !ja.has(String(doc.idOrigem ?? "")));
        for (const doc of pendentes) {
          if (pecasEnviadas >= cfg.maxPecas) break;
          try {
            const texto = doc.hrefTexto ? await api.chamar(doc.hrefTexto, { texto: true }) : "";
            let binario_base64 = null;
            if (cfg.baixarBinario && doc.hrefBinario) {
              const b = await api.chamar(doc.hrefBinario, { binario: true });
              binario_base64 = b.bytes.toString("base64");
              doc.mime = doc.mime || b.mime;
            }
            const rr = await sistema("POST", { tipo: "documento", documento: { numero: processo.numero, ...doc, texto, binario_base64 } });
            if (rr.documentos?.[0]?.novo) { resumo.pecasNovas++; log(`  + peça: ${doc.tipo ?? doc.nome} (${doc.dataHoraJuntada?.slice(0, 10) ?? "?"})`); }
            pecasEnviadas++;
            await dormir(500);
          } catch (e) {
            resumo.erros.push(`peça ${doc.idCodex} de ${processo.numero}: ${e.message}`);
            log("  ✗", e.message);
          }
        }
        await dormir(600);
      } catch (e) {
        resumo.erros.push(`processo ${n}: ${e.message}`);
        log("✗", n, e.message);
      }
    }
    if (pecasEnviadas >= cfg.maxPecas) log(`limite de ${cfg.maxPecas} peças por rodada atingido — o restante fica para a próxima`);
  } finally {
    await ctx.close();
  }
  const min = ((Date.now() - inicio) / 60000).toFixed(1);
  log("RESUMO", { ...resumo, minutos: min });
  await avisarSistema(resumo.erros.length ? "erro" : "info", `Agente jus.br: ${resumo.processosNovos} processo(s) novo(s), ${resumo.processosAtualizados} atualizados, ${resumo.pecasNovas} peça(s) nova(s), ${resumo.erros.length} erro(s) em ${min} min.${resumo.erros.length ? "\n" + resumo.erros.slice(0, 10).join("\n") : ""}`);
  process.exit(resumo.erros.length ? 1 : 0);
}

const cmd = process.argv[2];
const run = { login: cmdLogin, rodar: cmdRodar, testar: cmdTestar }[cmd];
if (!run) {
  console.log("uso: node agente.mjs <login|rodar|testar>");
  process.exit(1);
}
run().catch(async (e) => {
  log("ERRO FATAL:", e.message);
  await avisarSistema("erro", `Agente jus.br falhou: ${e.message}`);
  process.exit(1);
});
