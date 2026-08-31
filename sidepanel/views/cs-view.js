/**
 * BELLE COPILOT - VIEW DE SUCESSO DO CLIENTE (CS / PÓS-ATENDIMENTO)
 * Acompanhamento pós-laser automático em 24h (D+1) e 3 dias (D+3).
 * Fixo no "HOJE" real, filtrando exclusivamente atendimentos finalizados/atendidos.
 */

import { state } from '../core/state.js';
import { buscarAgendaApi, montarArrGridDeGridSala, buscarGridSalaApi } from '../core/api-client.js';
import { resolverSessaoBelle, aplicarSessaoNoEstado } from '../core/session.js';
import { processarItensAgenda } from './agenda-view.js';

// Elementos da Interface
const tabNavCs = document.getElementById("tab-nav-cs");
const badgeCsTotal = document.getElementById("badge-cs-total");
const csCardsContainer = document.getElementById("cs-cards-container");
const csEmptyState = document.getElementById("cs-empty-state");
const loadingCs = document.getElementById("loading-cs");
const csInputBusca = document.getElementById("cs-input-busca");
const btnRefreshCs = document.getElementById("btn-refresh-cs");
const csUnidadeAtiva = document.getElementById("cs-unidade-ativa");

// KPIs de CS
const csKpiTotal = document.getElementById("cs-kpi-total");
const csKpi24h = document.getElementById("cs-kpi-24h");
const csKpi3d = document.getElementById("cs-kpi-3d");
const csKpiContatados = document.getElementById("cs-kpi-contatados");

// Botões de Filtro
const csFilterBtns = document.querySelectorAll(".cs-filter-btn");

// Estado em Memória da View de CS
let csClientesAgrupados = [];
let csFiltroAtivo = "todos"; // "todos" | "24h" | "3d" | "contatados"
let csTermoBusca = "";
let csContatadosSet = new Set();
let csUltimaSessao = null; // `${unidade}|${token}` — no Belle é o token que define a filial
let csArrGridSala = null;  // grid de SALAS da unidade, próprio do CS (não é o da tela do Belle)
let isLoadingCs = false;

/**
 * Mostra na aba a unidade a que os contatos pertencem. O CS consulta datas passadas por
 * conta própria, então deixar a filial visível é a checagem imediata da operadora.
 */
function atualizarRotuloUnidadeCs(unidade) {
  if (!csUnidadeAtiva) return;

  if (!unidade) {
    csUnidadeAtiva.textContent = "⚠️ Sem sessão do Belle";
    csUnidadeAtiva.className = "cs-unidade-tag cs-unidade-tag-erro";
    return;
  }

  csUnidadeAtiva.textContent = `🏢 ${state.currentClinicaNome || "Unidade"} · #${unidade}`;
  csUnidadeAtiva.className = "cs-unidade-tag";
}

/**
 * Retorna uma data no formato ISO YYYY-MM-DD respeitando o fuso local do navegador.
 */
export function getLocalDateIsoString(dateObj = new Date()) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Formata string YYYY-MM-DD para DD/MM/YYYY
 */
export function formatarDataBr(isoString = "") {
  if (!isoString) return "";
  const partes = isoString.split("-");
  if (partes.length === 3) {
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }
  return isoString;
}

/**
 * Carrega a lista de clientes já contatados hoje do storage local.
 */
async function carregarContatadosHoje() {
  const hojeIso = getLocalDateIsoString(new Date());
  const codEstab = String(state.currentCodEstab || "1");
  const storageKey = `cs_contatados_${codEstab}_${hojeIso}`;

  try {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      const res = await new Promise((resolve) => {
        chrome.storage.local.get([storageKey], resolve);
      });
      if (res && Array.isArray(res[storageKey])) {
        csContatadosSet = new Set(res[storageKey]);
        return;
      }
    }
  } catch (e) {
    console.warn("[CS] Erro ao carregar contatados do storage:", e);
  }

  // Fallback para localStorage
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        csContatadosSet = new Set(parsed);
      }
    }
  } catch (e) {}
}

/**
 * Salva a lista de contatados de hoje no storage local.
 */
