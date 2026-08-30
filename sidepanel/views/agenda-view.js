/**
 * BELLE COPILOT - VIEW DA AGENDA DO DIA (TIMELINE & FILTROS)
 * Gerencia a grade de agendamentos, filtros de salas, status tabs e busca rápida.
 */

import { state } from '../core/state.js';
import { abrirModalAgendarProxima } from '../components/modal-agendar-proxima.js';

const selectProfissional = document.getElementById("select-profissional");
const agendaTimelineContainer = document.getElementById("agenda-timeline-container");
const agendaEmptyState = document.getElementById("agenda-empty-state");
const loadingAgenda = document.getElementById("loading-agenda");

const kpiTotal = document.getElementById("kpi-total");
const kpiAguardando = document.getElementById("kpi-aguardando");
const kpiConfirmados = document.getElementById("kpi-confirmados");
const kpiAtendimento = document.getElementById("kpi-atendimento");
const kpiFinalizados = document.getElementById("kpi-finalizados");
const kpiFaltas = document.getElementById("kpi-faltas");

let callbackAbrirAtendimento = null;

export function atualizarKpis() {
  const total = state.appointmentsData.length;
  const atendimentosValidos = state.appointmentsData.filter(a => !a.isBloqueado && a.status !== "bloqueado");
  const totalAtendimentos = atendimentosValidos.length;
  const aguardando = state.appointmentsData.filter(a => a.status === "aguardando").length;
  const agendados = state.appointmentsData.filter(a => a.status === "agendado").length;
  const confirmados = state.appointmentsData.filter(a => a.status === "confirmado").length;
  const atendimento = state.appointmentsData.filter(a => a.status === "atendimento").length;
  const finalizados = state.appointmentsData.filter(a => a.status === "finalizado").length;
  const faltas = state.appointmentsData.filter(a => a.status === "falta").length;
  const bloqueados = state.appointmentsData.filter(a => a.isBloqueado || a.status === "bloqueado").length;

  if (kpiTotal) kpiTotal.textContent = totalAtendimentos;
  if (kpiAguardando) kpiAguardando.textContent = aguardando;
  if (kpiConfirmados) kpiConfirmados.textContent = confirmados;
  if (kpiAtendimento) kpiAtendimento.textContent = atendimento;
  if (kpiFinalizados) kpiFinalizados.textContent = finalizados;
  if (kpiFaltas) kpiFaltas.textContent = faltas;

  const cTodos = document.getElementById("count-status-todos");
  const cAguardando = document.getElementById("count-status-aguardando");
  const cAgendado = document.getElementById("count-status-agendado");
  const cConfirmado = document.getElementById("count-status-confirmado");
  const cAtendimento = document.getElementById("count-status-atendimento");
  const cFinalizado = document.getElementById("count-status-finalizado");
  const cFalta = document.getElementById("count-status-falta");
  const cBloqueado = document.getElementById("count-status-bloqueado");

  if (cTodos) cTodos.textContent = total;
  if (cAguardando) cAguardando.textContent = aguardando;
  if (cAgendado) cAgendado.textContent = agendados;
  if (cConfirmado) cConfirmado.textContent = confirmados;
  if (cAtendimento) cAtendimento.textContent = atendimento;
  if (cFinalizado) cFinalizado.textContent = finalizados;
  if (cFalta) cFalta.textContent = faltas;
  if (cBloqueado) cBloqueado.textContent = bloqueados;
}

