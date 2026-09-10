/**
 * BELLE COPILOT - 📝 CONTRATOS SEM ASSINATURA (COMERCIAL)
 *
 * Exibe as vendas de planos dos ÚLTIMOS 30 DIAS cujo contrato digital
 * ainda não foi assinado pela cliente (filtro contrato=2 no Belle Software).
 *
 * Permite que a consultora e a gestão façam cobrança ativa via WhatsApp com script pronto,
 * visualizem clientes que estão na clínica hoje e controlem o status das assinaturas.
 */

import { state } from '../core/state.js';
import { buscarContratosSemAssinaturaApi } from '../core/api-client.js';
import { ehGerente } from '../core/permissions.js';
import {
  registroPertenceAoUsuario,
  valorParaNumero,
  formatarReal,
  diasDesde
} from '../engines/cadencia-vendas.js';
import { escaparHtml } from '../components/card-orcamento.js';

const JANELA_DIAS = 30;

// Elementos da View
const contratosCards = document.getElementById("contratos-cards-container");
const contratosEmpty = document.getElementById("contratos-empty-state");
const loadingContratos = document.getElementById("loading-contratos");
const contratosResumo = document.getElementById("contratos-resumo-periodo");
const contratosInputBusca = document.getElementById("contratos-input-busca");
const btnRefreshContratos = document.getElementById("btn-refresh-contratos");
const badgeContratosTotal = document.getElementById("badge-contratos-total");
const contratosEscopoContainer = document.getElementById("contratos-escopo-container");
const btnContratosEscopoMeus = document.getElementById("btn-contratos-escopo-meus");
const btnContratosEscopoTodos = document.getElementById("btn-contratos-escopo-todos");

// KPIs
const contratosKpiTotal = document.getElementById("contratos-kpi-total");
const contratosKpiValor = document.getElementById("contratos-kpi-valor");
const contratosKpiHoje = document.getElementById("contratos-kpi-hoje");

// Contadores de Filtros
const countContratosTodos = document.getElementById("count-contratos-todos");
const countContratosHoje = document.getElementById("count-contratos-hoje");

let contratos = [];
let filtroEscopo = "todos"; // "meus" | "todos"
let filtroFila = "todos";  // "todos" | "hoje"
let termoBusca = "";
let contatadosSet = new Set();
let ultimaSessao = null;
let carregando = false;

function dataLocalIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dataBrCurta(iso = "") {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : iso;
}