async function salvarContatadosHoje() {
  const hojeIso = getLocalDateIsoString(new Date());
  const codEstab = String(state.currentCodEstab || "1");
  const storageKey = `cs_contatados_${codEstab}_${hojeIso}`;
  const list = Array.from(csContatadosSet);

  try {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      await new Promise((resolve) => {
        chrome.storage.local.set({ [storageKey]: list }, resolve);
      });
    }
  } catch (e) {}

  try {
    localStorage.setItem(storageKey, JSON.stringify(list));
  } catch (e) {}
}

/**
 * Sanitiza e formata número de telefone para o padrão WhatsApp internacional (55 + DDD + Número)
 */
export function sanitizarNumeroWhatsapp(telefone = "") {
  if (!telefone) return "";
  const digitos = telefone.replace(/\D/g, "");
  if (!digitos) return "";
  
  // Se já tem 55 e tem 12 ou 13 dígitos
  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) {
    return digitos;
  }
  // Se tem 10 ou 11 dígitos (DDD + número)
  if (digitos.length === 10 || digitos.length === 11) {
    return `55${digitos}`;
  }
  // Se tem 8 ou 9 dígitos (sem DDD, não é confiável disparar direto, mas mantemos os dígitos)
  return digitos;
}

/**
 * Gera mensagem personalizada e empática para contato de CS.
 */
export function gerarScriptWhatsApp(cliente, tipo = "24h") {
  const nomeCompleto = (cliente.clienteNome || "Cliente").trim();
  const primeiroNome = nomeCompleto.split(" ")[0] || "Cliente";
  const clinicaNome = state.currentClinicaNome || "nossa clínica";
  const areasTexto = (cliente.areasTratadas && cliente.areasTratadas.length > 0)
    ? cliente.areasTratadas.join(", ")
    : (cliente.procedimento || "suas áreas a laser");

  if (tipo === "24h") {
    return `Olá, ${primeiroNome}! Tudo bem? 🥰\n\nAqui é da ${clinicaNome}. Passando para saber como você está se sentindo e como sua pele está reagindo após a sessão de laser de ontem em *${areasTexto}*! ✨\n\n💧 *Dica importante de 24h:* Lembre-se de manter as regiões bem hidratadas, evitar água muito quente no banho e aplicar protetor solar se a área ficar exposta ao sol.\n\nSe tiver qualquer dúvida ou sensibilidade, pode nos chamar por aqui! Tenha um ótimo dia! 💖`;
  } else {
    return `Olá, ${primeiroNome}! Tudo bem? ✨\n\nAqui é da ${clinicaNome}. Já se passaram 3 dias da sua sessão de laser em *${areasTexto}* e passamos para saber como está a recuperação e evolução da sua pele! 🌸\n\n✨ *Acompanhamento:* Nos próximos dias, os pelinhos tratados começam a se soltar naturalmente. Mantenha a hidratação diária em dia!\n\nComo você está se sentindo? Qualquer dúvida ou suporte que precisar, conte sempre conosco! 🥰`;
  }
}

/**
 * Agrupa múltiplos agendamentos da mesma cliente no mesmo dia em um único registro consolidado.
 */
