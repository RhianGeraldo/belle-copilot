/**
 * BELLE COPILOT - 🏆 PLANOS MAIS VENDIDOS & ORÇADOS (COMERCIAL)
 *
 * Consolida as vendas e orçamentos do período (últimos 3 meses encerrando 30 dias atrás)
 * agrupados por plano/pacote comercial, exibindo:
 * - Quantidade de vendas aprovadas (fechadas)
 * - Quantidade de orçamentos gerados
 * - Taxa de conversão de cada plano
 * - Faturamento total e ticket médio
 * - Principais consultoras que venderam cada plano
 */

import { state } from '../core/state.js';
import { buscarVendasPlanosPeriodoApi } from '../core/api-client.js';
import { ehGerente } from '../core/permissions.js';
import {
  prepararOrcamentos,
  formatarReal,
  registroPertenceAoUsuario
} from '../engines/cadencia-vendas.js';
import { escaparHtml } from '../components/card-orcamento.js';
import { obterOrcamentosResgate } from './vendas-view.js';

const DIAS_CARENCIA = 30;
const MESES_JANELA = 3;

// Elementos da View
const planosCards = document.getElementById("planos-cards-container");
const planosEmpty = document.getElementById("planos-empty-state");
const loadingPlanos = document.getElementById("loading-planos");
const planosResumo = document.getElementById("planos-resumo-periodo");
const planosInputBusca = document.getElementById("planos-input-busca");
const btnRefreshPlanos = document.getElementById("btn-refresh-planos");
const planosEscopoContainer = document.getElementById("planos-escopo-container");
const btnPlanosEscopoMeus = document.getElementById("btn-planos-escopo-meus");
const btnPlanosEscopoTodos = document.getElementById("btn-planos-escopo-todos");

// KPIs
const planosKpiDistintos = document.getElementById("planos-kpi-distintos");
const planosKpiVendidos = document.getElementById("planos-kpi-vendidos");
const planosKpiOrcados = document.getElementById("planos-kpi-orcados");
const planosKpiFaturamento = document.getElementById("planos-kpi-faturamento");

let orcamentos = [];
let filtroEscopo = "todos"; // "meus" | "todos"
let ordemFiltro = "vendidos"; // "vendidos" | "orcados" | "faturamento" | "conversao"
let termoBusca = "";
let carregando = false;
let ultimaSessao = null;

function dataLocalIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dataBrCurta(iso = "") {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : iso;
}

function subtrairMeses(data, meses) {
  const d = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  const diaOriginal = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() - meses);
  const ultimoDiaDoMes = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(diaOriginal, ultimoDiaDoMes));
  return d;
}

function janelaDeResgate() {
  const hoje = new Date();
  const fim = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - DIAS_CARENCIA);
  const inicio = subtrairMeses(fim, MESES_JANELA);
  return {
    inicio,
    fim,
    inicioIso: dataLocalIso(inicio),
    fimIso: dataLocalIso(fim)
  };
}

/**
 * Agrupa os orçamentos por plano e calcula métricas completas de vendas e conversão.
 */
