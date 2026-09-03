/**
 * BELLE COPILOT - VIEW DA AGENDA DO DIA (TIMELINE & FILTROS)
 * Gerencia a grade de agendamentos, filtros de salas, status tabs e busca rápida.
 */

import { state } from '../core/state.js';
import { abrirModalAgendarProxima } from '../components/modal-agendar-proxima.js';
import { buscarSaldoVendaPlanoApi } from '../core/api-client.js';

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

function ehHorarioAtual(hrIni, hrFim) {
  if (!hrIni) return false;
  const agora = new Date();
  const minAgora = agora.getHours() * 60 + agora.getMinutes();
  const parseMin = (hStr) => {
    const parts = String(hStr || "").split(":");
    return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
  };
  const mIni = parseMin(hrIni);
  const mFim = hrFim ? parseMin(hrFim) : mIni + 30;
  return minAgora >= (mIni - 10) && minAgora < mFim;
}

// Cache em memória de saldos por orçamento (cod_plano_paciente)
const cacheSaldosAgenda = new Map();

/**
 * Registra saldos capturados (via rede ou API) e atualiza os cards correspondentes na tela
 */
export function registrarSaldoCapturado(codOrcamento, saldoLista) {
  if (!codOrcamento || !Array.isArray(saldoLista)) return;
  const orcKey = String(codOrcamento).trim();
  cacheSaldosAgenda.set(orcKey, saldoLista);

  const cards = document.querySelectorAll(`.appointment-card[data-cod-orcamento="${orcKey}"]`);
  cards.forEach(card => {
    const appId = card.getAttribute("data-app-id");
    const app = state.appointmentsData.find(a => String(a.id) === String(appId));
    if (app) {
      const chipsBox = card.querySelector(".services-chips-box");
      if (chipsBox) {
        chipsBox.innerHTML = gerarHtmlChipsServicos(app, saldoLista);
      }
    }
  });
}

/**
 * Extrai a fração "realizadas/contratadas" (ex: "5/10") de um item de saldo
 */
function extrairProgressoDeItemSaldo(itemSaldo) {
  if (!itemSaldo) return "";
  const realizadas = parseInt(itemSaldo.gasto ?? itemSaldo.realizadas ?? itemSaldo.qtd_executada ?? 0, 10);
  const contratadas = parseInt(itemSaldo.quantidade ?? itemSaldo.contratadas ?? itemSaldo.qtd_contratada ?? 0, 10);
  if (contratadas > 0) {
    return `${realizadas}/${contratadas}`;
  }
  return "";
}

/**
 * Localiza o saldo individual de cada procedimento dentro da lista oficial de saldovendaplano
 */
