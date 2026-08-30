/**
 * BELLE COPILOT - ENTRYPOINT PRINCIPAL (ES MODULES)
 * Orquestrador central da extensão Belle Copilot Manifest V3.
 */

import { state } from './core/state.js';
import { 
  buscarDadosUsuarioApi, 
  buscarEstabelecimentosApi, 
  buscarGridSalaApi, 
  buscarAgendaApi,
  buscarDetalhesAgendaApi, 
  montarArrGridDeGridSala 
} from './core/api-client.js';
import { aplicarVisualizacaoPorPerfil, classificarPerfilUsuario } from './core/permissions.js';
import { 
  renderizarAgenda, 
  renderizarSalasFiltro, 
  sincronizarSalasComAgendamentos, 
  processarItensAgenda, 
  atualizarKpis, 
  inicializarAgendaView 
} from './views/agenda-view.js';
import { 
  abrirAtendimento, 
  renderizarParametrosLaser, 
  renderizarServicosComSaldo, 
  inicializarAtendimentoView 
} from './views/atendimento-view.js';
import { 
  renderizarPainelComercial, 
  inicializarComercialView 
} from './views/comercial-view.js';
import { inicializarConfigView } from './views/config-view.js';
import { configurarModalAgendarProxima } from './components/modal-agendar-proxima.js';

// Elementos de Identificação
const userDisplayName = document.getElementById("user-display-name");
const userRoleDisplay = document.getElementById("user-role-display");
const unidadeDisplay = document.getElementById("unidade-display");
const sessionStatus = document.getElementById("session-status");
const selectRolePreview = document.getElementById("select-role-preview");
const headerLogoImg = document.getElementById("header-logo-img");
const headerAvatarFallback = document.getElementById("header-avatar-fallback");
const btnRefreshSession = document.getElementById("btn-refresh-session");
const loadingAgenda = document.getElementById("loading-agenda");
const agendaTimelineContainer = document.getElementById("agenda-timeline-container");
const agendaEmptyState = document.getElementById("agenda-empty-state");

export function ativarModulo(moduleId) {
  const moduleNavBtns = document.querySelectorAll(".module-nav-btn");
  moduleNavBtns.forEach(btn => {
    if (btn.getAttribute("data-module") === moduleId) btn.classList.add("active");
    else btn.classList.remove("active");
  });

  const modules = document.querySelectorAll(".module-container");
  modules.forEach(m => {
    if (m.id === moduleId) {
      m.style.display = "flex";
      m.classList.add("active");
    } else {
      m.style.display = "none";
      m.classList.remove("active");
    }
  });

  const tabConfig = document.getElementById("tab-config");
  if (tabConfig) tabConfig.style.display = "none";
}

export function ativarAba(targetId) {
  if (targetId === "tab-agenda" || targetId === "tab-atendimento") {
    ativarModulo("module-agenda");
    const subTabButtons = document.querySelectorAll(".sub-tab-item");
    subTabButtons.forEach(b => {
      if (b.getAttribute("data-target") === targetId) b.classList.add("active");
      else b.classList.remove("active");
    });
    const subTabs = document.querySelectorAll("#module-agenda .tab-content");
    subTabs.forEach(tc => {
      if (tc.id === targetId) tc.classList.add("active");
      else tc.classList.remove("active");
    });
  } else if (targetId === "tab-comercial") {
    ativarModulo("module-comercial");
    const comTab = document.getElementById("tab-comercial");
    if (comTab) comTab.classList.add("active");
  } else if (targetId === "tab-config") {
    const tabConfig = document.getElementById("tab-config");
    if (tabConfig) {
      document.querySelectorAll(".module-container").forEach(m => m.style.display = "none");
      tabConfig.style.display = "block";
      tabConfig.classList.add("active");
    }
  }
}

export function aplicarLogoEmpresa(logoUrl) {
  if (!logoUrl || !headerLogoImg) return;
  headerLogoImg.src = logoUrl;
  headerLogoImg.style.display = "block";
  if (headerAvatarFallback) headerAvatarFallback.style.display = "none";
}

async function safeSendMessageToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    return null;
  }
}

async function getBelleTab() {
  try {
    const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTabs.length > 0 && activeTabs[0].url && activeTabs[0].url.includes("bellesoftware.com.br")) {
      return activeTabs[0];
    }
    const belleTabs = await chrome.tabs.query({ url: "*://app.bellesoftware.com.br/*" });
    if (belleTabs.length > 0) return belleTabs[0];
  } catch (e) {
    console.warn("Erro ao buscar abas:", e);
  }
  return null;
}

