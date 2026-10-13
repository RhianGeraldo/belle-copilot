/**
 * BELLE COPILOT - VIEW DA AGENDA DO DIA (TIMELINE & FILTROS)
 * Gerencia a grade de agendamentos, filtros de salas, status tabs e busca rápida.
 */

import { state, clientesPacotesCache, clientesSaldosCache } from '../core/state.js';
import { abrirModalAgendarProxima } from '../components/modal-agendar-proxima.js';
import { buscarSaldoVendaPlanoApi, buscarVendasPlanosClienteApi } from '../core/api-client.js';

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
      return `<span class="service-chip-pill">${badgeProgresso}${nomeLimpo}</span>`;
    }).join("");
  } else {
    const progresso = obterProgressoDeSaldo(app.procedimento, null, lista);
    const badgeProgresso = progresso ? `<span class="service-chip-progresso">${progresso}</span>` : "";
    const procLimpo = (app.procedimento || "").replace(/\s*-\s*\d+\/\d+/, "").trim();
    return `<span class="service-chip-pill">${badgeProgresso}${procLimpo}</span>`;
  }
}

/**
 * Consulta em segundo plano TODOS os planos e saldos dos clientes com status ATIVOS
 * ('confirmado', 'aguardando', 'atendimento').
 * Agrupa por cliente único para evitar requisições redundantes de clientes com múltiplos agendamentos no dia.
 */