function obterProgressoDeSaldo(nomeArea, codServico, saldoLista) {
  if (!Array.isArray(saldoLista) || saldoLista.length === 0) return "";

  // 1. Tenta correspondência estrita por código do serviço (mais confiável)
  if (codServico) {
    const itemPorCod = saldoLista.find(s => {
      const c = s.cod_servico || s.codServ || s.id || s.cod_procedimento;
      return c && String(c) === String(codServico);
    });
    if (itemPorCod) {
      const prog = extrairProgressoDeItemSaldo(itemPorCod);
      if (prog) return prog;
    }
  }

  // 2. Normalização textual para correspondência por nome
  const norm = (str) => String(str || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

  const areaNorm = norm(nomeArea);
  if (!areaNorm) return "";

  // Correspondência exata ou por inclusão
  for (const s of saldoLista) {
    const sNome = s.servico || s.nome || s.nom_servico || "";
    const sNorm = norm(sNome);
    if (!sNorm) continue;

    if (areaNorm === sNorm || areaNorm.includes(sNorm) || sNorm.includes(areaNorm)) {
      const prog = extrairProgressoDeItemSaldo(s);
      if (prog) return prog;
    }
  }

  // 3. Fallback: palavras-chave significativas da área (ex: "axilas", "virilha", "buco", "perianal")
  const palavrasArea = (nomeArea || "").toLowerCase().split(/[\s\-()]+/).filter(w => w.length >= 4);
  for (const w of palavrasArea) {
    const wNorm = norm(w);
    for (const s of saldoLista) {
      const sNome = s.servico || s.nome || s.nom_servico || "";
      const sNorm = norm(sNome);
      if (sNorm.includes(wNorm)) {
        const prog = extrairProgressoDeItemSaldo(s);
        if (prog) return prog;
      }
    }
  }

  return "";
}

/**
 * Gera o HTML dos chips de procedimentos com o progresso de cada área individual
 */
function gerarHtmlChipsServicos(app, saldoLista = null) {
  const orcKey = String(app.codOrcamento || "").trim();
  const lista = (saldoLista && Array.isArray(saldoLista)) ? saldoLista : (orcKey ? cacheSaldosAgenda.get(orcKey) : null);

  if (app.arrServ && app.arrServ.length > 0) {
    return app.arrServ.map(s => {
      const progresso = obterProgressoDeSaldo(s.nome, s.cod_servico, lista);
      const badgeProgresso = progresso ? `<span class="service-chip-progresso">${progresso}</span>` : "";
      const nomeLimpo = (s.nome || "").replace(/\s*-\s*\d+\/\d+/, "").trim();
      return `<span class="service-chip-pill">${badgeProgresso}✨ ${nomeLimpo}</span>`;
    }).join("");
  } else {
    const progresso = obterProgressoDeSaldo(app.procedimento, null, lista);
    const badgeProgresso = progresso ? `<span class="service-chip-progresso">${progresso}</span>` : "";
    const procLimpo = (app.procedimento || "").replace(/\s*-\s*\d+\/\d+/, "").trim();
    return `<span class="service-chip-pill">${badgeProgresso}✨ ${procLimpo}</span>`;
  }
}

/**
 * Consulta em segundo plano o saldo exato de cada orçamento presente na agenda do dia
 */
async function carregarSaldosAgenda(appointments) {
  if (!state.currentToken || !Array.isArray(appointments) || appointments.length === 0) return;

  const orcamentosParaBuscar = [];
  const orcsVistos = new Set();

  appointments.forEach(app => {
    const orc = String(app.codOrcamento || "").trim();
    if (orc && !cacheSaldosAgenda.has(orc) && !orcsVistos.has(orc) && !app.isBloqueado && !app.isAvaliacao) {
      orcsVistos.add(orc);
      orcamentosParaBuscar.push(app);
    }
  });

  if (orcamentosParaBuscar.length === 0) return;

  // Lotes concorrentes pequenos de 4 requisições
  const batchSize = 4;
  for (let i = 0; i < orcamentosParaBuscar.length; i += batchSize) {
    const batch = orcamentosParaBuscar.slice(i, i + batchSize);
    await Promise.allSettled(batch.map(async (app) => {
      try {
        const resSaldo = await buscarSaldoVendaPlanoApi(
          state.currentToken,
          app.codOrcamento,
          app.codPlano,
          app.idGeinfo,
          state.currentCodEstab
        );
        if (Array.isArray(resSaldo) && resSaldo.length > 0) {
          const orcKey = String(app.codOrcamento).trim();
          cacheSaldosAgenda.set(orcKey, resSaldo);
          registrarSaldoCapturado(orcKey, resSaldo);
        }
      } catch (e) {
        // Silencioso em caso de falha de rede individual
      }
    }));
  }
}

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

  // Destaque visual pulsante no botão de Aguardando quando houver clientes na recepção
  const btnAguardando = document.querySelector('.status-tab-btn[data-status="aguardando"]');
  if (btnAguardando) {
    btnAguardando.classList.toggle("tem-aguardando", aguardando > 0);
  }

  // Banner Alerta no topo da lista da Agenda
  const bannerAguardando = document.getElementById("agenda-alerta-aguardando");
  const textoAguardando = document.getElementById("agenda-alerta-texto");
  if (bannerAguardando) {
    if (aguardando > 0) {
      bannerAguardando.style.display = "flex";
      if (textoAguardando) {
        textoAguardando.innerHTML = `<strong>${aguardando} cliente${aguardando > 1 ? "s" : ""}</strong> aguardando chamada na recepção`;
      }
    } else {
      bannerAguardando.style.display = "none";
    }
  }
}