function agregarAgendamentosCliente(rawList, tipo = "24h", dataAtendimento = "") {
  if (!Array.isArray(rawList) || rawList.length === 0) return [];

  // Filtra ESTRITAMENTE agendamentos finalizados/atendidos
  const atendidos = rawList.filter(app => {
    if (app.isBloqueado || app.status === "bloqueado") return false;
    const rawSts = (app.statusFormatado || app.statusAgendamento || app.status || "").toLowerCase();
    const stsNorm = (app.status || "").toLowerCase();
    return stsNorm === "finalizado" || rawSts.includes("atendid") || rawSts.includes("finaliz") || rawSts.includes("conclu");
  });

  const clienteMap = new Map();

  atendidos.forEach(app => {
    // Chave única prioritária: codCliente, cpf, telefone ou nome
    const key = String(app.codCliente || app.cpf || app.telefone || app.clienteNome || "").trim().toLowerCase();
    if (!key) return;

    if (!clienteMap.has(key)) {
      clienteMap.set(key, {
        idUnico: `${tipo}_${key}_${dataAtendimento}`,
        keyCliente: key,
        codCliente: app.codCliente || "",
        clienteNome: app.clienteNome || "Cliente",
        telefone: app.telefone || "",
        cpf: app.cpf || "",
        salaNome: app.salaNome || "Sala Laser",
        profissional: app.profissional || "Aplicadora",
        horario: app.horario || "08:00",
        tipoContato: tipo, // "24h" | "3d"
        dataAtendimento: dataAtendimento,
        dataAtendimentoBr: formatarDataBr(dataAtendimento),
        areasTratadas: [],
        lbServLista: [],
        agendamentosIds: [app.id || app.codConsulta]
      });
    }

    const reg = clienteMap.get(key);
    if (!reg.agendamentosIds.includes(app.id || app.codConsulta)) {
      reg.agendamentosIds.push(app.id || app.codConsulta);
    }

    // Extrai nomes das áreas tratadas
    if (Array.isArray(app.arrServ) && app.arrServ.length > 0) {
      app.arrServ.forEach(s => {
        const nomeS = (s.nome || s.nom_servico || "").trim();
        if (nomeS && !reg.areasTratadas.includes(nomeS)) {
          reg.areasTratadas.push(nomeS);
        }
      });
    } else if (app.procedimento && !reg.areasTratadas.includes(app.procedimento.trim())) {
      reg.areasTratadas.push(app.procedimento.trim());
    }

    if (app.lbServ && !reg.lbServLista.includes(app.lbServ)) {
      reg.lbServLista.push(app.lbServ);
    }
  });

  return Array.from(clienteMap.values());
}

/**
 * Busca dados da API do Belle Software para as datas D-1 e D-3 e consolida a lista de CS.
 */