export async function sincronizarSessao() {
  if (sessionStatus) {
    sessionStatus.innerHTML = '<span class="status-dot"></span> Conectando...';
    sessionStatus.className = "status-offline";
  }

  try {
    const belleTab = await getBelleTab();
    let pageContext = null;
    if (belleTab?.id) {
      pageContext = await safeSendMessageToTab(belleTab.id, { action: "GET_BELLE_PAGE_CONTEXT" });
    }

    if (pageContext?.auth) {
      state.currentToken = pageContext.auth.token || state.currentToken;
      state.currentCodUsuario = pageContext.auth.user || state.currentCodUsuario;
      state.currentCodEstab = String(pageContext.auth.etb || state.currentCodEstab || "1");
    }

    if (pageContext?.dataAgenda) {
      state.currentDataAgenda = pageContext.dataAgenda;
      console.log(`[BelleCopilot] 📅 Data ativa detectada na página do Belle: ${state.currentDataAgenda}`);
    }

    if (!state.currentToken) {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "GET_BELLE_COOKIES" }, resolve);
      });

      if (response?.cookies) {
        const etbCookie = response.cookies.find(c => c.name === `token_${state.currentCodEstab}`);
        const genericCookie = response.cookies.find(c => c.name === "token" || c.name === "authToken");
        const found = etbCookie || genericCookie || response.cookies.find(c => c.name.startsWith("token_"));
        if (found) {
          state.currentToken = found.value;
          const match = found.name.match(/token_(\d+)/);
          if (match) state.currentCodEstab = match[1];
        }
      }
    }

    if (state.currentToken) {
      // 1. Dados do Usuário
      const userData = await buscarDadosUsuarioApi(state.currentToken, state.currentCodUsuario);
      if (userData) {
        state.currentUserData = userData;
        state.currentUserName = userData.nom_usuario || userData.nomeUsuario || "Master - Patrícia Karla";
        if (userDisplayName) userDisplayName.textContent = `👤 ${state.currentUserName}`;

        const grupo = (userData.grupos && userData.grupos[0]?.nome) ? userData.grupos[0].nome : (userData.cod_usuario || state.currentCodUsuario);
        if (userRoleDisplay) {
          userRoleDisplay.textContent = `🏷️ ${grupo}`;
          userRoleDisplay.title = `Grupo: ${grupo}`;
        }

        const perfilDetectado = classificarPerfilUsuario(userData, state.currentCodUsuario);
        state.currentUserOriginalRole = perfilDetectado;
        aplicarVisualizacaoPorPerfil(perfilDetectado, {
          onAtivarAba: ativarAba,
          onRenderizarComercial: renderizarPainelComercial
        });

        if (sessionStatus) {
          sessionStatus.innerHTML = '<span class="status-dot"></span> Conectado';
          sessionStatus.className = "status-online";
        }
      }

      // 2. Estabelecimentos
      const ests = await buscarEstabelecimentosApi(state.currentToken, state.currentCodEstab);
      if (Array.isArray(ests) && ests.length > 0) {
        state.currentEstabelecimentos = ests;
        const ativo = ests.find(e => e.cod == state.currentCodEstab) || ests.find(e => e.padrao == 1) || ests[0];
        if (ativo) {
          state.currentClinicaNome = ativo.nome;
          if (unidadeDisplay) {
            unidadeDisplay.textContent = `🏢 ${ativo.nome}`;
            unidadeDisplay.title = `${ativo.nome} - CNPJ: ${ativo.cnpj || 'N/A'} (${ativo.uf || ''})`;
          }
        }
      }

      // 3. Grid de Salas
      const gridSalas = await buscarGridSalaApi(state.currentToken, state.currentCodEstab);
      if (Array.isArray(gridSalas) && gridSalas.length > 0) {
        state.currentSalas = gridSalas;
        state.lastInterceptedArrGrid = montarArrGridDeGridSala(gridSalas, state.currentCodEstab);
        renderizarSalasFiltro(state.currentSalas);
      }

      // 4. Carrega a Agenda Autônoma do Dia
      if (loadingAgenda) loadingAgenda.style.display = "flex";
      const rawAgenda = await buscarAgendaApi(state.currentToken, state.currentDataAgenda, state.lastInterceptedArrGrid, state.currentCodEstab);
      if (Array.isArray(rawAgenda) && rawAgenda.length > 0) {
        state.appointmentsData = processarItensAgenda(rawAgenda);
        sincronizarSalasComAgendamentos(state.appointmentsData);
        if (loadingAgenda) loadingAgenda.style.display = "none";
        if (agendaTimelineContainer) agendaTimelineContainer.style.display = "flex";
        if (agendaEmptyState) agendaEmptyState.style.display = "none";
        renderizarAgenda();
        renderizarPainelComercial();
        atualizarKpis();
      } else {
        if (loadingAgenda) loadingAgenda.style.display = "none";
        if (state.appointmentsData.length === 0) {
          if (agendaEmptyState) agendaEmptyState.style.display = "block";
        }
      }
    }
  } catch (err) {
    console.warn("Erro ao sincronizar sessão:", err);
  }
}

