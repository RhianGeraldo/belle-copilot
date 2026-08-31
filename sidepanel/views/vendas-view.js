/**
 * BELLE COPILOT - VENDAS & RESGATE DE ORÇAMENTOS
 *
 * Funil comercial montado sobre o `vendasplanos`: KPIs do período e as filas de
 * follow-up (link gerado, orçamento pendente e suspenso), com script pronto por
 * etapa da cadência e controle diário de contato.
 *
 * Janela de busca: últimos 90 dias. Orçamento esfria, mas não morre — a cauda longa
 * é justamente onde está o dinheiro que ninguém foi buscar.
 */

import { state } from '../core/state.js';
import { buscarVendasPlanosPeriodoApi } from '../core/api-client.js';
import { ehGerente, aplicarVisibilidadeGerencial } from '../core/permissions.js';
import { htmlCardOrcamento, escaparHtml } from '../components/card-orcamento.js';
import {
  prepararOrcamentos,
  calcularKpisVendas,
  rankingPorVendedora,
  prepararPlanosVencendo,
  calcularKpisVencimento,
  formatarReal
} from '../engines/cadencia-vendas.js';

/*
 * Janela do resgate de orçamentos.
 *
 * A fila não olha os orçamentos recentes: eles ainda estão em negociação normal com a
 * consultora. O recorte começa depois de uma carência e volta três meses a partir dali.
 *
 *   data final   = hoje − 30 dias
 *   data inicial = data final − 3 meses
 *
 * Ex.: hoje 01/08/2026 → final 01/07/2026 → inicial 01/04/2026.
 */
const DIAS_CARENCIA = 30;
const MESES_JANELA = 3;
const JANELA_VENCIMENTO_MESES = 30; // planos vencendo: validade de 24 meses exige varrer bem mais atrás
const HORIZONTE_VENCIMENTO_DIAS = 90;

// Elementos
const vendasKpiFaturamento = document.getElementById("vendas-kpi-faturamento");
const vendasKpiAberto = document.getElementById("vendas-kpi-aberto");
const vendasKpiConversao = document.getElementById("vendas-kpi-conversao");
const vendasKpiTicket = document.getElementById("vendas-kpi-ticket");
const vendasResumoPeriodo = document.getElementById("vendas-resumo-periodo");
const vendasCards = document.getElementById("vendas-cards-container");
const vendasEmptyState = document.getElementById("vendas-empty-state");
const loadingVendas = document.getElementById("loading-vendas");
const vendasInputBusca = document.getElementById("vendas-input-busca");
const btnRefreshVendas = document.getElementById("btn-refresh-vendas");
const vendasRanking = document.getElementById("vendas-ranking");
const badgeVendasTotal = document.getElementById("badge-vendas-total");

let orcamentos = [];
let planosVencendo = [];
let kpisVencimento = null;
let carregandoVencendo = false;
let sessaoVencendo = null;
let kpis = null;
let filtroFila = "aguardando";
let termoBusca = "";
let contatadosSet = new Set();
let ultimaSessao = null;
let carregando = false;

const ROTULO_FILA = {
  aguardando: { titulo: "🔥 Aguardando pagamento", cor: "#b45309" },
  pendente:   { titulo: "💬 Orçamento pendente",   cor: "#0369a1" },
  suspenso:   { titulo: "⏸️ Suspenso",              cor: "#6d28d9" },
  aprovado:   { titulo: "✅ Aprovado",              cor: "#15803d" },
  vencendo:   { titulo: "⏳ Vencendo com saldo",    cor: "#b91c1c" }
};

function dataLocalIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dataBrCurta(iso = "") {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Subtrai meses de calendário, sem estourar para o mês seguinte (31/07 − 3 = 30/04). */
function subtrairMeses(data, meses) {
  const d = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  const diaOriginal = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() - meses);
  const ultimoDiaDoMes = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(diaOriginal, ultimoDiaDoMes));
  return d;
}