export async function carregarSucessoCliente(forceReload = false) {
  if (isLoadingCs) return;
  isLoadingCs = true;

  try {
    // 1. UNIDADE LOGADA. O CS consulta datas passadas por conta própria (não há requisição
    //    do Belle para reaproveitar), então ele precisa resolver a sessão da mesma forma
    //    que a Agenda do Dia: unidade da aba do Belle + token_<unidade>.
    //    No Belle, quem seleciona a filial é o TOKEN — etb/estabGeral/cod_clinica são "1"
    //    em todas as unidades e não podem ser usados como identificação.
    let codEstab = String(state.currentCodEstab || "");
    let authTok = state.currentToken || "";

    if (!authTok || !codEstab) {
      const sessao = await resolverSessaoBelle();
      aplicarSessaoNoEstado(sessao);
      codEstab = String(state.currentCodEstab || "");
      authTok = state.currentToken || "";
    }

    if (!authTok) {
      console.warn("[CS] Sem token da unidade logada para carregar o pós-atendimento.");
      atualizarRotuloUnidadeCs(null);
      csClientesAgrupados = [];
      atualizarKpisCs();
      if (csCardsContainer) csCardsContainer.style.display = "none";
      if (csEmptyState) csEmptyState.style.display = "block";
      return;
    }

    // 2. Cache amarrado à sessão (unidade + token). Só a unidade não basta: se o token
    //    trocar, os dados em memória são de outra filial mesmo com o mesmo número.
    const chaveSessao = `${codEstab}|${authTok}`;
    if (csClientesAgrupados.length > 0 && !forceReload && csUltimaSessao === chaveSessao) {
      atualizarRotuloUnidadeCs(codEstab);
      atualizarKpisCs();
      renderizarCsView();
      return;
    }

    if (csUltimaSessao && csUltimaSessao !== chaveSessao) {
      console.log("[CS] 🔄 Sessão/unidade mudou: descartando o pós-atendimento carregado anteriormente.");
      csClientesAgrupados = [];
      csArrGridSala = null;
    }

    if (loadingCs) loadingCs.style.display = "flex";
    if (csCardsContainer) csCardsContainer.style.display = "none";
    if (csEmptyState) csEmptyState.style.display = "none";
    atualizarRotuloUnidadeCs(codEstab);

    await carregarContatadosHoje();

    // 3. Grid de SALAS próprio do CS. Ele consulta sempre no modo sala (`tpAgenda: "sala"`),
    //    então não pode reaproveitar o grid da tela do Belle: se a operadora estiver com a
    //    agenda em outro modo (profissional, por exemplo), aquele grid não casa com a
    //    consulta e a resposta vem vazia. Também não sobrescreve o grid global, que
    //    pertence à Agenda do Dia.
    if (!csArrGridSala) {
      console.log(`[CS] 🔄 Buscando grid de salas da unidade logada #${codEstab}...`);
      const salas = await buscarGridSalaApi(authTok, codEstab);
      if (Array.isArray(salas) && salas.length > 0) {
        csArrGridSala = montarArrGridDeGridSala(salas, codEstab);
        if (salas[0]?.nom_clinica) {
          state.currentClinicaNome = salas[0].nom_clinica;
          atualizarRotuloUnidadeCs(codEstab);
        }
      }
    }

    const arrGrid = csArrGridSala;
    if (!arrGrid || arrGrid.length === 0) {
      console.warn(`[CS] ⚠️ Não foi possível obter o grid de salas da unidade #${codEstab}; a consulta do pós-atendimento pode voltar vazia.`);
    }

    // CÁLCULO DE DATAS COM BASE NO "HOJE" REAL
    const hoje = new Date();
    const diaDaSemanaHoje = hoje.getDay(); // 0 = Domingo, 1 = Segunda, etc.

    // 1. D-1 (24 Horas / Ontem)
    const dataOntemObj = new Date(hoje);
    dataOntemObj.setDate(hoje.getDate() - 1);
    const dataOntemIso = getLocalDateIsoString(dataOntemObj);

    // 2. D-3 (3 Dias Atrás)
    const data3DiasObj = new Date(hoje);
    data3DiasObj.setDate(hoje.getDate() - 3);
    const data3DiasIso = getLocalDateIsoString(data3DiasObj);

    console.log(`[CS] 📅 Buscando pós-atendimentos da Unidade #${codEstab} (${state.currentClinicaNome}) para: 24h (${dataOntemIso}) e 3 Dias (${data3DiasIso})`);

    // Dispara consultas paralelas para D-1 e D-3 para a unidade ativa
    // `herdarFiltrosDaPagina: false` — o CS consulta datas passadas, não a tela aberta.
    // Herdar o payload da página trazia junto os filtros de visualização do momento
    // (modo de grade, verTodas, finaliz, cliente selecionado) e podia zerar o resultado.
    const opcoesCs = { herdarFiltrosDaPagina: false };
    const promessas = [
      buscarAgendaApi(authTok, dataOntemIso, arrGrid, codEstab, opcoesCs),
      buscarAgendaApi(authTok, data3DiasIso, arrGrid, codEstab, opcoesCs)
    ];

    // Se hoje for Segunda-feira (1), domingo não costuma ter atendimentos; buscamos também o Sábado (D-2)
    let dataSabadoIso = null;
    if (diaDaSemanaHoje === 1) {
      const dataSabadoObj = new Date(hoje);
      dataSabadoObj.setDate(hoje.getDate() - 2);
      dataSabadoIso = getLocalDateIsoString(dataSabadoObj);
      promessas.push(buscarAgendaApi(authTok, dataSabadoIso, arrGrid, codEstab, opcoesCs));
    }

    const resultados = await Promise.all(promessas);
    const rawAgendaOntem = resultados[0] || [];
    const rawAgenda3Dias = resultados[1] || [];
    const rawAgendaSabado = diaDaSemanaHoje === 1 ? (resultados[2] || []) : [];

    console.log(`[CS] 📊 Retorno bruto da agenda — 24h (${dataOntemIso}): ${rawAgendaOntem.length} registro(s) | 3 dias (${data3DiasIso}): ${rawAgenda3Dias.length}${dataSabadoIso ? ` | sábado (${dataSabadoIso}): ${rawAgendaSabado.length}` : ""}`);

    const itensOntem = processarItensAgenda(rawAgendaOntem);
    const itens3Dias = processarItensAgenda(rawAgenda3Dias);
    const itensSabado = processarItensAgenda(rawAgendaSabado);

    // Se veio agenda mas nenhum finalizado, o problema é o status e não a consulta:
    // mostra quais status vieram para não virar "sumiu" sem explicação.
    const statusVistos = [...new Set([...itensOntem, ...itens3Dias, ...itensSabado].map(i => i.statusFormatado).filter(Boolean))];
    if (statusVistos.length > 0) {
      console.log(`[CS] 🏷️ Status encontrados nesses dias: ${statusVistos.join(", ")}`);
    }

    // Agrupa e consolida
    let lista24h = agregarAgendamentosCliente(itensOntem, "24h", dataOntemIso);

    // Se for segunda e ontem teve 0 ou poucos atendimentos, adiciona o sábado como 24h/final de semana
    if (diaDaSemanaHoje === 1 && itensSabado.length > 0) {
      const listaSabado = agregarAgendamentosCliente(itensSabado, "24h", dataSabadoIso);
      lista24h = [...lista24h, ...listaSabado];
    }

    const lista3d = agregarAgendamentosCliente(itens3Dias, "3d", data3DiasIso);

    csClientesAgrupados = [...lista24h, ...lista3d];
    csUltimaSessao = `${codEstab}|${authTok}`;

    console.log(`[CS] ✅ Encontrados ${csClientesAgrupados.length} clientes atendidos para acompanhamento na Unidade #${codEstab} (${lista24h.length} em 24h, ${lista3d.length} em 3d).`);

    if (csClientesAgrupados.length === 0 && (rawAgendaOntem.length > 0 || rawAgenda3Dias.length > 0)) {
      console.warn("[CS] ⚠️ A agenda desses dias voltou com registros, mas nenhum como Atendido/Finalizado. O CS só acompanha atendimentos concluídos.");
    }

    atualizarKpisCs();
    renderizarCsView();
  } catch (err) {
    console.error("[CS] Erro ao carregar sucesso do cliente:", err);
  } finally {
    isLoadingCs = false;
    if (loadingCs) loadingCs.style.display = "none";
  }
}