export async function navegarParaDataAgenda(dataIso) {
  if (!dataIso) return;
  console.log(`[BelleCopilot] 📅 Navegando para data da agenda: ${dataIso}`);
  state.currentDataAgenda = dataIso;
  
  ativarModulo("module-agenda");
  ativarAba("tab-agenda");

  const loadingAgendaEl = document.getElementById("loading-agenda");
  const agendaTimelineEl = document.getElementById("agenda-timeline-container");
  const agendaEmptyEl = document.getElementById("agenda-empty-state");

  if (loadingAgendaEl) loadingAgendaEl.style.display = "flex";
  if (agendaTimelineEl) agendaTimelineEl.style.display = "none";
  if (agendaEmptyEl) agendaEmptyEl.style.display = "none";

  try {
    const rawAgenda = await buscarAgendaApi(state.currentToken, state.currentDataAgenda, state.lastInterceptedArrGrid, state.currentCodEstab);
    state.appointmentsData = processarItensAgenda(rawAgenda);
    sincronizarSalasComAgendamentos(state.appointmentsData);
    if (loadingAgendaEl) loadingAgendaEl.style.display = "none";
    if (agendaTimelineEl) agendaTimelineEl.style.display = "flex";
    renderizarAgenda();
    renderizarPainelComercial();
    atualizarKpis();
  } catch (e) {
    if (loadingAgendaEl) loadingAgendaEl.style.display = "none";
    console.warn("Erro ao buscar agenda para data:", e);
  }
}

// Inicialização Principal
document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 [BELLE COPILOT] Inicializando aplicação modular...");

  // Configura modal de agendamento com callback de navegação
  configurarModalAgendarProxima({
    onVerNaAgenda: (dataIso) => {
      navegarParaDataAgenda(dataIso);
    }
  });

  // Inicializa Módulos Principais (Agenda | Comercial)
  const moduleNavBtns = document.querySelectorAll(".module-nav-btn");
  moduleNavBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const targetModule = btn.getAttribute("data-module");
      if (targetModule) {
        ativarModulo(targetModule);
        if (targetModule === "module-comercial") {
          renderizarPainelComercial();
        }
      }
    });
  });

  // Inicializa Sub-Abas da Agenda (Agenda do Dia | Atendimento)
  const subTabButtons = document.querySelectorAll(".sub-tab-item");
  subTabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-target");
      if (target) ativarAba(target);
    });
  });

  // Seletor de Perfil (Gerente / Master)
  selectRolePreview?.addEventListener("change", (e) => {
    const novoPerfil = e.target.value;
    aplicarVisualizacaoPorPerfil(novoPerfil, {
      onAtivarAba: ativarAba,
      onRenderizarComercial: renderizarPainelComercial
    });
  });

  btnRefreshSession?.addEventListener("click", () => {
    sincronizarSessao();
  });

  // Inicializa Views
  inicializarAgendaView((app) => {
    abrirAtendimento(app, null, {
      onAtivarAba: ativarAba,
      onRecarregarAgenda: () => sincronizarSessao()
    });
  });

  inicializarAtendimentoView({
    onAtivarAba: ativarAba,
    onRecarregarAgenda: () => sincronizarSessao()
  });

  inicializarComercialView();

  inicializarConfigView({
    onAtivarAba: ativarAba,
    onRecarregarTudo: () => sincronizarSessao()
  });

  // Dispara primeira sincronização
  sincronizarSessao();
});