/** Recorte de datas da fila de resgate: [final − 3 meses, hoje − 30 dias]. */
function janelaDeResgate() {
  const hoje = new Date();
  const fim = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - DIAS_CARENCIA);
  const inicio = subtrairMeses(fim, MESES_JANELA);
  return { inicioIso: dataLocalIso(inicio), fimIso: dataLocalIso(fim) };
}

let janelaAtual = janelaDeResgate();

function chaveContatados() {
  return `vendas_contatados_${state.currentCodEstab || "0"}_${dataLocalIso()}`;
}

async function carregarContatados() {
  const chave = chaveContatados();
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const res = await new Promise(r => chrome.storage.local.get([chave], r));
      if (Array.isArray(res?.[chave])) {
        contatadosSet = new Set(res[chave]);
        return;
      }
    }
  } catch (e) {}
  contatadosSet = new Set();
}

async function salvarContatados() {
  const chave = chaveContatados();
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await new Promise(r => chrome.storage.local.set({ [chave]: [...contatadosSet] }, r));
    }
  } catch (e) {}
}

export async function carregarVendas(forcar = false) {
  if (carregando) return;

  const token = state.currentToken;
  const unidade = state.currentCodEstab;
  if (!token) {
    if (vendasEmptyState) {
      vendasEmptyState.style.display = "block";
      vendasEmptyState.textContent = "Sessão do Belle não encontrada. Abra o Belle e clique em 🔄.";
    }
    return;
  }

  const chaveSessao = `${unidade}|${token}`;
  if (!forcar && orcamentos.length > 0 && ultimaSessao === chaveSessao) {
    renderizarVendas();
    return;
  }

  carregando = true;
  if (loadingVendas) loadingVendas.style.display = "flex";
  if (vendasCards) vendasCards.style.display = "none";
  if (vendasEmptyState) vendasEmptyState.style.display = "none";

  try {
    await carregarContatados();

    janelaAtual = janelaDeResgate();

    const { registros, total } = await buscarVendasPlanosPeriodoApi(
      token, janelaAtual.inicioIso, janelaAtual.fimIso
    );

    orcamentos = prepararOrcamentos(registros);
    kpis = calcularKpisVendas(orcamentos);
    ultimaSessao = chaveSessao;

    console.log(`[Vendas] ✅ ${orcamentos.length} orçamento(s) de ${dataBrCurta(janelaAtual.inicioIso)} a ${dataBrCurta(janelaAtual.fimIso)} ` +
      `— ${MESES_JANELA} meses encerrando ${DIAS_CARENCIA} dias atrás (${total} no período). ` +
      `Aguardando: ${kpis.qtdAguardando} • Pendente: ${kpis.qtdPendente} • Aprovado: ${kpis.qtdAprovado}`);

    renderizarVendas();
  } catch (err) {
    console.error("[Vendas] Erro ao carregar o funil comercial:", err);
  } finally {
    carregando = false;
    if (loadingVendas) loadingVendas.style.display = "none";
  }
}

/**
 * Carrega os planos pagos com sessão sobrando e validade próxima.
 * Consulta própria e bem mais larga que a do resgate: quem vence hoje foi vendido
 * há cerca de dois anos, então filtrar pela data da proposta dos últimos 90 dias
 * não encontraria ninguém.
 */