export function extrairNomeProfissional(item) {
  if (!item || typeof item !== "object") return "";

  let nome = item.nom_usuario 
    || item.nomUsuario 
    || item.nome_usuario
    || item.nomProf 
    || item.nom_prof 
    || item.nom_profissional 
    || item.nomProfissional 
    || item.nome_profissional
    || item.profissional 
    || item.usuario
    || item.nom_colaborador
    || item.colaborador
    || item.atendente
    || item.nom_atendente || "";

  if (!nome && item.obProf) {
    nome = item.obProf?.value?.nom_usuario 
      || item.obProf?.value?.nome 
      || item.obProf?.label || "";
    if (typeof nome === "string" && nome.includes("-")) {
      const partes = nome.split("-");
      if (partes.length > 1 && /^\d+$/.test(partes[0].trim())) {
        nome = partes.slice(1).join("-").trim();
      }
    }
  }

  nome = String(nome || "").trim();

  // Se o nome vier com o placeholder literal "Profissional", ignora
  if (nome.toLowerCase() === "profissional") {
    nome = "";
  }

  return nome;
}

export function ehAgendamentoAvaliacao(item) {
  if (!item || typeof item !== "object") return false;

  // 1. Campo explícito de tipo de consulta do Belle
  const tipoConsulta = String(item.tipoConsulta || item.cod_tipo_consulta || item.tipo_consulta || item.tpConsulta || "").toLowerCase();
  if (tipoConsulta.includes("avali") || tipoConsulta.includes("aval")) {
    return true;
  }

  // 2. Procedimento / Serviço principal
  const proc = String(item.procedimento || item.nome_servico || item.servico || "").toLowerCase();
  if (proc.includes("avalia") || proc.includes("aval.")) {
    return true;
  }

  // 3. Sala / Recurso (ex: "AVALIAÇÃO NOVOS CLIENTES", "SALA AVALIAÇÃO")
  const sala = String(item.salaNome || item.sala || item.nomSala || "").toLowerCase();
  if (sala.includes("avalia") || sala.includes("aval.")) {
    return true;
  }

  // 4. Lista de serviços incluídos (arrServ)
  if (Array.isArray(item.arrServ) && item.arrServ.length > 0) {
    const temAval = item.arrServ.some(s => {
      const nome = String(s.nome || s.nom_servico || "").toLowerCase();
      return nome.includes("avalia") || nome.includes("aval.");
    });
    if (temAval) return true;
  }

  // 5. Código do tipo de sala na grade (1 = Avaliação no Belle)
  if (String(item.codSalaTipo || item.cod_tipo || "") === "1") {
    return true;
  }

  return false;
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
    const nomeProf = extrairNomeProfissional(item);
    const isAval = ehAgendamentoAvaliacao(item);
    const tipoConsultaFormatado = isAval ? "Avaliação" : (item.cod_tipo_consulta || item.tipoConsulta || "Serviço");

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
      procedimento: item.procedimento || item.nome_servico || item.servico || (isBloq ? "BLOQUEIO DE AGENDA" : (isAval ? "Avaliação" : "Depilação a Laser")),
      salaNome: item.sala || item.nomSala || item.salaNome || (isAval ? "AVALIAÇÃO" : "SALA DEPILAÇÃO A LASER"),
      codSala: String(item.codSala || item.cod_sala || item.resourceId || item.codTipo || ""),
      profissional: nomeProf || "Não informada",
      codProfissional: String(item.cod_profissional || item.codProfissional || item.cod_usuario || item.codUsuario || item.codProf || item.codProfiss || "").trim(),
      tipoConsulta: tipoConsultaFormatado,
      isAvaliacao: isAval,
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
      idGeinfo: item.id_geinfo || item.idGeinfo || state.currentIdGeinfo || (state.currentSalas?.[0]?.id_geinfo) || ""
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
    // Fragmento: uma inserção só no <select>, em vez de uma por sala.
    const fragmento = document.createDocumentFragment();
    salas.forEach(sala => {
      const opt = document.createElement("option");
      opt.value = sala.nome || sala.title;
      opt.textContent = `📍 ${sala.nome || sala.title}`;
      fragmento.appendChild(opt);
    });
    selectProfissional.appendChild(fragmento);
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

  // Os cards são montados num fragmento e entram na tela de uma vez. Antes cada card era
  // inserido direto no container: numa agenda cheia eram dezenas de inserções na árvore
  // viva, e a agenda é re-renderizada a cada requisição interceptada do Belle.
  const fragmento = document.createDocumentFragment();

  filtrados.forEach(app => {
    const card = document.createElement("div");
    const isAtual = ehHorarioAtual(app.horario, app.hrFim);
    card.className = `appointment-card status-${app.status}${isAtual ? " card-horario-atual" : ""}`;
    card.setAttribute("data-app-id", app.id);
    card.setAttribute("data-cod-orcamento", String(app.codOrcamento || "").trim());
    
    if (app.isBloqueado) {
      card.innerHTML = `
        <div class="app-card-header">
          <div class="app-card-time-wrap">
            <span class="app-time" style="color: #991b1b;">⏰ ${app.horario} - ${app.hrFim}</span>
            <span class="app-duracao-txt">${app.duracaoMin}m</span>
          </div>
          <span class="app-badge badge-bloqueado">🔒 Bloqueado</span>
        </div>
        <div class="app-client-name" style="color: #b91c1c; font-size: 12px;">🔒 ${app.procedimento}</div>
        <div class="app-footer" style="border-top-color: #fecaca; margin-top: 4px;">
          <span class="app-footer-sala" style="color: #64748b;">📍 ${app.salaNome}</span>
        </div>
      `;
      fragmento.appendChild(card);
      return;
    }

    let statusLabel = app.statusFormatado || "Marcado";
    let badgeClass = "badge-agendado";
    if (app.status === "aguardando") { statusLabel = "Aguardando"; badgeClass = "badge-aguardando"; }
    else if (app.status === "confirmado") { statusLabel = "Confirmado"; badgeClass = "badge-confirmado"; }
    else if (app.status === "atendimento") { statusLabel = "Em Andamento"; badgeClass = "badge-atendimento"; }
    else if (app.status === "finalizado") { statusLabel = "Atendido"; badgeClass = "badge-finalizado"; }
    else if (app.status === "falta") { statusLabel = "Falhou"; badgeClass = "badge-falta"; }

    // Metadados do cliente (Apenas Código ID, sem telefone)
    const metaClienteHtml = app.codCliente ? `<div class="app-card-meta">Cód. ${app.codCliente}</div>` : "";

    // Tipo de Consulta: Avaliação ou Serviço
    const badgeTipoConsulta = app.isAvaliacao
      ? `<span class="badge-tipo-consulta badge-tipo-avaliacao" title="Agendamento de Avaliação (sem parâmetros de laser)">📋 Avaliação</span>`
      : `<span class="badge-tipo-consulta badge-tipo-servico" title="Sessão de Laser / Procedimento">✨ Serviço</span>`;

    // Chips de Serviços / Procedimentos com Quantidade de Sessões individuais de cada área
    let servicosHtml = "";
    if (app.isAvaliacao) {
      const procNome = (app.procedimento || "Avaliação").trim();
      servicosHtml = `<div class="services-chips-box"><span class="service-chip-pill service-chip-avaliacao">📋 ${procNome}</span></div>`;
    } else {
      const orcKey = String(app.codOrcamento || "").trim();
      const saldoLista = orcKey ? cacheSaldosAgenda.get(orcKey) : null;
      servicosHtml = `<div class="services-chips-box">${gerarHtmlChipsServicos(app, saldoLista)}</div>`;
    }

    // Tags de Alerta (Questionário Pendente, Aniversariante, Tags)
    let tagsHtml = "";
    if (app.questPendente) tagsHtml += `<span class="tag-alert-quest" title="Questionário de anamnese pendente">⚠️ Questionário</span>`;
    if (app.fazAniver) tagsHtml += `<span class="tag-alert-aniver" title="Cliente faz aniversário hoje!">🎂 Aniversariante</span>`;
    if (app.tagsCliente) {
      const clientTags = app.tagsCliente.split(",").map(t => t.trim()).filter(Boolean);
      clientTags.forEach(tag => {
        tagsHtml += `<span class="tag-alert-client">🏷️ ${tag}</span>`;
      });
    }

    // Botões de Ação Contextual
    const exibirBtnAgendar = (state.currentUserRole === "recepcao" || state.currentUserRole === "gerente" || state.currentUserRole === "consultora");
    let botoesAcaoHtml = "";
    if (app.status === "aguardando") {
      botoesAcaoHtml = `
        <button class="btn-card-iniciar-atendimento ${app.isAvaliacao ? 'btn-card-iniciar-avaliacao' : ''}" data-app-id="${app.id}">
          ${app.isAvaliacao ? "📋 Iniciar Avaliação" : "🩺 Iniciar Atendimento"}
        </button>
      `;
    } else if (exibirBtnAgendar) {
      botoesAcaoHtml = `
        <button class="btn-agendar-proxima-card" data-app-id="${app.id}">
          📅 Agendar Próxima Sessão
        </button>
      `;
    }

    card.innerHTML = `
      <div class="app-card-header">
        <div class="app-card-time-wrap">
          <span class="app-time">⏰ ${app.horario} - ${app.hrFim}</span>
          <span class="app-duracao-txt">${app.duracaoMin}m</span>
          ${isAtual ? '<span class="tag-horario-atual">⚡ Agora</span>' : ''}
        </div>
        <div class="app-card-badges-wrap">
          ${badgeTipoConsulta}
          <span class="app-badge ${badgeClass}">${statusLabel}</span>
        </div>
      </div>

      <div class="app-card-client-block">
        <div class="app-client-name">👤 ${app.clienteNome}</div>
        ${metaClienteHtml}
      </div>

      ${servicosHtml}
      ${tagsHtml ? `<div class="tags-container-card">${tagsHtml}</div>` : ''}

      <div class="app-footer">
        <span class="app-footer-sala" title="Sala / Recurso">📍 ${app.salaNome}</span>
        <span class="app-footer-prof" title="Profissional Responsável">👩‍⚕️ ${app.profissional}</span>
      </div>

      ${botoesAcaoHtml}
    `;

    const btnIniciar = card.querySelector(".btn-card-iniciar-atendimento");
    if (btnIniciar) {
      btnIniciar.addEventListener("click", (e) => {
        e.stopPropagation();
        if (typeof callbackAbrirAtendimento === "function") {
          callbackAbrirAtendimento(app);
        }
      });
    }

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

    fragmento.appendChild(card);
  });

  agendaTimelineContainer.appendChild(fragmento);

  atualizarKpis();

  // Busca e atualiza os saldos de cada procedimento em segundo plano
  carregarSaldosAgenda(filtrados);
}

export function inicializarAgendaView(onAbrirAtendimento) {
  callbackAbrirAtendimento = onAbrirAtendimento;

  selectProfissional?.addEventListener("change", (e) => {
    state.filtroSalaAtivo = e.target.value;
    renderizarAgenda();
  });

  const btnVerAguardando = document.getElementById("btn-agenda-ver-aguardando");
  if (btnVerAguardando) {
    btnVerAguardando.addEventListener("click", () => {
      state.filtroStatusAtivo = "aguardando";
      const statusTabButtons = document.querySelectorAll(".status-tab-btn");
      statusTabButtons.forEach(b => {
        if (b.getAttribute("data-status") === "aguardando") b.classList.add("active");
        else b.classList.remove("active");
      });
      renderizarAgenda();
    });
  }

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