async function carregarSaldosAgenda(appointments) {
  if (!state.currentToken || !Array.isArray(appointments) || appointments.length === 0) return;

  // 1. Filtra estritamente agendamentos ATIVOS (confirmados, na recepção ou em atendimento)
  const STATUS_ATIVOS = new Set(["confirmado", "aguardando", "atendimento"]);
  const agendamentosAtivos = appointments.filter(app => 
    !app.isBloqueado && 
    !app.isAvaliacao && 
    app.codCliente && 
    STATUS_ATIVOS.has(String(app.status || "").toLowerCase())
  );

  if (agendamentosAtivos.length === 0) return;

  // 2. Agrupa por cliente único (1 cliente = 1 busca de vendasplanos)
  const mapaClientes = new Map();
  agendamentosAtivos.forEach(app => {
    const codCli = String(app.codCliente).trim();
    if (!mapaClientes.has(codCli)) {
      mapaClientes.set(codCli, {
        codCliente: codCli,
        clienteNome: app.clienteNome,
        agendamentos: []
      });
    }
    mapaClientes.get(codCli).agendamentos.push(app);
  });

  const listaClientes = Array.from(mapaClientes.values());
  console.log(`[Agenda] ⚡ Pré-carregando histórico e saldos para ${listaClientes.length} clientes ativos (confirmados/aguardando)...`);

  // 3. Processa clientes em lotes controlados de 3 para não sobrecarregar
  const batchSize = 3;
  for (let i = 0; i < listaClientes.length; i += batchSize) {
    const batch = listaClientes.slice(i, i + batchSize);
    await Promise.allSettled(batch.map(async ({ codCliente, agendamentos }) => {
      try {
        // Se já está no cache global de pacotes do cliente, pula
        let pacotesCliente = clientesPacotesCache.get(codCliente);
        if (!pacotesCliente) {
          pacotesCliente = await buscarVendasPlanosClienteApi(state.currentToken, codCliente, state.currentCodEstab);
          if (Array.isArray(pacotesCliente)) {
            clientesPacotesCache.set(codCliente, pacotesCliente);
          }
        }

        const pacotes = Array.isArray(pacotesCliente) ? pacotesCliente : [];

        // 4. Identifica todos os orçamentos que precisam de saldo detalhado
        // Prioridade: os orçamentos agendados hoje + outros pacotes ativos do cliente
        const orcsParaConsultar = new Map();

        // Orçamentos dos agendamentos de hoje
        agendamentos.forEach(app => {
          const orc = String(app.codOrcamento || "").trim();
          if (orc && !cacheSaldosAgenda.has(orc)) {
            orcsParaConsultar.set(orc, {
              codOrcamento: orc,
              codPlano: app.codPlano || 0,
              idGeinfo: app.idGeinfo || state.currentIdGeinfo
            });
          }
        });

        // Outros pacotes do cliente trazidos pelo vendasplanos
        pacotes.forEach(p => {
          const orc = String(p.cod_orcamento || "").trim();
          if (orc && !cacheSaldosAgenda.has(orc) && !orcsParaConsultar.has(orc)) {
            orcsParaConsultar.set(orc, {
              codOrcamento: orc,
              codPlano: p.cod_plano || 0,
              idGeinfo: p.id_geinfo || state.currentIdGeinfo
            });
          }
        });

        // 5. Busca saldos de cada orçamento
        const saldosConsolidados = clientesSaldosCache.get(codCliente) || [];

        for (const [orcKey, dadosOrc] of orcsParaConsultar.entries()) {
          try {
            const resSaldo = await buscarSaldoVendaPlanoApi(
              state.currentToken,
              dadosOrc.codOrcamento,
              dadosOrc.codPlano,
              dadosOrc.idGeinfo,
              state.currentCodEstab
            );
            if (Array.isArray(resSaldo) && resSaldo.length > 0) {
              cacheSaldosAgenda.set(orcKey, resSaldo);
              registrarSaldoCapturado(orcKey, resSaldo);
              saldosConsolidados.push(...resSaldo);
            }
          } catch (e) {}
        }

        if (saldosConsolidados.length > 0) {
          clientesSaldosCache.set(codCliente, saldosConsolidados);
          // Atualiza visualmente os chips dos cards desse cliente na agenda imediatamente
          agendamentos.forEach(app => {
            const orc = String(app.codOrcamento || "").trim();
            const saldoItem = orc ? cacheSaldosAgenda.get(orc) : saldosConsolidados;
            if (saldoItem) {
              const card = document.querySelector(`.appointment-card[data-app-id="${app.id}"]`);
              if (card) {
                const chipsBox = card.querySelector(".services-chips-box");
                if (chipsBox) {
                  chipsBox.innerHTML = gerarHtmlChipsServicos(app, saldoItem);
                }
              }
            }
          });
        }
      } catch (err) {
        console.warn(`[Agenda] Falha ao pré-carregar cliente #${codCliente}:`, err);
      }
    }));
  }
  console.log(`[Agenda] ✅ Pré-carregamento de saldos concluído.`);
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

  const optAtendimento = document.getElementById("opt-status-atendimento");
  const optAgendado = document.getElementById("opt-status-agendado");
  const optFalta = document.getElementById("opt-status-falta");
  const optBloqueado = document.getElementById("opt-status-bloqueado");

  if (optAtendimento) optAtendimento.textContent = `Em Andamento (${atendimento})`;
  if (optAgendado) optAgendado.textContent = `Marcados (${agendados})`;
  if (optFalta) optFalta.textContent = `Falhou (${faltas})`;
  if (optBloqueado) optBloqueado.textContent = `Bloqueados (${bloqueados})`;

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
      telefone: item.celular || item.telefone || item.obCli?.celular || item.obCli?.telefone || item.tel_celular || item.tel || "",
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
            <span class="app-duracao-txt">(${app.duracaoMin}m)</span>
          </div>
          <span class="app-badge badge-bloqueado">Bloqueado</span>
        </div>
        <div class="app-client-name" style="color: #b91c1c; font-size: 12px;">🔒 ${app.procedimento}</div>
        <div class="app-footer">
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

    // 1. Formato Solicitado: "COD - Cliente"
    const codPrefix = app.codCliente ? `${app.codCliente} - ` : "";
    const clienteTitulo = `${codPrefix}${app.clienteNome}`;

    // 2. Tipo de Consulta: Apenas Avaliação se for o caso (sem poluição de badge Serviço)
    const badgeTipoConsulta = app.isAvaliacao
      ? `<span class="badge-tipo-consulta badge-tipo-avaliacao" title="Agendamento de Avaliação">Avaliação</span>`
      : "";

    // 3. Chips de Serviços / Procedimentos com Quantidade de Sessões (sem emoji)
    let servicosHtml = "";
    if (app.isAvaliacao) {
      const procNome = (app.procedimento || "Avaliação").trim();
      servicosHtml = `<span class="service-chip-pill service-chip-avaliacao">${procNome}</span>`;
    } else {
      const orcKey = String(app.codOrcamento || "").trim();
      const saldoLista = orcKey ? cacheSaldosAgenda.get(orcKey) : null;
      servicosHtml = gerarHtmlChipsServicos(app, saldoLista);
    }

    // 4. Tags de Alerta Operacional
    let tagsHtml = "";
    if (app.questPendente) tagsHtml += `<span class="tag-alert-quest" title="Questionário de anamnese pendente">Questionário</span>`;
    if (app.fazAniver) tagsHtml += `<span class="tag-alert-aniver" title="Cliente faz aniversário hoje!">Aniversariante</span>`;

    // 5. Botão Contextual Apenas para Aguardando (cliente na recepção)
    let botoesAcaoHtml = "";
    if (app.status === "aguardando") {
      botoesAcaoHtml = `
        <div class="app-card-action-wrap">
          <button class="btn-card-iniciar-atendimento ${app.isAvaliacao ? 'btn-card-iniciar-avaliacao' : ''}" data-app-id="${app.id}">
            ${app.isAvaliacao ? "Iniciar Avaliação" : "Iniciar Atendimento"}
          </button>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="app-card-header">
        <div class="app-card-time-wrap">
          <span class="app-time">⏰ ${app.horario} - ${app.hrFim}</span>
          ${isAtual ? '<span class="tag-horario-atual">Agora</span>' : ''}
        </div>
        <div class="app-card-badges-wrap">
          ${badgeTipoConsulta}
          <span class="app-badge ${badgeClass}">${statusLabel}</span>
        </div>
      </div>

      <div class="app-card-client-row">
        <div class="app-client-name" title="${clienteTitulo}">👤 ${clienteTitulo}</div>
        ${tagsHtml ? `<div class="tags-container-card">${tagsHtml}</div>` : ''}
      </div>

      <div class="services-chips-box">${servicosHtml}</div>

      <div class="app-footer">
        <span class="app-footer-prof" title="${app.profissional}">👩‍⚕️ ${app.profissional}</span>
        <span class="app-footer-sala" title="${app.salaNome}">📍 ${app.salaNome}</span>
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

    card.addEventListener("click", () => {
      if (typeof callbackAbrirAtendimento === "function") {
        callbackAbrirAtendimento(app);
      }
    });

    fragmento.appendChild(card);
  });

  agendaTimelineContainer.appendChild(fragmento);

  atualizarKpis();
  atualizarDisplayDataAgenda();

  // Busca e atualiza os saldos de cada procedimento em segundo plano
  carregarSaldosAgenda(filtrados);
}

let callbackMudarDataAgenda = null;

export function somarDiasIso(dataIso, deltaDias) {
  try {
    const partes = String(dataIso || "").split("-");
    if (partes.length !== 3) {
      const d = new Date();
      d.setDate(d.getDate() + deltaDias);
      return d.toISOString().split("T")[0];
    }
    const d = new Date(parseInt(partes[0], 10), parseInt(partes[1], 10) - 1, parseInt(partes[2], 10));
    d.setDate(d.getDate() + deltaDias);
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  } catch (e) {
    return dataIso;
  }
}

export function atualizarDisplayDataAgenda() {
  const lblData = document.getElementById("agenda-date-text");
  if (!lblData) return;
  const dataIso = state.currentDataAgenda || new Date().toISOString().split("T")[0];
  
  try {
    const partes = dataIso.split("-");
    if (partes.length === 3) {
      const ano = parseInt(partes[0], 10);
      const mes = parseInt(partes[1], 10) - 1;
      const dia = parseInt(partes[2], 10);
      const d = new Date(ano, mes, dia);
      
      const hoje = new Date();
      const hojeZero = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
      const alvoZero = new Date(ano, mes, dia);
      const diffDias = Math.round((alvoZero - hojeZero) / (1000 * 60 * 60 * 24));
      
      const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
      const nomeDia = diasSemana[d.getDay()];
      const diaFmt = String(dia).padStart(2, "0");
      const mesFmt = String(mes + 1).padStart(2, "0");
      
      if (diffDias === 0) {
        lblData.textContent = `Hoje • ${nomeDia}, ${diaFmt}/${mesFmt}`;
      } else if (diffDias === 1) {
        lblData.textContent = `Amanhã • ${nomeDia}, ${diaFmt}/${mesFmt}`;
      } else if (diffDias === -1) {
        lblData.textContent = `Ontem • ${nomeDia}, ${diaFmt}/${mesFmt}`;
      } else {
        lblData.textContent = `${nomeDia}, ${diaFmt}/${mesFmt}/${ano}`;
      }
      return;
    }
  } catch (e) {}

  lblData.textContent = dataIso;
}

export function inicializarAgendaView(onAbrirAtendimento, options = {}) {
  callbackAbrirAtendimento = onAbrirAtendimento;
  if (options.onMudarDataAgenda) {
    callbackMudarDataAgenda = options.onMudarDataAgenda;
  }

  // --- Controles de Navegação de Data ---
  const btnPrevDay = document.getElementById("btn-agenda-prev-day");
  const btnNextDay = document.getElementById("btn-agenda-next-day");
  const btnToday = document.getElementById("btn-agenda-today");
  const btnRefresh = document.getElementById("btn-agenda-refresh");

  if (btnPrevDay) {
    btnPrevDay.addEventListener("click", () => {
      const novaData = somarDiasIso(state.currentDataAgenda, -1);
      state.currentDataAgenda = novaData;
      atualizarDisplayDataAgenda();
      if (typeof callbackMudarDataAgenda === "function") {
        callbackMudarDataAgenda(novaData);
      }
    });
  }

  if (btnNextDay) {
    btnNextDay.addEventListener("click", () => {
      const novaData = somarDiasIso(state.currentDataAgenda, 1);
      state.currentDataAgenda = novaData;
      atualizarDisplayDataAgenda();
      if (typeof callbackMudarDataAgenda === "function") {
        callbackMudarDataAgenda(novaData);
      }
    });
  }

  if (btnToday) {
    btnToday.addEventListener("click", () => {
      const hoje = new Date().toISOString().split("T")[0];
      state.currentDataAgenda = hoje;
      atualizarDisplayDataAgenda();
      if (typeof callbackMudarDataAgenda === "function") {
        callbackMudarDataAgenda(hoje);
      }
    });
  }

  if (btnRefresh) {
    btnRefresh.addEventListener("click", () => {
      atualizarDisplayDataAgenda();
      if (typeof callbackMudarDataAgenda === "function") {
        callbackMudarDataAgenda(state.currentDataAgenda);
      }
    });
  }

  // --- Campo de Busca Rápida na Timeline ---
  const inputBusca = document.getElementById("agenda-input-busca");
  const btnLimparBusca = document.getElementById("btn-agenda-limpar-busca");

  if (inputBusca) {
    inputBusca.addEventListener("input", (e) => {
      const valor = e.target.value.trim();
      state.termoBuscaAtivo = valor;
      if (btnLimparBusca) {
        btnLimparBusca.style.display = valor ? "block" : "none";
      }
      renderizarAgenda();
    });
  }

  if (btnLimparBusca) {
    btnLimparBusca.addEventListener("click", () => {
      if (inputBusca) inputBusca.value = "";
      state.termoBuscaAtivo = "";
      btnLimparBusca.style.display = "none";
      renderizarAgenda();
      if (inputBusca) inputBusca.focus();
    });
  }

  // Atualiza display inicial de data
  atualizarDisplayDataAgenda();

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

  const selectStatusMais = document.getElementById("select-status-mais");
  const statusTabButtons = document.querySelectorAll(".status-tab-btn");

  statusTabButtons.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      statusTabButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      if (selectStatusMais) {
        selectStatusMais.value = "";
        selectStatusMais.classList.remove("active");
      }
      state.filtroStatusAtivo = btn.getAttribute("data-status") || "todos";
      renderizarAgenda();
    });
  });

  if (selectStatusMais) {
    selectStatusMais.addEventListener("change", (e) => {
      const val = e.target.value;
      statusTabButtons.forEach(b => b.classList.remove("active"));
      if (val) {
        selectStatusMais.classList.add("active");
        state.filtroStatusAtivo = val;
      } else {
        selectStatusMais.classList.remove("active");
        state.filtroStatusAtivo = "confirmado";
        const btnConfirmado = document.querySelector('.status-tab-btn[data-status="confirmado"]');
        if (btnConfirmado) btnConfirmado.classList.add("active");
      }
      renderizarAgenda();
    });
  }

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
        if (selectStatusMais) {
          selectStatusMais.value = ["atendimento", "agendado", "falta", "bloqueado"].includes(filter) ? filter : "";
          if (selectStatusMais.value) selectStatusMais.classList.add("active");
          else selectStatusMais.classList.remove("active");
        }
        renderizarAgenda();
      }
    });
  });
}