export function agruparPorPlano(itens = []) {
  const mapa = new Map();

  itens.forEach(item => {
    const nomeOriginal = (item.nomePlano || "Plano sem nome").trim();
    // Chave de agrupamento limpa
    const chave = nomeOriginal.toLowerCase();

    if (!mapa.has(chave)) {
      mapa.set(chave, {
        nomePlano: nomeOriginal,
        codPlano: item.codPlano || item.cod_plano || "",
        tipoPlano: item.tipoPlano || item.lbTipo || "",
        totalOrcamentos: 0,
        qtdVendidos: 0,
        qtdAguardando: 0,
        qtdPendente: 0,
        qtdSuspenso: 0,
        qtdOutros: 0,
        faturamentoTotal: 0,
        valorEmAberto: 0,
        valorTotalOrcado: 0,
        consultoras: {}
      });
    }

    const p = mapa.get(chave);
    p.totalOrcamentos++;
    p.valorTotalOrcado += (item.valorFinal || 0);

    const vendedora = (item.vendedora || "Outra").trim();
    if (!p.consultoras[vendedora]) {
      p.consultoras[vendedora] = { total: 0, vendidos: 0, faturamento: 0 };
    }
    p.consultoras[vendedora].total++;

    if (item.fila === "aprovado") {
      p.qtdVendidos++;
      p.faturamentoTotal += (item.valorFinal || 0);
      p.consultoras[vendedora].vendidos++;
      p.consultoras[vendedora].faturamento += (item.valorFinal || 0);
    } else if (item.fila === "aguardando") {
      p.qtdAguardando++;
      p.valorEmAberto += (item.valorFinal || 0);
    } else if (item.fila === "pendente") {
      p.qtdPendente++;
      p.valorEmAberto += (item.valorFinal || 0);
    } else if (item.fila === "suspenso") {
      p.qtdSuspenso++;
    } else {
      p.qtdOutros++;
    }
  });

  return [...mapa.values()].map(p => {
    const taxaConversao = p.totalOrcamentos > 0
      ? Math.round((p.qtdVendidos / p.totalOrcamentos) * 100)
      : 0;
    const ticketMedio = p.qtdVendidos > 0
      ? (p.faturamentoTotal / p.qtdVendidos)
      : (p.totalOrcamentos > 0 ? p.valorTotalOrcado / p.totalOrcamentos : 0);

    return {
      ...p,
      taxaConversao,
      ticketMedio
    };
  });
}

/**
 * Carrega a base de orçamentos e consolida os planos.
 */
export async function carregarPlanos(forcar = false) {
  if (carregando) return;

  const token = state.currentToken;
  const unidade = state.currentCodEstab;
  if (!token) return;

  const chaveSessao = `${unidade}|${token}`;

  // Se a view de vendas já carregou a mesma janela e sessão, reaproveitamos os orçamentos diretamente!
  const orcamentosExistentes = obterOrcamentosResgate();
  if (!forcar && Array.isArray(orcamentosExistentes) && orcamentosExistentes.length > 0) {
    orcamentos = orcamentosExistentes;
    ultimaSessao = chaveSessao;
    renderizarPlanos();
    return;
  }

  carregando = true;
  if (loadingPlanos) loadingPlanos.style.display = "flex";
  if (planosCards) planosCards.style.display = "none";
  if (planosEmpty) planosEmpty.style.display = "none";

  try {
    const janela = janelaDeResgate();

    if (planosResumo) {
      planosResumo.textContent = `Últimos ${MESES_JANELA} meses (${dataBrCurta(janela.inicioIso)} a ${dataBrCurta(janela.fimIso)}, carência de ${DIAS_CARENCIA} dias) • Análise de demanda e fechamento por plano.`;
    }

    const { registros } = await buscarVendasPlanosPeriodoApi(
      token, janela.inicioIso, janela.fimIso, { limitePorPagina: 100, maxRegistros: 400 }
    );

    orcamentos = prepararOrcamentos(registros);
    ultimaSessao = chaveSessao;

    console.log(`[Planos] ✅ ${orcamentos.length} orçamentos processados para o ranking de planos.`);
    renderizarPlanos();
  } catch (err) {
    console.error("[Planos] Erro ao carregar ranking de planos:", err);
  } finally {
    carregando = false;
    if (loadingPlanos) loadingPlanos.style.display = "none";
  }
}

/**
 * Retorna os planos agrupados e ordenados com base nos filtros e busca.
 */
export function obterPlanosVisiveis() {
  // 1. Filtro de escopo do usuário
  let baseOrcamentos = orcamentos;
  if (filtroEscopo === "meus") {
    const meus = orcamentos.filter(o => registroPertenceAoUsuario(o));
    if (meus.length > 0 || !ehGerente()) {
      baseOrcamentos = meus;
    }
  }

  // 2. Agrupa por plano
  let planos = agruparPorPlano(baseOrcamentos);

  // 3. Busca por texto
  if (termoBusca) {
    planos = planos.filter(p => {
      const matchNome = (p.nomePlano || "").toLowerCase().includes(termoBusca);
      const matchTipo = (p.tipoPlano || "").toLowerCase().includes(termoBusca);
      return matchNome || matchTipo;
    });
  }

  // 4. Ordenação
  return planos.sort((a, b) => {
    if (ordemFiltro === "vendidos") {
      if (b.qtdVendidos !== a.qtdVendidos) return b.qtdVendidos - a.qtdVendidos;
      return b.faturamentoTotal - a.faturamentoTotal;
    }
    if (ordemFiltro === "orcados") {
      if (b.totalOrcamentos !== a.totalOrcamentos) return b.totalOrcamentos - a.totalOrcamentos;
      return b.qtdVendidos - a.qtdVendidos;
    }
    if (ordemFiltro === "faturamento") {
      if (b.faturamentoTotal !== a.faturamentoTotal) return b.faturamentoTotal - a.faturamentoTotal;
      return b.qtdVendidos - a.qtdVendidos;
    }
    if (ordemFiltro === "conversao") {
      if (b.taxaConversao !== a.taxaConversao) return b.taxaConversao - a.taxaConversao;
      return b.qtdVendidos - a.qtdVendidos;
    }
    return b.qtdVendidos - a.qtdVendidos;
  });
}

