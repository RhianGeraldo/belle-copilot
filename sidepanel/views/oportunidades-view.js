/**
 * BELLE COPILOT - 💰 OPORTUNIDADES (APLICADORA)
 *
 * Orçamentos em aberto dos ÚLTIMOS 30 DIAS, dentro do módulo Agenda.
 *
 * Divisão de trabalho por idade do orçamento:
 *   0 a 30 dias   → aplicadora, aqui. Ela tem a cliente na cadeira e é quem tem a
 *                   maior chance de fechar.
 *   30d a 4 meses → cai para o Comercial (aba Vendas & Resgate).
 * As duas janelas se encostam em `hoje − 30 dias`, sem buraco entre elas.
 *
 * É também a janela onde a cadência agressiva (D+0/D+1/D+3 no link, D+1 a D+30 no
 * pendente) realmente dispara: no recorte do Comercial todo orçamento já nasce velho.
 */

import { state } from '../core/state.js';
import { buscarVendasPlanosPeriodoApi } from '../core/api-client.js';
import { prepararOrcamentos, formatarReal } from '../engines/cadencia-vendas.js';
import { htmlCardOrcamento, escaparHtml } from '../components/card-orcamento.js';

const JANELA_DIAS = 30;
const FILAS_DA_APLICADORA = ["aguardando", "pendente"];

const oportCards = document.getElementById("opor-cards-container");
const oportEmpty = document.getElementById("opor-empty-state");
const loadingOpor = document.getElementById("loading-oportunidades");
const oportResumo = document.getElementById("opor-resumo");
const oportBusca = document.getElementById("opor-input-busca");
const btnRefreshOpor = document.getElementById("btn-refresh-oportunidades");
const badgeOporTotal = document.getElementById("badge-opor-total");

let orcamentos = [];
let filtroFila = "todos";
let termoBusca = "";
let contatadosSet = new Set();
let ultimaSessao = null;
let carregando = false;

function dataLocalIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function chaveContatados() {
  return `opor_contatados_${state.currentCodEstab || "0"}_${dataLocalIso()}`;
}

async function carregarContatados() {
  const chave = chaveContatados();
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const res = await new Promise(r => chrome.storage.local.get([chave], r));
      if (Array.isArray(res?.[chave])) { contatadosSet = new Set(res[chave]); return; }
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

/** Marca quem está na agenda de hoje: é a cliente que vai sentar na cadeira. */
function cruzarComAgendaDeHoje(lista) {
  const agenda = Array.isArray(state.appointmentsData) ? state.appointmentsData : [];
  if (agenda.length === 0) return lista;

  return lista.map(o => {
    const agendamento = agenda.find(a =>
      a.codCliente && o.codCliente && String(a.codCliente) === String(o.codCliente)
    );
    return agendamento
      ? { ...o, vemHoje: true, horarioHoje: agendamento.horario }
      : { ...o, vemHoje: false };
  });
}

export async function carregarOportunidades(forcar = false) {
  if (carregando) return;

  const token = state.currentToken;
  if (!token) return;

  const chaveSessao = `${state.currentCodEstab}|${token}`;
  if (!forcar && orcamentos.length > 0 && ultimaSessao === chaveSessao) {
    renderizarOportunidades();
    return;
  }

  carregando = true;
  if (loadingOpor) loadingOpor.style.display = "flex";
  if (oportCards) oportCards.style.display = "none";
  if (oportEmpty) oportEmpty.style.display = "none";

  try {
    await carregarContatados();

    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - JANELA_DIAS);

    // Payload próprio, sem herdar filtros de tela (a aba não espelha o Belle aberto).
    const { registros } = await buscarVendasPlanosPeriodoApi(
      token, dataLocalIso(inicio), dataLocalIso(hoje), { limitePorPagina: 100, maxRegistros: 300 }
    );

    orcamentos = prepararOrcamentos(registros).filter(o => FILAS_DA_APLICADORA.includes(o.fila));
    ultimaSessao = chaveSessao;

    console.log(`[Oportunidades] ✅ ${orcamentos.length} orçamento(s) em aberto nos últimos ${JANELA_DIAS} dias ` +
      `(${orcamentos.filter(o => o.fila === "aguardando").length} aguardando, ${orcamentos.filter(o => o.fila === "pendente").length} pendente).`);

    renderizarOportunidades();
  } catch (err) {
    console.error("[Oportunidades] Erro ao carregar:", err);
  } finally {
    carregando = false;
    if (loadingOpor) loadingOpor.style.display = "none";
  }
}