export function processarItensAgenda(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems.map(item => {
    const rawStatus = (item.statusAgendamento || item.status || "Marcado").trim();
    const statusLower = rawStatus.toLowerCase();
    
    let statusNormalizado = "agendado";
    if (statusLower.includes("aguard") || statusLower.includes("espera") || statusLower.includes("recep")) {
      statusNormalizado = "aguardando";
    } else if (statusLower === "atendido" || statusLower.includes("finaliz") || statusLower.includes("conclu")) {
      statusNormalizado = "finalizado";
    } else if (statusLower.includes("andamento") || statusLower === "atendimento" || statusLower.includes("em atend")) {
      statusNormalizado = "atendimento";
    } else if (statusLower.includes("confirm")) {
      statusNormalizado = "confirmado";
    } else if (statusLower.includes("falh") || statusLower.includes("falt") || statusLower.includes("cancel") || statusLower.includes("desmarc")) {
      statusNormalizado = "falta";
    } else if (statusLower.includes("bloq")) {
      statusNormalizado = "bloqueado";
    } else {
      statusNormalizado = "agendado";
    }

    const isBloq = statusNormalizado === "bloqueado" || item.bloqueado === true || item.bloqueado === "1";

    return {
      id: item.id || item.codigo || item.codConsulta || Math.random().toString(36).substring(2, 9),
      codConsulta: item.codConsulta || item.codigo || item.id,
      codCliente: item.codPaciente || item.cod_paciente || item.codCliente || "",
      clienteNome: item.nomPaciente || item.nom_paciente || item.nome_paciente || item.clienteNome || (isBloq ? "Horário Bloqueado" : "Cliente"),
      telefone: item.celular || item.telefone || "",
      cpf: item.cpf || "",
      horario: item.hrIni || item.horario || item.hr_inicio || "08:00",
      hrFim: item.hrFim || item.hr_fim || "08:30",
      duracaoMin: Number(item.duracaoMin || 30),
      procedimento: item.procedimento || item.nome_servico || item.servico || (isBloq ? "BLOQUEIO DE AGENDA" : "Depilação a Laser"),
      salaNome: item.sala || item.nomSala || item.salaNome || "SALA DEPILAÇÃO A LASER",
      codSala: String(item.codSala || item.cod_sala || item.resourceId || item.codTipo || ""),
      profissional: item.nomProf || item.profissional || item.nom_profissional || "Profissional",
      codProfissional: item.codProf || item.cod_profissional || "",
      status: statusNormalizado,
      statusFormatado: rawStatus,
      isBloqueado: isBloq,
      questPendente: item.questPendente || item.quest_pendente || false,
      fazAniver: item.fazAniver || false,
      tagsCliente: item.tagsCliente || "",
      arrServ: item.arrServ || [],
      lbServ: item.lbServ || item.lb_serv || item.servicos || "",
      observacao: item.observacao || item.obs || "",
      nomePlano: item.nomePlano || item.nome_plano || "",
      codOrcamento: item.cod_plano_paciente || item.codOrc || item.cod_orcamento || "",
      codPlano: item.cod_plano || item.codPlano || "",
      idGeinfo: item.id_geinfo || item.idGeinfo || (state.currentSalas?.[0]?.id_geinfo) || "114411"
    };
  });
}

export function sincronizarSalasComAgendamentos(appointments) {
  if (!Array.isArray(appointments) || appointments.length === 0) return;
  
  const salasExistentes = Array.isArray(state.currentSalas) && state.currentSalas.length > 0 ? [...state.currentSalas] : [];
  const salasMap = new Map();

  salasExistentes.forEach(s => {
    const nomeNorm = (s.nome || s.title || "").trim().toLowerCase();
    if (nomeNorm) salasMap.set(nomeNorm, s);
  });

  appointments.forEach(app => {
    if (app.salaNome && app.salaNome.trim()) {
      const nomeLimpo = app.salaNome.trim();
      const nomeNorm = nomeLimpo.toLowerCase();
      if (!salasMap.has(nomeNorm)) {
        salasMap.set(nomeNorm, {
          cod_sala: app.codSala || "",
          id: app.codSala || "",
          codigo: app.codSala || "",
          nome: nomeLimpo,
          title: nomeLimpo
        });
      } else {
        const sExistente = salasMap.get(nomeNorm);
        if (!sExistente.cod_sala && app.codSala) {
          sExistente.cod_sala = app.codSala;
          sExistente.id = app.codSala;
        }
      }
    }
  });

  if (salasMap.size > 0) {
    state.currentSalas = Array.from(salasMap.values());
    renderizarSalasFiltro(state.currentSalas);
  }
}