export async function carregarPlanosVencendo(forcar = false) {
  if (carregandoVencendo) return;

  const token = state.currentToken;
  if (!token) return;

  const chaveSessao = `${state.currentCodEstab}|${token}`;
  if (!forcar && planosVencendo.length > 0 && sessaoVencendo === chaveSessao) return;

  carregandoVencendo = true;
  if (loadingVendas) loadingVendas.style.display = "flex";

  try {
    const hoje = new Date();
    const inicio = new Date(hoje);
    inicio.setMonth(hoje.getMonth() - JANELA_VENCIMENTO_MESES);

    // `somenteSaldo: "1"` pede ao Belle apenas quem ainda tem sessão em aberto,
    // o que reduz muito o volume dessa varredura longa.
    const { registros, total } = await buscarVendasPlanosPeriodoApi(
      token, dataLocalIso(inicio), dataLocalIso(hoje),
      { somenteSaldo: "1", limitePorPagina: 100, maxRegistros: 1000 }
    );

    planosVencendo = prepararPlanosVencendo(registros, HORIZONTE_VENCIMENTO_DIAS, true);
    kpisVencimento = calcularKpisVencimento(planosVencendo);
    sessaoVencendo = chaveSessao;

    console.log(
      `[Vendas] ⏳ Planos vencendo: ${registros.length} registro(s) varridos em ${JANELA_VENCIMENTO_MESES} meses ` +
      `(${total} no período) → ${planosVencendo.length} plano(s) pago(s) com saldo vencendo em até ${HORIZONTE_VENCIMENTO_DIAS} dias ` +
      `(${kpisVencimento.sessoesEmRisco} sessões em risco, ${kpisVencimento.qtdVencidos} já vencido(s)).`
    );

    if (registros.length > 0 && planosVencendo.length === 0) {
      console.log("[Vendas] ℹ️ Nenhum plano dentro do horizonte de vencimento. Se você espera ver clientes aqui, o filtro somenteSaldo=1 pode não estar sendo aplicado pelo Belle — me avise.");
    }
  } catch (err) {
    console.error("[Vendas] Erro ao carregar planos vencendo:", err);
  } finally {
    carregandoVencendo = false;
    if (loadingVendas) loadingVendas.style.display = "none";
  }
}

function atualizarKpis() {
  if (!kpis) return;

  // Faturamento, ticket, conversão e ranking são números de gestão: só o gerente vê.
  // A consultora fica com as filas de trabalho, logo abaixo.
  const gerente = ehGerente();
  aplicarVisibilidadeGerencial();

  if (gerente) {
    if (vendasKpiFaturamento) vendasKpiFaturamento.textContent = formatarReal(kpis.faturamentoAprovado);
    if (vendasKpiAberto) vendasKpiAberto.textContent = formatarReal(kpis.valorEmAberto);
    if (vendasKpiConversao) vendasKpiConversao.textContent = `${kpis.taxaConversao}%`;
    if (vendasKpiTicket) vendasKpiTicket.textContent = formatarReal(kpis.ticketMedio);
  }

  if (vendasResumoPeriodo) {
    // Contagem das filas todo mundo vê; desconto médio é indicador de margem.
    vendasResumoPeriodo.textContent = gerente
      ? `${kpis.totalOrcamentos} orçamentos de ${dataBrCurta(janelaAtual.inicioIso)} a ${dataBrCurta(janelaAtual.fimIso)} • ` +
        `${kpis.qtdAprovado} aprovados • ${kpis.qtdAguardando} aguardando • ${kpis.qtdPendente} pendentes` +
        (kpis.descontoMedio ? ` • desconto médio ${kpis.descontoMedio}%` : "")
      : `Orçamentos de ${dataBrCurta(janelaAtual.inicioIso)} a ${dataBrCurta(janelaAtual.fimIso)} • ` +
        `${kpis.qtdAguardando} aguardando pagamento • ${kpis.qtdPendente} pendente(s) para retomar` +
        (planosVencendo.length ? ` • ${planosVencendo.length} plano(s) vencendo com saldo` : "");
  }

  const aResgatar = kpis.qtdAguardando + kpis.qtdPendente + planosVencendo.length;
  if (badgeVendasTotal) {
    badgeVendasTotal.textContent = aResgatar;
    badgeVendasTotal.style.display = aResgatar > 0 ? "inline-block" : "none";
  }

  document.querySelectorAll(".vendas-filter-btn").forEach(btn => {
    const fila = btn.getAttribute("data-fila");
    const cont = {
      aguardando: kpis.qtdAguardando,
      pendente: kpis.qtdPendente,
      suspenso: kpis.qtdSuspenso,
      aprovado: kpis.qtdAprovado,
      vencendo: planosVencendo.length
    }[fila];
    const span = btn.querySelector(".vendas-filter-count");
    if (span && cont !== undefined) span.textContent = cont;
    btn.classList.toggle("active", fila === filtroFila);
  });
}