function htmlCardPlano(p, index) {
  let medalha = `#${index + 1}`;
  let medalClass = "";
  if (index === 0) { medalha = "🥇 1º"; medalClass = "rank-1"; }
  else if (index === 1) { medalha = "🥈 2º"; medalClass = "rank-2"; }
  else if (index === 2) { medalha = "🥉 3º"; medalClass = "rank-3"; }

  const corBarra = p.taxaConversao >= 50 ? "#22c55e" : (p.taxaConversao >= 25 ? "#0284c7" : "#94a3b8");
  const tagConversao = p.taxaConversao >= 50
    ? '<span style="color: #15803d; font-weight: 700;">🔥 Alta conversão</span>'
    : (p.taxaConversao >= 25
      ? '<span style="color: #0369a1; font-weight: 700;">⚡ Boa saída</span>'
      : '<span style="color: #64748b;">Potencial a resgatar</span>');

  // Top consultoras que mais venderam
  const topVend = Object.entries(p.consultoras || {})
    .sort((a, b) => b[1].vendidos - a[1].vendidos || b[1].total - a[1].total)
    .slice(0, 3);

  const topConsultorasHtml = topVend.length > 0
    ? `<div class="plano-top-vendedoras">
        ${topVend.map(([nome, dados]) => `
          <span class="plano-vend-chip" title="${escaparHtml(nome)}">
            🧑‍💼 ${escaparHtml(nome.split(" ")[0])}: <strong>${dados.vendidos}</strong> vend. (${dados.total} orç.)
          </span>
        `).join("")}
      </div>`
    : "";

  return `
    <div class="plano-card">
      <div class="plano-card-topo">
        <span class="plano-rank-badge ${medalClass}">${medalha}</span>
        <div class="plano-info">
          <strong class="plano-nome" title="${escaparHtml(p.nomePlano)}">💎 ${escaparHtml(p.nomePlano)}</strong>
          ${p.tipoPlano ? `<span class="plano-tipo">${escaparHtml(p.tipoPlano)}</span>` : ""}
        </div>
        <div class="plano-fat-box">
          <span class="plano-fat-val">${formatarReal(p.faturamentoTotal)}</span>
          <span class="plano-fat-lbl">faturado</span>
        </div>
      </div>

      <div class="plano-metricas-grid">
        <div class="plano-metrica">
          <span class="plano-met-val" style="color: #15803d;">✅ ${p.qtdVendidos}</span>
          <span class="plano-met-lbl">fechados</span>
        </div>
        <div class="plano-metrica">
          <span class="plano-met-val" style="color: #0369a1;">📝 ${p.totalOrcamentos}</span>
          <span class="plano-met-lbl">orçados</span>
        </div>
        <div class="plano-metrica">
          <span class="plano-met-val" style="color: #b45309;">💸 ${formatarReal(p.valorEmAberto)}</span>
          <span class="plano-met-lbl">em aberto</span>
        </div>
        <div class="plano-metrica">
          <span class="plano-met-val">🏷️ ${formatarReal(p.ticketMedio)}</span>
          <span class="plano-met-lbl">ticket médio</span>
        </div>
      </div>

      <div class="plano-conv-container">
        <div class="plano-conv-rotulo">
          <span>Conversão: <strong>${p.taxaConversao}%</strong> (${p.qtdVendidos} de ${p.totalOrcamentos})</span>
          ${tagConversao}
        </div>
        <div class="plano-conv-track">
          <div class="plano-conv-fill" style="width: ${Math.min(100, p.taxaConversao)}%; background: ${corBarra};"></div>
        </div>
      </div>

      ${topConsultorasHtml}
    </div>`;
}