function textoIdade(dias) {
  if (dias === null || dias === undefined) return "";
  if (dias === 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}

function chaveContatados() {
  return `contratos_contatados_${state.currentCodEstab || "0"}_${dataLocalIso()}`;
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

/**
 * Cruza a lista de contratos com a agenda do dia: identifica quem sentará na cadeira hoje
 * para colher a assinatura presencialmente!
 */
function cruzarComAgendaDeHoje(lista) {
  const agenda = Array.isArray(state.appointmentsData) ? state.appointmentsData : [];
  if (agenda.length === 0) return lista;

  return lista.map(c => {
    const agendamento = agenda.find(a => {
      const matchCod = a.codCliente && c.codCliente && String(a.codCliente) === String(c.codCliente);
      if (matchCod) return true;
      const telA = String(a.telefone || "").replace(/\D/g, "");
      const telC = String(c.telefone || "").replace(/\D/g, "");
      return telA && telC && telA.length >= 8 && telA === telC;
    });
    return agendamento
      ? { ...c, vemHoje: true, horarioHoje: agendamento.horario || "" }
      : { ...c, vemHoje: false, horarioHoje: "" };
  });
}

/**
 * Normaliza os registros brutos da Belle API (vendasplanos com contrato=2)
 */
export function prepararContratos(registros = []) {
  return (Array.isArray(registros) ? registros : []).map(r => {
    const codOrcamento = r.cod_orcamento;
    const codCliente = r.cod_paciente || r.cod_cliente || "";
    const clienteNome = (r.nom_paciente || "Cliente").trim();
    const telefone = r.celular || "";
    const cpf = r.cpf || "";
    const email = r.email || "";
    const nomePlano = (r.nomePlano || "Plano").trim();
    const valorFinal = valorParaNumero(r.preco_final || r.total || r.preco);
    const valorCheio = valorParaNumero(r.preco);
    const descontoPct = valorParaNumero(r.desconto);
    const dataProposta = r.dtProp || r.dt_inclusao || "";
    const diasCorridos = diasDesde(dataProposta);
    const vendedora = (r.nom_usuario || r.nom_vendedor || "").trim();
    const codUsuario = r.cod_usuario || r.cod_vendedor || "";
    const formaPagamento = (r.labelFormasPag || "").trim();
    const status = (r.stOrc || "Aprovado").trim();
    const idUnico = `contrato_${codOrcamento}_${codCliente}`;

    // Script personalizado para lembrete de assinatura
    const primeiroNome = clienteNome.split(" ")[0] || "Cliente";
    const script = `Oi ${primeiroNome}, tudo bem? Aqui é da Estética e Laser 💙 Passando para lembrar da assinatura digital do contrato do seu ${nomePlano}. É super rápido pelo celular e já garante a liberação de todas as suas sessões! Se precisar de qualquer ajuda, me avisa por aqui.`;

    return {
      idUnico,
      codOrcamento,
      codCliente,
      clienteNome,
      telefone,
      cpf,
      email,
      nomePlano,
      valorFinal,
      valorCheio,
      descontoPct,
      dataProposta,
      diasCorridos,
      vendedora,
      codUsuario,
      formaPagamento,
      status,
      script,
      raw: r
    };
  });
}

/**
 * Consulta na API do Belle todos os contratos sem assinatura dos últimos 30 dias.
 */
export async function carregarContratos(forcar = false) {
  if (carregando) return;

  const token = state.currentToken;
  if (!token) return;

  const chaveSessao = `${state.currentCodEstab}|${token}`;
  if (!forcar && contratos.length > 0 && ultimaSessao === chaveSessao) {
    renderizarContratos();
    return;
  }

  carregando = true;
  if (loadingContratos) loadingContratos.style.display = "flex";
  if (contratosCards) contratosCards.style.display = "none";
  if (contratosEmpty) contratosEmpty.style.display = "none";

  try {
    await carregarContatados();

    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - JANELA_DIAS);
    const dataFimIso = dataLocalIso(hoje);
    const dataIniIso = dataLocalIso(inicio);

    if (contratosResumo) {
      contratosResumo.textContent = `Últimos ${JANELA_DIAS} dias (${dataBrCurta(dataIniIso)} a ${dataBrCurta(dataFimIso)}) • Contratos aguardando assinatura digital do cliente.`;
    }

    const { registros } = await buscarContratosSemAssinaturaApi(
      token, dataIniIso, dataFimIso, { limitePorPagina: 100, maxRegistros: 400 }
    );

    const normalizados = prepararContratos(registros);
    contratos = cruzarComAgendaDeHoje(normalizados);
    ultimaSessao = chaveSessao;

    console.log(`[Contratos] ✅ ${contratos.length} contrato(s) sem assinatura nos últimos ${JANELA_DIAS} dias.`);
    renderizarContratos();
  } catch (err) {
    console.error("[Contratos] Erro ao carregar contratos sem assinatura:", err);
  } finally {
    carregando = false;
    if (loadingContratos) loadingContratos.style.display = "none";
  }
}

/**
 * Retorna os contratos visíveis para a usuária atual com base nas permissões e escopo.
 */
export function obterContratosVisiveis() {
  let lista = contratos;

  // 1. Filtro de escopo do usuário
  if (filtroEscopo === "meus") {
    const meus = lista.filter(c => registroPertenceAoUsuario(c));
    if (meus.length > 0 || !ehGerente()) {
      lista = meus;
    }
  }

  // 2. Filtro de aba rápida
  if (filtroFila === "hoje") {
    lista = lista.filter(c => c.vemHoje);
  }

  // 3. Busca por texto
  if (termoBusca) {
    lista = lista.filter(c => {
      const matchNome = (c.clienteNome || "").toLowerCase().includes(termoBusca);
      const matchPlano = (c.nomePlano || "").toLowerCase().includes(termoBusca);
      const matchTel = (c.telefone || "").includes(termoBusca);
      const matchOrc = String(c.codOrcamento || "").includes(termoBusca);
      const matchCpf = (c.cpf || "").includes(termoBusca);
      const matchVend = (c.vendedora || "").toLowerCase().includes(termoBusca);
      return matchNome || matchPlano || matchTel || matchOrc || matchCpf || matchVend;
    });
  }

  // 4. Ordenação inteligente: clientes na clínica hoje primeiro, depois propostas mais recentes
  return lista.sort((a, b) => {
    if (a.vemHoje && !b.vemHoje) return -1;
    if (!a.vemHoje && b.vemHoje) return 1;
    return (a.diasCorridos ?? 999) - (b.diasCorridos ?? 999);
  });
}

function htmlCardContrato(c, { contatado = false } = {}) {
  const cor = c.vemHoje ? "#15803d" : "#d97706";

  return `
    <div class="vendas-card ${contatado ? "vendas-card-feito" : ""} ${c.vemHoje ? "vendas-card-hoje" : ""}"
         style="border-left-color: ${cor};" data-id="${escaparHtml(c.idUnico)}">
      <div class="vendas-card-topo">
        <div class="vendas-card-cli">
          <strong class="vendas-card-nome">👤 ${escaparHtml(c.clienteNome)}</strong>
          <span class="vendas-card-identificacao">
            ${c.codCliente ? `🆔 ${escaparHtml(String(c.codCliente))}` : ""}
            ${c.telefone ? ` • 📱 ${escaparHtml(c.telefone)}` : ""}
            ${c.cpf ? ` • CPF ${escaparHtml(c.cpf)}` : ""}
          </span>
          <span class="vendas-card-meta">
            Orçamento #${escaparHtml(String(c.codOrcamento))} • Proposta em ${escaparHtml(c.dataProposta || "—")}${c.diasCorridos !== null ? ` (${textoIdade(c.diasCorridos)})` : ""}
            ${c.vendedora ? ` • 🧑‍💼 ${escaparHtml(c.vendedora)}` : ""}
          </span>
        </div>
        <span class="vendas-card-valor" style="color: #b45309;">${formatarReal(c.valorFinal)}</span>
      </div>

      ${c.vemHoje ? `<div class="vendas-selo-hoje">📅 Está na agenda de hoje${c.horarioHoje ? ` às ${escaparHtml(c.horarioHoje)}` : ""} — Pegue a assinatura na recepção ou cabine!</div>` : ""}

      <div class="vendas-card-plano">
        💎 ${escaparHtml(c.nomePlano)}
        ${c.descontoPct > 0 ? `<span class="vendas-desc-tag">−${c.descontoPct}%</span>` : ""}
        <span class="vendas-etapa-tag vendas-etapa-atrasada" style="background: #fef3c7; color: #92400e; border: 1px solid #fde68a;">⚠️ Assinatura pendente</span>
        ${c.formaPagamento ? `<span class="vendas-link-tag" title="${escaparHtml(c.formaPagamento)}">💳 ${escaparHtml(c.formaPagamento.substring(0, 32))}${c.formaPagamento.length > 32 ? "..." : ""}</span>` : ""}
      </div>

      <div class="vendas-card-script" style="margin-top: 6px;">${escaparHtml(c.script)}</div>

      <div class="vendas-card-acoes">
        <button type="button" class="btn-contratos-copiar" data-script="${escaparHtml(c.script)}">📋 Copiar</button>
        <button type="button" class="btn-contratos-feito" data-id="${escaparHtml(c.idUnico)}">
          ${contatado ? "✅ Cobrado hoje" : "☑️ Marcar cobrado"}
        </button>
      </div>
    </div>`;
}

/**
 * Renderiza os cards e atualiza os contadores/KPIs da tela.
 */
export function renderizarContratos() {
  if (!contratosCards) return;

  // Atualiza visibilidade do escopo gerencial
  if (contratosEscopoContainer) {
    contratosEscopoContainer.style.display = ehGerente() ? "flex" : "none";
    contratosEscopoContainer.querySelectorAll(".btn-escopo-toggle").forEach(btn => {
      btn.classList.toggle("active", btn.getAttribute("data-escopo") === filtroEscopo);
    });
  }

  // Lista base pelo escopo do usuário (para KPIs)
  let baseEscopo = contratos;
  if (filtroEscopo === "meus") {
    const meus = contratos.filter(c => registroPertenceAoUsuario(c));
    if (meus.length > 0 || !ehGerente()) {
      baseEscopo = meus;
    }
  }

  const totalBase = baseEscopo.length;
  const valorTotalBase = baseEscopo.reduce((acc, c) => acc + (c.valorFinal || 0), 0);
  const totalHojeBase = baseEscopo.filter(c => c.vemHoje).length;

  // Atualiza KPIs
  if (contratosKpiTotal) contratosKpiTotal.textContent = String(totalBase);
  if (contratosKpiValor) contratosKpiValor.textContent = formatarReal(valorTotalBase);
  if (contratosKpiHoje) contratosKpiHoje.textContent = String(totalHojeBase);

  // Atualiza contadores dos filtros
  if (countContratosTodos) countContratosTodos.textContent = String(totalBase);
  if (countContratosHoje) countContratosHoje.textContent = String(totalHojeBase);

  // Atualiza badge na aba
  if (badgeContratosTotal) {
    badgeContratosTotal.textContent = String(totalBase);
    badgeContratosTotal.style.display = totalBase > 0 ? "inline-block" : "none";
  }

  // Obtém contratos visíveis considerando busca e sub-filtros
  const listaVisivel = obterContratosVisiveis();

  if (listaVisivel.length === 0) {
    contratosCards.style.display = "none";
    if (contratosEmpty) {
      if (termoBusca) {
        contratosEmpty.innerHTML = `🔍 Nenhum contrato encontrado para <strong>"${escaparHtml(termoBusca)}"</strong>.`;
      } else if (filtroFila === "hoje") {
        contratosEmpty.innerHTML = `📅 Nenhuma cliente com contrato pendente de assinatura está agendada para hoje.`;
      } else if (filtroEscopo === "meus") {
        contratosEmpty.innerHTML = `🎉 Parabéns! Você não possui contratos pendentes de assinatura nos últimos ${JANELA_DIAS} dias.`;
      } else {
        contratosEmpty.innerHTML = `🎉 Nenhum contrato pendente de assinatura encontrado na unidade nos últimos ${JANELA_DIAS} dias.`;
      }
      contratosEmpty.style.display = "block";
    }
    return;
  }

  if (contratosEmpty) contratosEmpty.style.display = "none";
  contratosCards.style.display = "flex";
  contratosCards.innerHTML = listaVisivel
    .map(c => htmlCardContrato(c, { contatado: contatadosSet.has(c.idUnico) }))
    .join("");
}

/**
 * Inicializa eventos da tela de contratos
 */
export function inicializarContratosView() {
  btnRefreshContratos?.addEventListener("click", async () => {
    await carregarContratos(true);
  });

  contratosInputBusca?.addEventListener("input", (e) => {
    termoBusca = e.target.value.toLowerCase().trim();
    renderizarContratos();
  });

  // Filtros de escopo gerencial
  btnContratosEscopoMeus?.addEventListener("click", () => {
    if (filtroEscopo === "meus") return;
    filtroEscopo = "meus";
    btnContratosEscopoMeus.classList.add("active");
    btnContratosEscopoTodos?.classList.remove("active");
    renderizarContratos();
  });

  btnContratosEscopoTodos?.addEventListener("click", () => {
    if (filtroEscopo === "todos") return;
    filtroEscopo = "todos";
    btnContratosEscopoTodos.classList.add("active");
    btnContratosEscopoMeus?.classList.remove("active");
    renderizarContratos();
  });

  // Filtros rápidos
  const filterBtns = document.querySelectorAll("#contratos-filtros-container .vendas-filter-btn");
  filterBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const f = btn.getAttribute("data-filtro");
      if (!f || f === filtroFila) return;
      filtroFila = f;
      filterBtns.forEach(b => b.classList.toggle("active", b === btn));
      renderizarContratos();
    });
  });

  // Ações nos cards (Copiar e Marcar feito)
  contratosCards?.addEventListener("click", async (e) => {
    const copiar = e.target.closest(".btn-contratos-copiar");
    if (copiar) {
      try {
        await navigator.clipboard.writeText(copiar.getAttribute("data-script") || "");
        const original = copiar.textContent;
        copiar.textContent = "✅ Copiado!";
        setTimeout(() => { copiar.textContent = original; }, 1500);
      } catch (err) {}
      return;
    }

    const feito = e.target.closest(".btn-contratos-feito");
    if (feito) {
      const id = feito.getAttribute("data-id");
      if (contatadosSet.has(id)) {
        contatadosSet.delete(id);
      } else {
        contatadosSet.add(id);
      }
      await salvarContatados();
      renderizarContratos();
    }
  });
}