function renderizarRanking() {
  if (!vendasRanking) return;
  // Ranking entre consultoras é informação de gestão.
  if (!ehGerente()) {
    vendasRanking.innerHTML = "";
    return;
  }

  const ranking = rankingPorVendedora(orcamentos).slice(0, 5);
  if (ranking.length === 0) {
    vendasRanking.innerHTML = "";
    return;
  }

  vendasRanking.innerHTML = ranking.map(r => `
    <div class="vendas-rank-linha">
      <span class="vendas-rank-nome" title="${escaparHtml(r.vendedora)}">${escaparHtml(r.vendedora)}</span>
      <span class="vendas-rank-conv">${r.conversao}%</span>
      <span class="vendas-rank-valor">${formatarReal(r.valorAprovado)}</span>
      ${r.valorEmAberto > 0 ? `<span class="vendas-rank-aberto" title="Valor ainda em aberto com esta consultora">${formatarReal(r.valorEmAberto)} em aberto</span>` : ""}
    </div>
  `).join("");
}

function renderizarFilaVencendo() {
  const k = kpisVencimento;

  if (planosVencendo.length === 0) {
    vendasCards.style.display = "none";
    if (vendasEmptyState) {
      vendasEmptyState.style.display = "block";
      vendasEmptyState.textContent = carregandoVencendo
        ? "Procurando planos com saldo a vencer..."
        : `Nenhum plano pago com sessão sobrando vencendo nos próximos ${HORIZONTE_VENCIMENTO_DIAS} dias. 🎉`;
    }
    return;
  }

  let lista = planosVencendo;
  if (termoBusca) {
    const t = termoBusca.toLowerCase();
    lista = lista.filter(o =>
      o.clienteNome.toLowerCase().includes(t) ||
      o.nomePlano.toLowerCase().includes(t) ||
      String(o.codCliente).includes(t)
    );
  }

  if (vendasEmptyState) vendasEmptyState.style.display = "none";
  vendasCards.style.display = "flex";

  const resumo = k ? `
    <div class="vencendo-resumo">
      <strong>⏳ ${k.sessoesEmRisco} sessões já pagas</strong> em risco, de ${k.clientes} cliente(s)
      ${k.qtdVencidos > 0 ? ` • <span style="color:#b91c1c;font-weight:700;">${k.qtdVencidos} já vencido(s)</span>` : ""}
      ${k.qtdCriticos > 0 ? ` • ${k.qtdCriticos} vencendo em 15 dias` : ""}
    </div>` : "";

  vendasCards.innerHTML = resumo + lista.map(o => {
    const contatado = contatadosSet.has(o.idUnico);
    const u = o.urgencia || {};
    const prazo = o.diasParaVencer < 0
      ? `venceu há ${Math.abs(o.diasParaVencer)} dia(s)`
      : o.diasParaVencer === 0 ? "vence hoje" : `faltam ${o.diasParaVencer} dia(s)`;

    return `
      <div class="vendas-card ${contatado ? "vendas-card-feito" : ""}" style="border-left-color: ${u.cor || "#b91c1c"};" data-id="${escaparHtml(o.idUnico)}">
        <div class="vendas-card-topo">
          <div class="vendas-card-cli">
            <strong class="vendas-card-nome">👤 ${escaparHtml(o.clienteNome)}</strong>
            <span class="vendas-card-meta">
              Validade ${escaparHtml(o.validadeAte)} • ${prazo}
              ${o.vendedora ? ` • 🧑‍💼 ${escaparHtml(o.vendedora)}` : ""}
            </span>
          </div>
          <span class="vencendo-sessoes" title="Sessões já pagas que a cliente ainda não usou">
            ${o.saldoSessoes}<small>${o.saldoSessoes === 1 ? " sessão" : " sessões"}</small>
          </span>
        </div>

        <div class="vendas-card-plano">💎 ${escaparHtml(o.nomePlano)}</div>

        <span class="vendas-etapa-tag" style="background: ${u.cor || "#b91c1c"}18; color: ${u.cor || "#b91c1c"};">
          ⏰ ${escaparHtml(u.rotulo || "Vencendo")}
        </span>
        <div class="vendas-card-foco">🎯 Cliente já pagou. O objetivo aqui não é vender — é colocar essas sessões na agenda antes da validade acabar.</div>

        <div class="vendas-card-script">${escaparHtml(o.script)}</div>

        <div class="vendas-card-acoes">
          <button class="btn-vendas-copiar" data-script="${escaparHtml(o.script)}">📋 Copiar</button>
          <button class="btn-vendas-feito" data-id="${escaparHtml(o.idUnico)}">${contatado ? "✅ Contatada" : "☑️ Marcar feito"}</button>
        </div>
      </div>`;
  }).join("");
}