/**
 * Renderiza os cards e KPIs da tela.
 */
export function renderizarPlanos() {
  if (!planosCards) return;

  // Atualiza visibilidade do escopo gerencial
  if (planosEscopoContainer) {
    planosEscopoContainer.style.display = ehGerente() ? "flex" : "none";
    planosEscopoContainer.querySelectorAll(".btn-escopo-toggle").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-escopo") === filtroEscopo);
    });
  }

  // Base do escopo
  let baseOrcamentos = orcamentos;
  if (filtroEscopo === "meus") {
    const meus = orcamentos.filter(o => registroPertenceAoUsuario(o));
    if (meus.length > 0 || !ehGerente()) {
      baseOrcamentos = meus;
    }
  }

  const todosPlanos = agruparPorPlano(baseOrcamentos);

  // Totais para os KPIs do topo
  const totalDistintos = todosPlanos.length;
  const totalVendidos = todosPlanos.reduce((acc, p) => acc + p.qtdVendidos, 0);
  const totalOrcados = todosPlanos.reduce((acc, p) => acc + p.totalOrcamentos, 0);
  const faturamentoGeral = todosPlanos.reduce((acc, p) => acc + p.faturamentoTotal, 0);

  if (planosKpiDistintos) planosKpiDistintos.textContent = String(totalDistintos);
  if (planosKpiVendidos) planosKpiVendidos.textContent = String(totalVendidos);
  if (planosKpiOrcados) planosKpiOrcados.textContent = String(totalOrcados);
  if (planosKpiFaturamento) planosKpiFaturamento.textContent = formatarReal(faturamentoGeral);

  // Obtém lista filtrada e ordenada
  const planosVisiveis = obterPlanosVisiveis();

  if (planosVisiveis.length === 0) {
    planosCards.style.display = "none";
    if (planosEmpty) {
      if (termoBusca) {
        planosEmpty.innerHTML = `🔍 Nenhum plano encontrado para <strong>"${escaparHtml(termoBusca)}"</strong>.`;
      } else if (filtroEscopo === "meus") {
        planosEmpty.innerHTML = `Nenhum plano orçado ou vendido por você no período de 3 meses.`;
      } else {
        planosEmpty.innerHTML = `Nenhum plano encontrado no período.`;
      }
      planosEmpty.style.display = "block";
    }
    return;
  }

  if (planosEmpty) planosEmpty.style.display = "none";
  planosCards.style.display = "flex";
  planosCards.innerHTML = planosVisiveis.map((p, idx) => htmlCardPlano(p, idx)).join("");
}

/**
 * Inicializa os ouvintes de eventos da view de planos.
 */
export function inicializarPlanosView() {
  btnRefreshPlanos?.addEventListener("click", async () => {
    await carregarPlanos(true);
  });

  planosInputBusca?.addEventListener("input", (e) => {
    termoBusca = e.target.value.toLowerCase().trim();
    renderizarPlanos();
  });

  // Filtros de escopo gerencial
  btnPlanosEscopoMeus?.addEventListener("click", () => {
    if (filtroEscopo === "meus") return;
    filtroEscopo = "meus";
    btnPlanosEscopoMeus.classList.add("active");
    btnPlanosEscopoTodos?.classList.remove("active");
    renderizarPlanos();
  });

  btnPlanosEscopoTodos?.addEventListener("click", () => {
    if (filtroEscopo === "todos") return;
    filtroEscopo = "todos";
    btnPlanosEscopoTodos.classList.add("active");
    btnPlanosEscopoMeus?.classList.remove("active");
    renderizarPlanos();
  });

  // Filtros de ordenação
  const botoesOrdenacao = document.querySelectorAll("#planos-filtros-ordenacao .vendas-filter-btn");
  botoesOrdenacao.forEach(btn => {
    btn.addEventListener("click", () => {
      const ordem = btn.getAttribute("data-ordem");
      if (!ordem || ordem === ordemFiltro) return;
      ordemFiltro = ordem;
      botoesOrdenacao.forEach(b => b.classList.toggle("active", b === btn));
      renderizarPlanos();
    });
  });
}