/**
 * Atualiza os indicadores no topo da aba de CS e o badge da sub-aba.
 */
export function atualizarKpisCs() {
  const total = csClientesAgrupados.length;
  const lista24h = csClientesAgrupados.filter(c => c.tipoContato === "24h");
  const lista3d = csClientesAgrupados.filter(c => c.tipoContato === "3d");

  let contatadosCount = 0;
  let pendentes24h = 0;
  let pendentes3d = 0;

  csClientesAgrupados.forEach(c => {
    const isFeito = csContatadosSet.has(c.idUnico);
    if (isFeito) {
      contatadosCount++;
    } else {
      if (c.tipoContato === "24h") pendentes24h++;
      else pendentes3d++;
    }
  });

  const totalPendentes = pendentes24h + pendentes3d;

  if (csKpiTotal) csKpiTotal.textContent = total;
  if (csKpi24h) csKpi24h.textContent = pendentes24h;
  if (csKpi3d) csKpi3d.textContent = pendentes3d;
  if (csKpiContatados) csKpiContatados.textContent = contatadosCount;

  // Atualiza badge de contagem na sub-aba
  if (badgeCsTotal) {
    badgeCsTotal.textContent = totalPendentes;
    badgeCsTotal.style.display = totalPendentes > 0 ? "inline-block" : "none";
  }

  // Atualiza badges dos filtros internos
  const cBadgeTodos = document.getElementById("cs-filter-count-todos");
  const cBadge24h = document.getElementById("cs-filter-count-24h");
  const cBadge3d = document.getElementById("cs-filter-count-3d");
  const cBadgeContatados = document.getElementById("cs-filter-count-contatados");

  if (cBadgeTodos) cBadgeTodos.textContent = total;
  if (cBadge24h) cBadge24h.textContent = lista24h.length;
  if (cBadge3d) cBadge3d.textContent = lista3d.length;
  if (cBadgeContatados) cBadgeContatados.textContent = contatadosCount;
}

/**
 * Alterna o status de contatado de um cliente
 */