// Listener de Eventos em Tempo Real interceptados do Belle Software
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "BELLE_LIVE_AGENDA_CAPTURED" && Array.isArray(msg.data)) {
    console.log(`[BelleCopilot] 📥 Recebidos ${msg.data.length} agendamentos ao vivo da página do Belle!`);
    
    // Sincroniza a data detectada no corpo da requisição ou nos agendamentos
    if (msg.date) {
      state.currentDataAgenda = msg.date;
    } else if (msg.requestBody) {
      try {
        const bodyObj = typeof msg.requestBody === 'string' ? JSON.parse(msg.requestBody) : msg.requestBody;
        if (bodyObj && bodyObj.dtAgenda) {
          const matchIso = bodyObj.dtAgenda.match(/^(\d{4}-\d{2}-\d{2})/);
          if (matchIso) state.currentDataAgenda = matchIso[0];
        }
      } catch (e) {}
    } else if (msg.data.length > 0 && msg.data[0].dt_consulta) {
      state.currentDataAgenda = msg.data[0].dt_consulta;
    }

    state.appointmentsData = processarItensAgenda(msg.data);
    sincronizarSalasComAgendamentos(state.appointmentsData);
    
    if (loadingAgenda) loadingAgenda.style.display = "none";
    if (agendaTimelineContainer) agendaTimelineContainer.style.display = "flex";
    if (agendaEmptyState) agendaEmptyState.style.display = "none";
    
    renderizarAgenda();
    renderizarPainelComercial();
    atualizarKpis();
  } else if (msg.action === "BELLE_DATE_SELECTED" && msg.data) {
    if (msg.data !== state.currentDataAgenda) {
      state.currentDataAgenda = msg.data;
      console.log(`[BelleCopilot] 📅 Data alterada no Belle para: ${state.currentDataAgenda}`);
      if (loadingAgenda) loadingAgenda.style.display = "flex";
      buscarAgendaApi(state.currentToken, state.currentDataAgenda, state.lastInterceptedArrGrid, state.currentCodEstab).then(rawAgenda => {
        if (Array.isArray(rawAgenda)) {
          state.appointmentsData = processarItensAgenda(rawAgenda);
          sincronizarSalasComAgendamentos(state.appointmentsData);
          if (loadingAgenda) loadingAgenda.style.display = "none";
          if (agendaTimelineContainer) agendaTimelineContainer.style.display = "flex";
          if (agendaEmptyState) agendaEmptyState.style.display = "none";
          renderizarAgenda();
          renderizarPainelComercial();
          atualizarKpis();
        }
      }).catch(() => {
        if (loadingAgenda) loadingAgenda.style.display = "none";
      });
    }
  } else if (msg.action === "BELLE_LIVE_SALAS_CAPTURED" && Array.isArray(msg.data)) {
    state.currentSalas = msg.data;
    if (msg.data.length > 0) {
      if (msg.data[0].nom_clinica) {
        state.currentClinicaNome = msg.data[0].nom_clinica;
        if (unidadeDisplay) unidadeDisplay.textContent = `🏢 ${state.currentClinicaNome}`;
      }
      if (msg.data[0].cod_clinica) {
        state.currentCodEstab = String(msg.data[0].cod_clinica);
      }
      state.lastInterceptedArrGrid = montarArrGridDeGridSala(msg.data, state.currentCodEstab);
    }
    renderizarSalasFiltro(state.currentSalas);
  } else if (msg.action === "BELLE_LIVE_ATENDIMENTO_CAPTURED" && msg.codConsulta) {
    const matchApp = state.appointmentsData.find(a => 
      String(a.codConsulta) === String(msg.codConsulta) || 
      String(a.id) === String(msg.codConsulta)
    );
    if (matchApp) {
      abrirAtendimento(matchApp, msg.data, { onAtivarAba: ativarAba });
    } else if (msg.data && typeof msg.data === "object") {
      const appHydrated = {
        id: msg.codConsulta,
        codConsulta: msg.codConsulta,
        clienteNome: msg.data.nomPaciente || msg.data.nom_paciente || "Cliente",
        codCliente: msg.data.codPaciente || msg.data.cod_paciente || "",
        cpf: msg.data.cpf || "",
        telefone: msg.data.celular || msg.data.telefone || "",
        horario: msg.data.hrIni || "08:00",
        hrFim: msg.data.hrFim || "08:30",
        duracaoMin: 30,
        status: (function(s) {
          const l = s.toLowerCase();
          if (l.includes("aguard") || l.includes("espera") || l.includes("recep")) return "aguardando";
          if (l === "atendido" || l.includes("finaliz") || l.includes("conclu")) return "finalizado";
          if (l.includes("andamento") || l === "atendimento" || l.includes("em atend")) return "atendimento";
          if (l.includes("confirm")) return "confirmado";
          if (l.includes("falh") || l.includes("falt") || l.includes("cancel")) return "falta";
          if (l.includes("bloq")) return "bloqueado";
          return "agendado";
        })(msg.data.statusAgendamento || msg.data.status || "Marcado"),
        statusFormatado: msg.data.statusAgendamento || msg.data.status || "Marcado",
        salaNome: msg.data.sala || msg.data.nomSala || "SALA DEPILAÇÃO A LASER",
        profissional: msg.data.nomProf || msg.data.profissional || "",
        nomePlano: msg.data.nomePlano || msg.data.nome_plano || "",
        codOrcamento: msg.data.cod_plano_paciente || msg.data.codOrc || msg.data.cod_orcamento || "",
        codPlano: msg.data.cod_plano || msg.data.codPlano || "",
        idGeinfo: msg.data.id_geinfo || msg.data.idGeinfo || "114411",
        arrServ: Array.isArray(msg.data.servicos) ? msg.data.servicos.map(s => ({
          nome: s.nome || s.nom_servico,
          cod_servico: s.cod_servico || s.id
        })) : []
      };
      abrirAtendimento(appHydrated, msg.data, { onAtivarAba: ativarAba });
    }
  } else if (msg.action === "BELLE_LIVE_PARAMETROS_LASER_CAPTURED") {
    if (msg.data && Array.isArray(msg.data.registros)) {
      renderizarParametrosLaser(msg.data.registros);
    }
  } else if (msg.action === "BELLE_LIVE_SALDO_VENDA_PLANO_CAPTURED") {
    if (Array.isArray(msg.data) && msg.data.length > 0) {
      renderizarServicosComSaldo(msg.data);
    }
  } else if (msg.action === "BELLE_LIVE_PARAMETROS_EMPRESA_CAPTURED" && msg.data?.logo_empresa) {
    aplicarLogoEmpresa(msg.data.logo_empresa);
  } else if (msg.action === "BELLE_TOKEN_CAPTURED" && msg.token) {
    if (msg.token && msg.token !== state.currentToken) {
      state.currentToken = msg.token;
      console.log("[BelleCopilot] 🔑 Token de autorização sincronizado da aba!");
    }
  } else if (msg.action === "BELLE_AGENDA_ITEM_SELECTED") {
    const codCons = msg.codConsulta || msg.codigo;
    if (!codCons) return;

    // 1. Prioridade máxima: match exato por codConsulta ou id do agendamento específico
    let matchApp = state.appointmentsData.find(a => 
      String(a.codConsulta) === String(codCons) || 
      String(a.id) === String(codCons)
    );

    // 2. Se não encontrou por codConsulta, verifica se o código bate com codCliente
    if (!matchApp) {
      const candidatosCliente = state.appointmentsData.filter(a => 
        a.codCliente && String(a.codCliente) === String(codCons)
      );

      if (candidatosCliente.length === 1) {
        matchApp = candidatosCliente[0];
      } else if (candidatosCliente.length > 1) {
        // Desambigua entre os agendamentos da mesma cliente
        if (msg.horario) {
          matchApp = candidatosCliente.find(a => a.horario && a.horario.startsWith(msg.horario));
        }
        if (!matchApp && msg.rawText) {
          const rawLower = msg.rawText.toLowerCase();
          matchApp = candidatosCliente.find(a => {
            const proc = (a.procedimento || "").toLowerCase();
            return proc && rawLower.includes(proc.substring(0, 5));
          });
        }
        // Se ainda não desambiguou e já há um aberto, seleciona o outro agendamento
        if (!matchApp) {
          matchApp = candidatosCliente.find(a => String(a.id) !== String(state.selectedAppointment?.id)) || candidatosCliente[0];
        }
      }
    }

    // 3. Fallback por nome do paciente no rawText
    if (!matchApp && msg.rawText) {
      const matchPorNome = state.appointmentsData.filter(a => 
        a.clienteNome && a.clienteNome.length >= 3 && msg.rawText.toLowerCase().includes(a.clienteNome.toLowerCase())
      );
      if (matchPorNome.length === 1) {
        matchApp = matchPorNome[0];
      } else if (matchPorNome.length > 1) {
        if (msg.horario) {
          matchApp = matchPorNome.find(a => a.horario && a.horario.startsWith(msg.horario));
        }
        if (!matchApp) {
          matchApp = matchPorNome.find(a => String(a.id) !== String(state.selectedAppointment?.id)) || matchPorNome[0];
        }
      }
    }

    if (matchApp) {
      abrirAtendimento(matchApp, null, { onAtivarAba: ativarAba });
    } else {
      const appFallback = {
        id: codCons,
        codConsulta: codCons,
        clienteNome: "Cliente",
        horario: msg.horario || "08:00",
        duracaoMin: 30,
        status: "agendado",
        statusFormatado: "Marcado",
        salaNome: "SALA DEPILAÇÃO A LASER",
        procedimento: "Depilação a Laser",
        arrServ: []
      };
      abrirAtendimento(appFallback, null, { onAtivarAba: ativarAba });
    }
  }
});