export function renderizarSalasFiltro(salas) {
  if (!selectProfissional) return;
  const valorAtual = selectProfissional.value;
  selectProfissional.innerHTML = '<option value="todos">Todas as Salas</option>';

  if (Array.isArray(salas) && salas.length > 0) {
    salas.forEach(sala => {
      const opt = document.createElement("option");
      opt.value = sala.nome || sala.title;
      opt.textContent = `📍 ${sala.nome || sala.title}`;
      selectProfissional.appendChild(opt);
    });
  }

  if (valorAtual) selectProfissional.value = valorAtual;
}

export function renderizarAgenda(onAbrirAtendimento) {
  if (onAbrirAtendimento) callbackAbrirAtendimento = onAbrirAtendimento;
  if (!agendaTimelineContainer) return;

  agendaTimelineContainer.innerHTML = "";
  const lista = state.appointmentsData;

  const salaFiltro = state.filtroSalaAtivo;
  const statusFiltro = state.filtroStatusAtivo;
  const buscaTermo = state.termoBuscaAtivo.toLowerCase();

  const filtrados = lista.filter(app => {
    if (salaFiltro !== "todos" && app.salaNome !== salaFiltro) return false;
    if (statusFiltro !== "todos" && app.status !== statusFiltro) return false;
    if (buscaTermo) {
      const cNome = (app.clienteNome || "").toLowerCase();
      const cTel = (app.telefone || "").replace(/\D/g, "");
      const cCpf = (app.cpf || "").replace(/\D/g, "");
      const cProc = (app.procedimento || "").toLowerCase();
      const cCod = String(app.codCliente || "");
      if (!cNome.includes(buscaTermo) && !cTel.includes(buscaTermo) && !cCpf.includes(buscaTermo) && !cProc.includes(buscaTermo) && !cCod.includes(buscaTermo)) {
        return false;
      }
    }
    return true;
  });

  if (filtrados.length === 0) {
    if (agendaEmptyState) agendaEmptyState.style.display = "block";
    atualizarKpis();
    return;
  }

  if (agendaEmptyState) agendaEmptyState.style.display = "none";
  filtrados.sort((a, b) => a.horario.localeCompare(b.horario));

  filtrados.forEach(app => {
    const card = document.createElement("div");
    card.className = `appointment-card status-${app.status}`;
    
    if (app.isBloqueado) {
      card.innerHTML = `
        <div class="app-card-header">
          <span class="app-time">⏰ ${app.horario} - ${app.hrFim} <small style="font-weight: normal; color: #64748b;">(${app.duracaoMin}m)</small></span>
          <span class="app-badge badge-bloqueado">Bloqueado</span>
        </div>
        <div class="app-client-name" style="color: #b91c1c;">🔒 ${app.procedimento}</div>
        <div style="font-size: 11px; color: #64748b; margin-top: 2px;">📍 ${app.salaNome}</div>
      `;
      agendaTimelineContainer.appendChild(card);
      return;
    }

    let statusLabel = "Marcado";
    let badgeClass = "badge-agendado";
    if (app.status === "aguardando") { statusLabel = "Aguardando"; badgeClass = "badge-aguardando"; }
    else if (app.status === "confirmado") { statusLabel = "Confirmado"; badgeClass = "badge-confirmado"; }
    else if (app.status === "atendimento") { statusLabel = "Em Andamento"; badgeClass = "badge-atendimento"; }
    else if (app.status === "finalizado") { statusLabel = "Atendido"; badgeClass = "badge-finalizado"; }
    else if (app.status === "falta") { statusLabel = "Falhou"; badgeClass = "badge-falta"; }

    let tagsHtml = "";
    if (app.questPendente) tagsHtml += `<span class="tag-alert-quest">⚠️ Questionário Pendente</span>`;
    if (app.fazAniver) tagsHtml += `<span class="tag-alert-aniver">🎂 Aniversariante</span>`;
    if (app.tagsCliente) {
      const clientTags = app.tagsCliente.split(",").map(t => t.trim()).filter(Boolean);
      clientTags.forEach(tag => {
        tagsHtml += `<span class="tag-alert-client">🏷️ ${tag}</span>`;
      });
    }

    let servicosHtml = "";
    if (app.arrServ && app.arrServ.length > 0) {
      servicosHtml = `<div class="services-chips-box">` + 
        app.arrServ.map(s => `<div class="service-chip-line">✨ ${s.nome}</div>`).join("") + 
      `</div>`;
    } else {
      servicosHtml = `<div class="app-procedure">✨ ${app.procedimento}</div>`;
    }

    const exibirBtnAgendar = (state.currentUserRole === "recepcao" || state.currentUserRole === "gerente" || state.currentUserRole === "consultora");
    const btnAgendarHtml = exibirBtnAgendar ? `
      <button class="btn-agendar-proxima-card" data-app-id="${app.id}">
        📅 Agendar Próxima Sessão
      </button>
    ` : '';

    card.innerHTML = `
      <div class="app-card-header">
        <span class="app-time">⏰ ${app.horario} - ${app.hrFim} <small style="font-weight: normal; color: #64748b;">(${app.duracaoMin}m)</small></span>
        <span class="app-badge ${badgeClass}">${statusLabel}</span>
      </div>
      <div class="app-client-name">👤 ${app.codCliente ? app.codCliente + ' - ' : ''}${app.clienteNome}</div>
      ${app.telefone ? `<div style="font-size: 11px; color: #64748b; margin-bottom: 3px;">📱 ${app.telefone}</div>` : ''}
      ${servicosHtml}
      ${tagsHtml ? `<div class="tags-container-card">${tagsHtml}</div>` : ''}
      <div class="app-footer">
        <div>
          <span>👩‍⚕️ ${app.profissional}</span>
          <span class="dot">•</span>
          <span style="color: #0284c7; font-weight: 600;">📍 ${app.salaNome}</span>
        </div>
      </div>
      ${btnAgendarHtml}
    `;

    const btnAgendar = card.querySelector(".btn-agendar-proxima-card");
    if (btnAgendar) {
      btnAgendar.addEventListener("click", (e) => {
        e.stopPropagation();
        abrirModalAgendarProxima(app);
      });
    }

    card.addEventListener("click", () => {
      if (typeof callbackAbrirAtendimento === "function") {
        callbackAbrirAtendimento(app);
      }
    });

    agendaTimelineContainer.appendChild(card);
  });

  atualizarKpis();
}

export function inicializarAgendaView(onAbrirAtendimento) {
  callbackAbrirAtendimento = onAbrirAtendimento;

  selectProfissional?.addEventListener("change", (e) => {
    state.filtroSalaAtivo = e.target.value;
    renderizarAgenda();
  });

  const statusTabButtons = document.querySelectorAll(".status-tab-btn");
  statusTabButtons.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      statusTabButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.filtroStatusAtivo = btn.getAttribute("data-status") || "todos";
      renderizarAgenda();
    });
  });

  const kpiCards = document.querySelectorAll(".kpi-card");
  kpiCards.forEach(k => {
    k.addEventListener("click", () => {
      const filter = k.getAttribute("data-filter");
      if (filter) {
        state.filtroStatusAtivo = filter;
        statusTabButtons.forEach(b => {
          if (b.getAttribute("data-status") === filter) b.classList.add("active");
          else b.classList.remove("active");
        });
        renderizarAgenda();
      }
    });
  });
}