export async function alternarContatadoCliente(idUnico) {
  if (!idUnico) return;

  if (csContatadosSet.has(idUnico)) {
    csContatadosSet.delete(idUnico);
  } else {
    csContatadosSet.add(idUnico);
  }

  await salvarContatadosHoje();
  atualizarKpisCs();
  renderizarCsView();
}

/**
 * Renderiza a lista de cards de CS no DOM.
 */
export function renderizarCsView() {
  if (!csCardsContainer) return;

  const termo = (csTermoBusca || "").toLowerCase().trim();

  const filtrados = csClientesAgrupados.filter(item => {
    const isContatado = csContatadosSet.has(item.idUnico);

    // Filtro por Tabulação
    if (csFiltroAtivo === "24h" && item.tipoContato !== "24h") return false;
    if (csFiltroAtivo === "3d" && item.tipoContato !== "3d") return false;
    if (csFiltroAtivo === "pendentes" && isContatado) return false;
    if (csFiltroAtivo === "contatados" && !isContatado) return false;

    // Filtro por Busca
    if (termo) {
      const nome = (item.clienteNome || "").toLowerCase();
      const tel = (item.telefone || "").replace(/\D/g, "");
      const cpf = (item.cpf || "").replace(/\D/g, "");
      const areas = (item.areasTratadas || []).join(" ").toLowerCase();

      if (!nome.includes(termo) && !tel.includes(termo) && !cpf.includes(termo) && !areas.includes(termo)) {
        return false;
      }
    }

    return true;
  });

  // Ordena: pendentes primeiro, depois por horário
  filtrados.sort((a, b) => {
    const aFeito = csContatadosSet.has(a.idUnico) ? 1 : 0;
    const bFeito = csContatadosSet.has(b.idUnico) ? 1 : 0;
    if (aFeito !== bFeito) return aFeito - bFeito;
    return (a.horario || "").localeCompare(b.horario || "");
  });

  if (filtrados.length === 0) {
    csCardsContainer.innerHTML = "";
    csCardsContainer.style.display = "none";
    if (csEmptyState) {
      csEmptyState.style.display = "block";
      const pMsg = csEmptyState.querySelector("p");
      if (pMsg) {
        if (csClientesAgrupados.length === 0) {
          pMsg.textContent = "Nenhum atendimento finalizado encontrado em 24h ou 3 dias atrás.";
        } else {
          pMsg.textContent = "Nenhum contato corresponde ao filtro ou busca selecionada.";
        }
      }
    }
    return;
  }

  if (csEmptyState) csEmptyState.style.display = "none";
  csCardsContainer.style.display = "flex";

  let html = "";

  filtrados.forEach(cliente => {
    const isContatado = csContatadosSet.has(cliente.idUnico);
    const is24h = cliente.tipoContato === "24h";

    const badgeTipoClass = is24h ? "badge-cs-24h" : "badge-cs-3d";
    const badgeTipoIcon = is24h ? "⚡" : "🌿";
    const badgeTipoLabel = is24h ? "24h (Ontem)" : "3 Dias Pós-Sessão";
    const cardExtraClass = isContatado ? "cs-card-concluido" : (is24h ? "cs-card-24h" : "cs-card-3d");

    const wppNumero = sanitizarNumeroWhatsapp(cliente.telefone);
    const scriptMensagem = gerarScriptWhatsApp(cliente, cliente.tipoContato);
    const wppLink = wppNumero ? `https://wa.me/${wppNumero}?text=${encodeURIComponent(scriptMensagem)}` : null;

    const areasPills = cliente.areasTratadas.length > 0
      ? cliente.areasTratadas.map(a => `<span class="cs-area-pill">✨ ${a}</span>`).join(" ")
      : `<span class="cs-area-pill">✨ Depilação a Laser</span>`;

    html += `
      <div class="cs-card ${cardExtraClass}" data-id-unico="${cliente.idUnico}">
        <!-- Topo do Card: Nome e Badges -->
        <div class="cs-card-header">
          <div class="cs-client-info">
            <strong class="cs-client-name">👤 ${cliente.clienteNome}</strong>
            <div class="cs-client-meta">
              <span>⏰ ${cliente.horario}</span>
              <span>•</span>
              <span>📅 ${cliente.dataAtendimentoBr}</span>
              <span>•</span>
              <span>📍 ${cliente.salaNome}</span>
            </div>
          </div>
          <div class="cs-header-badges">
            <span class="cs-badge-pill ${badgeTipoClass}">
              ${badgeTipoIcon} ${badgeTipoLabel}
            </span>
            ${isContatado ? '<span class="cs-badge-pill badge-cs-feito">✅ Contatado</span>' : ''}
          </div>
        </div>

        <!-- Áreas Tratadas -->
        <div class="cs-areas-container">
          <span class="cs-areas-label">Áreas atendidas:</span>
          <div class="cs-areas-list">
            ${areasPills}
          </div>
        </div>

        <!-- Prévia do Script de Mensagem -->
        <div class="cs-script-preview-box">
          <div class="cs-script-header">
            <span>💬 Mensagem Personalizada sugerida:</span>
            <button class="btn-copy-script" data-script="${encodeURIComponent(scriptMensagem)}" title="Copiar texto da mensagem">
              📋 Copiar
            </button>
          </div>
          <p class="cs-script-text">${scriptMensagem.replace(/\n/g, "<br>")}</p>
        </div>

        <!-- Barra de Ações Rápidas -->
        <div class="cs-card-actions">
          <button class="btn-cs-action btn-copy-script" data-script="${encodeURIComponent(scriptMensagem)}" style="flex: 1; background: #f8fafc; border: 1px solid #cbd5e1; color: #334155;">
            📋 Copiar Mensagem
          </button>

          <button class="btn-cs-action btn-cs-toggle-status ${isContatado ? 'btn-cs-desmarcar' : 'btn-cs-marcar'}" data-id-unico="${cliente.idUnico}" style="flex: 1.2;">
            ${isContatado ? '↩️ Desmarcar' : '✅ Marcar como Feito'}
          </button>
        </div>
      </div>
    `;
  });

  csCardsContainer.innerHTML = html;
}