export function renderizarVendas() {
  if (!vendasCards) return;
  atualizarKpis();
  renderizarRanking();

  if (filtroFila === "vencendo") {
    renderizarFilaVencendo();
    return;
  }

  let lista = orcamentos.filter(o => o.fila === filtroFila);

  if (termoBusca) {
    const t = termoBusca.toLowerCase();
    lista = lista.filter(o =>
      o.clienteNome.toLowerCase().includes(t) ||
      o.nomePlano.toLowerCase().includes(t) ||
      String(o.codCliente).includes(t) ||
      (o.vendedora || "").toLowerCase().includes(t)
    );
  }

  // Toque vencido primeiro; entre iguais, o de maior valor.
  lista.sort((a, b) => {
    const aVenc = a.etapa && !a.etapa.futura ? 0 : 1;
    const bVenc = b.etapa && !b.etapa.futura ? 0 : 1;
    if (aVenc !== bVenc) return aVenc - bVenc;
    return b.valorFinal - a.valorFinal;
  });

  if (lista.length === 0) {
    vendasCards.style.display = "none";
    if (vendasEmptyState) {
      vendasEmptyState.style.display = "block";
      vendasEmptyState.textContent = termoBusca
        ? "Nenhum orçamento encontrado para essa busca."
        : `Nenhum orçamento em "${ROTULO_FILA[filtroFila]?.titulo || filtroFila}" entre ${dataBrCurta(janelaAtual.inicioIso)} e ${dataBrCurta(janelaAtual.fimIso)}.`;
    }
    return;
  }

  if (vendasEmptyState) vendasEmptyState.style.display = "none";
  vendasCards.style.display = "flex";

  vendasCards.innerHTML = lista
    .map(o => htmlCardOrcamento(o, { contatado: contatadosSet.has(o.idUnico) }))
    .join("");
}

export function inicializarVendasView() {
  btnRefreshVendas?.addEventListener("click", async () => {
    await carregarVendas(true);
    if (filtroFila === "vencendo") {
      await carregarPlanosVencendo(true);
      renderizarVendas();
    }
  });

  vendasInputBusca?.addEventListener("input", (e) => {
    termoBusca = e.target.value.trim();
    renderizarVendas();
  });

  document.querySelectorAll(".vendas-filter-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      filtroFila = btn.getAttribute("data-fila") || "aguardando";
      renderizarVendas();

      // A fila de vencimento tem consulta própria (30 meses) e só é buscada sob demanda.
      if (filtroFila === "vencendo" && planosVencendo.length === 0) {
        await carregarPlanosVencendo();
        renderizarVendas();
      }
    });
  });

  vendasCards?.addEventListener("click", async (e) => {
    const copiar = e.target.closest(".btn-vendas-copiar");
    if (copiar) {
      try {
        await navigator.clipboard.writeText(copiar.getAttribute("data-script") || "");
        const original = copiar.textContent;
        copiar.textContent = "✅ Copiado!";
        setTimeout(() => { copiar.textContent = original; }, 1500);
      } catch (err) {}
      return;
    }

    const feito = e.target.closest(".btn-vendas-feito");
    if (feito) {
      const id = feito.getAttribute("data-id");
      if (contatadosSet.has(id)) contatadosSet.delete(id);
      else contatadosSet.add(id);
      await salvarContatados();
      renderizarVendas();
    }
  });
}
