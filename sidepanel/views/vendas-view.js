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
import {
  prepararOrcamentos,
  calcularKpisVendas,
  rankingPorVendedora,
  formatarReal,
  numeroWhatsapp
} from '../engines/cadencia-vendas.js';

const JANELA_DIAS = 90;

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
  aprovado:   { titulo: "✅ Aprovado",              cor: "#15803d" }
};

function escaparHtml(txt = "") {
  return String(txt).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function dataLocalIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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

    const hoje = new Date();
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - JANELA_DIAS);

    const { registros, total } = await buscarVendasPlanosPeriodoApi(
      token, dataLocalIso(inicio), dataLocalIso(hoje)
    );

    orcamentos = prepararOrcamentos(registros);
    kpis = calcularKpisVendas(orcamentos);
    ultimaSessao = chaveSessao;

    console.log(`[Vendas] ✅ ${orcamentos.length} orçamento(s) nos últimos ${JANELA_DIAS} dias (${total} no período). ` +
      `Aguardando: ${kpis.qtdAguardando} • Pendente: ${kpis.qtdPendente} • Aprovado: ${kpis.qtdAprovado}`);

    renderizarVendas();
  } catch (err) {
    console.error("[Vendas] Erro ao carregar o funil comercial:", err);
  } finally {
    carregando = false;
    if (loadingVendas) loadingVendas.style.display = "none";
  }
}

function atualizarKpis() {
  if (!kpis) return;

  if (vendasKpiFaturamento) vendasKpiFaturamento.textContent = formatarReal(kpis.faturamentoAprovado);
  if (vendasKpiAberto) vendasKpiAberto.textContent = formatarReal(kpis.valorEmAberto);
  if (vendasKpiConversao) vendasKpiConversao.textContent = `${kpis.taxaConversao}%`;
  if (vendasKpiTicket) vendasKpiTicket.textContent = formatarReal(kpis.ticketMedio);

  if (vendasResumoPeriodo) {
    vendasResumoPeriodo.textContent =
      `${kpis.totalOrcamentos} orçamentos nos últimos ${JANELA_DIAS} dias • ` +
      `${kpis.qtdAprovado} aprovados • ${kpis.qtdAguardando} aguardando • ${kpis.qtdPendente} pendentes` +
      (kpis.descontoMedio ? ` • desconto médio ${kpis.descontoMedio}%` : "");
  }

  const aResgatar = kpis.qtdAguardando + kpis.qtdPendente;
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
      aprovado: kpis.qtdAprovado
    }[fila];
    const span = btn.querySelector(".vendas-filter-count");
    if (span && cont !== undefined) span.textContent = cont;
    btn.classList.toggle("active", fila === filtroFila);
  });
}

function renderizarRanking() {
  if (!vendasRanking) return;

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

export function renderizarVendas() {
  if (!vendasCards) return;
  atualizarKpis();
  renderizarRanking();

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
        : `Nenhum orçamento em "${ROTULO_FILA[filtroFila]?.titulo || filtroFila}" nos últimos ${JANELA_DIAS} dias.`;
    }
    return;
  }

  if (vendasEmptyState) vendasEmptyState.style.display = "none";
  vendasCards.style.display = "flex";

  vendasCards.innerHTML = lista.map(o => {
    const contatado = contatadosSet.has(o.idUnico);
    const cor = ROTULO_FILA[o.fila]?.cor || "#475569";
    const wpp = numeroWhatsapp(o.telefone);
    const linkWpp = wpp ? `https://wa.me/${wpp}?text=${encodeURIComponent(o.script)}` : "";
    const etapa = o.etapa;

    const idade = o.diasCorridos === 0
      ? "hoje"
      : o.diasCorridos === 1 ? "ontem" : `há ${o.diasCorridos} dias`;

    const selo = etapa
      ? (etapa.atrasado
          ? `<span class="vendas-etapa-tag vendas-etapa-atrasada">⏰ ${escaparHtml(etapa.titulo)} • atrasado</span>`
          : etapa.futura
            ? `<span class="vendas-etapa-tag vendas-etapa-futura">🕒 próximo toque em D+${etapa.dia}</span>`
            : `<span class="vendas-etapa-tag">📣 Toque ${etapa.indice + 1}/${etapa.total} • ${escaparHtml(etapa.titulo)}</span>`)
      : "";

    return `
      <div class="vendas-card ${contatado ? "vendas-card-feito" : ""}" style="border-left-color: ${cor};" data-id="${escaparHtml(o.idUnico)}">
        <div class="vendas-card-topo">
          <div class="vendas-card-cli">
            <strong class="vendas-card-nome">👤 ${escaparHtml(o.clienteNome)}</strong>
            <span class="vendas-card-meta">
              Orçamento ${escaparHtml(String(o.codOrcamento))} • apresentado ${idade}
              ${o.vendedora ? ` • 🧑‍💼 ${escaparHtml(o.vendedora)}` : ""}
            </span>
          </div>
          <span class="vendas-card-valor">${formatarReal(o.valorFinal)}</span>
        </div>

        <div class="vendas-card-plano">
          💎 ${escaparHtml(o.nomePlano)}
          ${o.descontoPct > 0 ? `<span class="vendas-desc-tag">−${o.descontoPct}%</span>` : ""}
          ${o.temLink ? `<span class="vendas-link-tag" title="${escaparHtml(o.formaPagamento)}">🔗 link gerado</span>` : ""}
          ${o.vencido ? `<span class="vendas-venc-tag">⚠️ vencido</span>` : ""}
        </div>

        ${selo}
        ${etapa && !etapa.futura ? `<div class="vendas-card-foco">🎯 ${escaparHtml(etapa.foco)}</div>` : ""}

        <div class="vendas-card-script">${escaparHtml(o.script)}</div>

        <div class="vendas-card-acoes">
          ${linkWpp ? `<a href="${linkWpp}" target="_blank" rel="noopener" class="btn-vendas-wpp">💬 WhatsApp</a>` : `<span class="vendas-sem-tel">sem telefone</span>`}
          <button class="btn-vendas-copiar" data-script="${escaparHtml(o.script)}">📋 Copiar</button>
          <button class="btn-vendas-feito" data-id="${escaparHtml(o.idUnico)}">${contatado ? "✅ Contatada" : "☑️ Marcar feito"}</button>
        </div>
      </div>
    `;
  }).join("");
}

export function inicializarVendasView() {
  btnRefreshVendas?.addEventListener("click", () => carregarVendas(true));

  vendasInputBusca?.addEventListener("input", (e) => {
    termoBusca = e.target.value.trim();
    renderizarVendas();
  });

  document.querySelectorAll(".vendas-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      filtroFila = btn.getAttribute("data-fila") || "aguardando";
      renderizarVendas();
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