/**
 * Inicializa os ouvintes de eventos da view de Sucesso do Cliente.
 */
export function inicializarCsView() {
  console.log("[CS] 🚀 Inicializando view de Sucesso do Cliente...");

  // Filtros de Tabulação (Todos, 24h, 3d, Contatados)
  const filterBtns = document.querySelectorAll(".cs-filter-btn");
  filterBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      filterBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      csFiltroAtivo = btn.getAttribute("data-filter") || "todos";
      renderizarCsView();
    });
  });

  // Busca Rápida
  csInputBusca?.addEventListener("input", (e) => {
    csTermoBusca = e.target.value;
    renderizarCsView();
  });

  // Botão de Recarregar CS
  btnRefreshCs?.addEventListener("click", () => {
    carregarSucessoCliente(true);
  });

  // Ações dentro dos Cards (Copiar Script, Marcar como Contatado)
  csCardsContainer?.addEventListener("click", async (e) => {
    // 1. Copiar Script
    const btnCopy = e.target.closest(".btn-copy-script");
    if (btnCopy) {
      const rawText = decodeURIComponent(btnCopy.getAttribute("data-script") || "");
      if (rawText) {
        try {
          await navigator.clipboard.writeText(rawText);
          const originalHtml = btnCopy.innerHTML;
          btnCopy.innerHTML = "✅ Copiado!";
          btnCopy.style.background = "#16a34a";
          btnCopy.style.color = "#ffffff";
          setTimeout(() => {
            btnCopy.innerHTML = originalHtml;
            btnCopy.style.background = "";
            btnCopy.style.color = "";
          }, 2000);
        } catch (err) {
          console.warn("Erro ao copiar para clipboard:", err);
        }
      }
      return;
    }

    // 2. Marcar / Desmarcar como Contatado
    const btnToggle = e.target.closest(".btn-cs-toggle-status");
    if (btnToggle) {
      const idUnico = btnToggle.getAttribute("data-id-unico");
      if (idUnico) {
        await alternarContatadoCliente(idUnico);
      }
      return;
    }
  });
}