export function renderizarOportunidades() {
  if (!oportCards) return;

  let lista = cruzarComAgendaDeHoje(orcamentos);

  if (filtroFila !== "todos") lista = lista.filter(o => o.fila === filtroFila);

  if (termoBusca) {
    const t = termoBusca.toLowerCase();
    lista = lista.filter(o =>
      o.clienteNome.toLowerCase().includes(t) ||
      o.nomePlano.toLowerCase().includes(t) ||
      String(o.codCliente).includes(t)
    );
  }

  // Quem vem hoje primeiro; depois toque vencido; depois maior valor.
  lista.sort((a, b) => {
    if (a.vemHoje !== b.vemHoje) return a.vemHoje ? -1 : 1;
    const aVenc = a.etapa && !a.etapa.futura ? 0 : 1;
    const bVenc = b.etapa && !b.etapa.futura ? 0 : 1;
    if (aVenc !== bVenc) return aVenc - bVenc;
    return b.valorFinal - a.valorFinal;
  });

  const qtdHoje = lista.filter(o => o.vemHoje).length;
  const totalAberto = orcamentos.length;

  if (badgeOporTotal) {
    badgeOporTotal.textContent = String(totalAberto);
    badgeOporTotal.style.display = totalAberto > 0 ? "inline-block" : "none";
  }

  if (oportResumo) {
    oportResumo.textContent = totalAberto === 0
      ? `Nenhum orçamento em aberto nos últimos ${JANELA_DIAS} dias.`
      : `${totalAberto} orçamento(s) em aberto dos últimos ${JANELA_DIAS} dias` +
        (qtdHoje > 0 ? ` • ${qtdHoje} de cliente(s) que vem hoje` : "") +
        ` • depois de ${JANELA_DIAS} dias passa para o Comercial`;
  }

  document.querySelectorAll(".opor-filter-btn").forEach(btn => {
    const fila = btn.getAttribute("data-fila");
    const cont = fila === "todos" ? totalAberto : orcamentos.filter(o => o.fila === fila).length;
    const span = btn.querySelector(".opor-filter-count");
    if (span) span.textContent = cont;
    btn.classList.toggle("active", fila === filtroFila);
  });

  if (lista.length === 0) {
    oportCards.style.display = "none";
    if (oportEmpty) {
      oportEmpty.style.display = "block";
      oportEmpty.textContent = termoBusca
        ? "Nenhum orçamento encontrado para essa busca."
        : `Nenhum orçamento em aberto nos últimos ${JANELA_DIAS} dias. 🎉`;
    }
    return;
  }

  if (oportEmpty) oportEmpty.style.display = "none";
  oportCards.style.display = "flex";
  oportCards.innerHTML = lista
    .map(o => htmlCardOrcamento(o, { contatado: contatadosSet.has(o.idUnico), vemHoje: o.vemHoje }))
    .join("");
}

export function inicializarOportunidadesView() {
  btnRefreshOpor?.addEventListener("click", () => carregarOportunidades(true));

  oportBusca?.addEventListener("input", (e) => {
    termoBusca = e.target.value.trim();
    renderizarOportunidades();
  });

  document.querySelectorAll(".opor-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      filtroFila = btn.getAttribute("data-fila") || "todos";
      renderizarOportunidades();
    });
  });

  oportCards?.addEventListener("click", async (e) => {
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
      renderizarOportunidades();
    }
  });
}
