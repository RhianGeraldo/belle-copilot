/**
 * BELLE COPILOT - ENTRYPOINT PRINCIPAL (ES MODULES)
 * Orquestrador central da extensão Belle Copilot Manifest V3.
 */

import { state, definirArrGrid, arrGridDaUnidade } from './core/state.js';
import { resolverSessaoBelle, aplicarSessaoNoEstado, mensagemEhDaUnidadeAtiva, obterAbaBelle, extrairUnidadeDaUrl, nomeDaUnidadeAtiva } from './core/session.js';
import { lerCache, gravarCache } from './core/cache-persistente.js';
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
import { inicializarComercialView } from './views/comercial-view.js';
import { 
  carregarSucessoCliente, 
  renderizarCsView, 
  inicializarCsView 
} from './views/cs-view.js';
import { inicializarConfigView } from './views/config-view.js';
import { carregarVendas, inicializarVendasView } from './views/vendas-view.js';
import { carregarOportunidades, inicializarOportunidadesView } from './views/oportunidades-view.js';

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
  if (targetId === "tab-agenda" || targetId === "tab-atendimento" || targetId === "tab-cs" || targetId === "tab-oportunidades") {
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
    if (targetId === "tab-cs") {
      renderizarCsView();
    } else if (targetId === "tab-oportunidades") {
      // Consulta própria (vendasplanos dos últimos 30 dias): busca ao abrir a aba.
      carregarOportunidades();
    }
  } else if (targetId === "tab-comercial" || targetId === "tab-vendas") {
    // O módulo Comercial tem uma aba só; "tab-comercial" continua aceito como apelido.
    ativarModulo("module-comercial");
    document.querySelectorAll("#module-comercial .tab-content").forEach(tc => {
      tc.classList.toggle("active", tc.id === "tab-vendas");
    });

    // O funil vive do vendasplanos, não da agenda: carrega ao abrir.
    carregarVendas();
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

/**
 * Pinta usuário, unidade e salas com o que ficou guardado da última sessão desta unidade,
 * antes de qualquer requisição. A rede confirma logo em seguida e sobrescreve.
 */
async function pintarCabecalhoDoCache(unidade) {
  if (!unidade) return false;

  const [usuario, unidadeCache, salas] = await Promise.all([
    lerCache("usuario", unidade),
    lerCache("unidade", unidade),
    lerCache("salas", unidade)
  ]);

  if (usuario?.dados) {
    state.currentUserData = usuario.dados;
    state.currentUserName = usuario.dados.nom_usuario || state.currentUserName;
    if (userDisplayName) userDisplayName.textContent = `👤 ${state.currentUserName}`;
    const grupo = usuario.dados.grupos?.[0]?.nome || usuario.dados.cod_usuario || "";
    if (userRoleDisplay && grupo) userRoleDisplay.textContent = `🏷️ ${grupo}`;
  }

  if (unidadeCache?.dados) {
    state.currentUnidadeDados = unidadeCache.dados;
    state.currentClinicaNome = unidadeCache.dados.nome || state.currentClinicaNome;
    if (unidadeCache.dados.id_geinfo) state.currentIdGeinfo = String(unidadeCache.dados.id_geinfo);
    if (unidadeDisplay) unidadeDisplay.textContent = `🏢 ${state.currentClinicaNome}`;
  }

  if (Array.isArray(salas?.dados) && salas.dados.length > 0) {
    state.currentSalas = salas.dados;
    renderizarSalasFiltro(state.currentSalas);
  }

  const achou = Boolean(usuario?.dados || unidadeCache?.dados);
  if (achou) console.log(`[BelleCopilot] 💾 Cabeçalho pintado do cache local da unidade #${unidade}.`);
  return achou;
}

export async function sincronizarSessao() {
  if (sessionStatus) {
    sessionStatus.innerHTML = '<span class="status-dot"></span> Conectando...';
    sessionStatus.className = "status-offline";
  }

  try {
    // 0. Cache primeiro: a tela aparece preenchida enquanto a rede confirma.
    const abaBelle = await obterAbaBelle();
    await pintarCabecalhoDoCache(extrairUnidadeDaUrl(abaBelle?.url));

    // 1. SESSÃO: pergunta ao próprio Belle quem está logado e em qual unidade.
    //    O token é validado contra `estabelecimentos_do_usuario` e o perfil vem de
    //    `recuperar_dados`. A filial no backend do Belle é definida pelo TOKEN
    //    (etb/estabGeral/cod_clinica respondem "1" em todas as unidades).
    const sessao = await resolverSessaoBelle();
    const { unidadeAlterada } = aplicarSessaoNoEstado(sessao);

    console.log(`[BelleCopilot] 🏢 Unidade logada: #${sessao.unidade || "?"} ${sessao.nomeUnidade ? `(${sessao.nomeUnidade})` : ""} | token: ${sessao.origemToken || "NÃO ENCONTRADO"}${sessao.validada ? " ✓ validado no Belle" : ""}`);

    if (sessao.dataAgenda) {
      state.currentDataAgenda = sessao.dataAgenda;
      console.log(`[BelleCopilot] 📅 Data ativa detectada na página do Belle: ${state.currentDataAgenda}`);
    }

    if (!state.currentToken) {
      if (sessionStatus) {
        sessionStatus.innerHTML = '<span class="status-dot"></span> Faça login no Belle';
        sessionStatus.className = "status-offline";
      }
      console.warn("[BelleCopilot] ⚠️ Nenhuma sessão do Belle encontrada nesta janela. Abra o Belle e clique em 🔄.");
    }

    if (state.currentToken) {
      // 1. USUÁRIO LOGADO (recuperar_dados). O perfil já vem resolvido da sessão;
      //    só refaz a consulta se ela não tiver retornado.
      const userData = sessao.usuario || await buscarDadosUsuarioApi(state.currentToken, state.currentCodUsuario);

      if (userData) {
        state.currentUserData = userData;
        state.currentUserName = userData.nom_usuario || userData.nomeUsuario || state.currentUserName;
        if (userDisplayName) userDisplayName.textContent = `👤 ${state.currentUserName}`;

        const grupo = (userData.grupos && userData.grupos[0]?.nome) ? userData.grupos[0].nome : (userData.cod_usuario || state.currentCodUsuario);
        if (userRoleDisplay) {
          userRoleDisplay.textContent = `🏷️ ${grupo}`;
          userRoleDisplay.title = `Grupo: ${grupo}`;
        }
      } else {
        console.warn(`[BelleCopilot] ⚠️ recuperar_dados não retornou o perfil de "${state.currentCodUsuario}". A extensão segue com a sessão validada.`);
      }

      // O modo de visualização é aplicado mesmo sem perfil: sem isso o painel ficava
      // sem navegação quando o recuperar_dados falhava.
      const perfilDetectado = classificarPerfilUsuario(userData, state.currentCodUsuario);
      state.currentUserOriginalRole = perfilDetectado;
      aplicarVisualizacaoPorPerfil(perfilDetectado, {
        onAtivarAba: ativarAba,
      });

      if (sessionStatus) {
        sessionStatus.innerHTML = '<span class="status-dot"></span> Conectado';
        sessionStatus.className = "status-online";
      }

      // 2. UNIDADES DO USUÁRIO (estabelecimentos_do_usuario). Já vêm da validação da sessão.
      const ests = (Array.isArray(sessao.estabelecimentos) && sessao.estabelecimentos.length > 0)
        ? sessao.estabelecimentos
        : await buscarEstabelecimentosApi(state.currentToken, state.currentCodEstab);

      if (Array.isArray(ests) && ests.length > 0) {
        state.currentEstabelecimentos = ests;
        // O endpoint é relativo ao token: quando responde uma entrada só, ela é a unidade
        // aberta (o `cod` vem normalizado como 1 em qualquer filial).
        const nomeAtivo = nomeDaUnidadeAtiva(ests, state.currentCodEstab);
        const ativo = ests.length === 1
          ? ests[0]
          : ests.find(e => String(e.cod) === String(state.currentCodEstab));

        if (nomeAtivo) {
          state.currentClinicaNome = nomeAtivo;
          if (unidadeDisplay) {
            unidadeDisplay.textContent = `🏢 ${nomeAtivo}`;
            unidadeDisplay.title = `${nomeAtivo} — unidade #${state.currentCodEstab}${ativo?.cnpj ? ` • CNPJ: ${ativo.cnpj}` : ""}${ativo?.uf ? ` (${ativo.uf})` : ""}`;
          }
        } else if (unidadeDisplay) {
          unidadeDisplay.textContent = `🏢 Unidade #${state.currentCodEstab}`;
        }
      }

      // 3. Grid de Salas
      const gridSalas = await buscarGridSalaApi(state.currentToken, state.currentCodEstab);
      if (Array.isArray(gridSalas) && gridSalas.length > 0) {
        state.currentSalas = gridSalas;
        definirArrGrid(montarArrGridDeGridSala(gridSalas, state.currentCodEstab), state.currentCodEstab);
        renderizarSalasFiltro(state.currentSalas);
        gravarCache("salas", state.currentCodEstab, gridSalas);
      }

      // 4. Pós-atendimento (CS) em paralelo com a agenda do dia: ele tem sessão e grid
      //    próprios, então não precisa esperar a agenda terminar para começar a carregar.
      //    Recarga forçada quando a unidade mudou: o CS nunca reaproveita outra filial.
      const promessaCs = Promise.resolve(carregarSucessoCliente(unidadeAlterada)).catch(err => {
        console.warn("[BelleCopilot] Falha ao carregar o Sucesso do Cliente:", err);
      });

      // 5. Carrega a Agenda Autônoma do Dia
      if (loadingAgenda) loadingAgenda.style.display = "flex";
      const rawAgenda = await buscarAgendaApi(state.currentToken, state.currentDataAgenda, arrGridDaUnidade(state.currentCodEstab), state.currentCodEstab);
      if (Array.isArray(rawAgenda) && rawAgenda.length > 0) {
        state.appointmentsData = processarItensAgenda(rawAgenda);
        sincronizarSalasComAgendamentos(state.appointmentsData);
        if (loadingAgenda) loadingAgenda.style.display = "none";
        if (agendaTimelineContainer) agendaTimelineContainer.style.display = "flex";
        if (agendaEmptyState) agendaEmptyState.style.display = "none";
        renderizarAgenda();
        atualizarKpis();
      } else {
        if (loadingAgenda) loadingAgenda.style.display = "none";
        if (state.appointmentsData.length === 0) {
          if (agendaEmptyState) agendaEmptyState.style.display = "block";
        }
      }

      await promessaCs;
    }
  } catch (err) {
    console.warn("Erro ao sincronizar sessão:", err);
  }
}

// Inicialização Principal
document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 [BELLE COPILOT] Inicializando aplicação modular...");

  // Inicializa Módulos Principais (Agenda | Comercial)
  // Primeira sub-aba de cada módulo. Trocar de módulo passa a cair sempre nela:
  // antes `ativarModulo` só trocava o container e as sub-abas ficavam como estavam,
  // então voltar ao Comercial reabria "Vendas & Resgate" com a barra dessincronizada.
  const ABA_INICIAL_DO_MODULO = {
    "module-agenda": "tab-agenda",
    "module-comercial": "tab-vendas"
  };

  const moduleNavBtns = document.querySelectorAll(".module-nav-btn");
  moduleNavBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const targetModule = btn.getAttribute("data-module");
      if (!targetModule) return;

      ativarAba(ABA_INICIAL_DO_MODULO[targetModule] || targetModule);
    });
  });

  // Inicializa Sub-Abas da Agenda (Agenda do Dia | Atendimento | Sucesso do Cliente)
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

  inicializarCsView();

  inicializarVendasView();

  inicializarOportunidadesView();

  inicializarConfigView({
    onAtivarAba: ativarAba,
    onRecarregarTudo: () => sincronizarSessao()
  });

  // Dispara primeira sincronização
  sincronizarSessao();
});

// Re-sincroniza o painel quando a aba ativa do Belle passa a ser outra unidade.
let timerResync = null;
function agendarResyncDeUnidade(motivo) {
  if (timerResync) clearTimeout(timerResync);
  timerResync = setTimeout(async () => {
    timerResync = null;
    const aba = await obterAbaBelle();
    const unidadeAba = extrairUnidadeDaUrl(aba?.url);

    // Sem aba do Belle localizável, mantém tudo como está em vez de re-resolver a
    // sessão às cegas — re-resolver sem referência pode cair no cookie de outra filial.
    if (!aba) return;
    // Compara com a unidade de aba usada na ÚLTIMA resolução (e não com a unidade que
    // autenticou): quando as duas divergem, comparar com a unidade final re-sincronizaria
    // sem parar a cada mensagem da página.
    if (unidadeAba && String(unidadeAba) !== String(state.unidadeAbaResolvida || "")) {
      console.log(`[BelleCopilot] 🔁 Unidade da aba mudou para #${unidadeAba} (${motivo}). Re-sincronizando o painel.`);
      sincronizarSessao();
    }
  }, 400);
}

// Sair da aba do Belle (ir para o WhatsApp Web, e-mail, etc.) NÃO mexe no painel:
// os dados carregados continuam na tela. Só uma aba do Belle em outra unidade
// justifica re-sincronizar.
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const aba = await chrome.tabs.get(tabId);
    if (!aba?.url || !aba.url.includes("bellesoftware.com.br")) return;

    const unidadeAba = extrairUnidadeDaUrl(aba.url);
    if (unidadeAba && String(unidadeAba) !== String(state.unidadeAbaResolvida || "")) {
      agendarResyncDeUnidade("aba do Belle em outra unidade");
    }
  } catch (e) {}
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && String(tab?.url || "").includes("bellesoftware.com.br")) {
    agendarResyncDeUnidade("navegação no Belle");
  }
});

// Listener de Eventos em Tempo Real interceptados do Belle Software
chrome.runtime.onMessage.addListener((msg, sender) => {
  // Descarta o que vier de uma aba do Belle logada em OUTRA unidade: o content script roda
  // em todas as abas e uma segunda filial aberta contaminava agenda, atendimento e CS.
  if (!mensagemEhDaUnidadeAtiva(sender)) {
    // Descarte sempre visível no console: um filtro silencioso já derrubou a agenda ao vivo
    // e o clique em agendamento sem deixar rastro.
    console.warn(`[BelleCopilot] 🚫 Mensagem "${msg.action}" ignorada: veio de uma aba do Belle em outra unidade (${sender?.tab?.url || "origem desconhecida"}); o painel acompanha a unidade #${state.unidadeAbaBelle}.`);
    // Se a aba que falou é a que está em foco, a operadora trocou de unidade: o painel a segue.
    if (sender?.tab?.active) agendarResyncDeUnidade("mensagem da aba em foco");
    return;
  }

  if (msg.action === "BELLE_LIVE_AGENDA_CAPTURED" && Array.isArray(msg.data)) {
    console.log(`[BelleCopilot] 📥 Recebidos ${msg.data.length} agendamentos ao vivo da página do Belle!`);
    
    if (msg.token) {
      state.currentToken = msg.token;
    }

    // A mensagem já foi validada como sendo da unidade ativa, então o payload real do
    // Belle pode ser aproveitado integralmente para replicar consultas de outras datas.
    if (msg.requestBody) {
      try {
        const bodyObj = typeof msg.requestBody === 'string' ? JSON.parse(msg.requestBody) : msg.requestBody;
        if (bodyObj && typeof bodyObj === 'object') {
          state.lastInterceptedAgendaPayload = bodyObj;

          if (Array.isArray(bodyObj.arrGrid) && bodyObj.arrGrid.length > 0) {
            // Grid real da unidade logada, carimbado com a unidade de origem.
            definirArrGrid(bodyObj.arrGrid, state.currentCodEstab);
            if (bodyObj.arrGrid[0]?.nom_clinica) {
              state.currentClinicaNome = bodyObj.arrGrid[0].nom_clinica;
              if (unidadeDisplay) unidadeDisplay.textContent = `🏢 ${state.currentClinicaNome}`;
            }
          }

          // `bodyObj.etb` e `arrGrid[].cod_clinica` NÃO são lidos de propósito: o Belle
          // responde "1" neles em todas as filiais, e usá-los jogava o painel para a
          // unidade #1 mesmo com a usuária logada em outra.
        }
      } catch (e) {}
    }

    // Data ativa: prioriza a detectada na requisição, depois o payload, depois os registros.
    if (msg.date) {
      state.currentDataAgenda = msg.date;
    } else if (state.lastInterceptedAgendaPayload?.dtAgenda) {
      const matchIso = String(state.lastInterceptedAgendaPayload.dtAgenda).match(/^(\d{4}-\d{2}-\d{2})/);
      if (matchIso) state.currentDataAgenda = matchIso[0];
    } else if (msg.data.length > 0 && msg.data[0].dt_consulta) {
      state.currentDataAgenda = msg.data[0].dt_consulta;
    }

    state.appointmentsData = processarItensAgenda(msg.data);
    sincronizarSalasComAgendamentos(state.appointmentsData);
    
    if (loadingAgenda) loadingAgenda.style.display = "none";
    if (agendaTimelineContainer) agendaTimelineContainer.style.display = "flex";
    if (agendaEmptyState) agendaEmptyState.style.display = "none";
    
    renderizarAgenda();
    atualizarKpis();

    // O CS acompanha a mesma unidade da agenda (sem recarga forçada: a unidade não mudou aqui).
    carregarSucessoCliente();
  } else if (msg.action === "BELLE_DATE_SELECTED" && msg.data) {
    if (msg.data !== state.currentDataAgenda) {
      state.currentDataAgenda = msg.data;
      console.log(`[BelleCopilot] 📅 Data alterada no Belle para: ${state.currentDataAgenda}`);
      if (loadingAgenda) loadingAgenda.style.display = "flex";
      buscarAgendaApi(state.currentToken, state.currentDataAgenda, arrGridDaUnidade(state.currentCodEstab), state.currentCodEstab).then(rawAgenda => {
        if (Array.isArray(rawAgenda)) {
          state.appointmentsData = processarItensAgenda(rawAgenda);
          sincronizarSalasComAgendamentos(state.appointmentsData);
          if (loadingAgenda) loadingAgenda.style.display = "none";
          if (agendaTimelineContainer) agendaTimelineContainer.style.display = "flex";
          if (agendaEmptyState) agendaEmptyState.style.display = "none";
          renderizarAgenda();
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
      // `msg.codEstab` (etb da query) e `cod_clinica` são "1" em todas as filiais: a unidade
      // continua sendo a da aba do Belle, já validada na entrada do listener.
      definirArrGrid(montarArrGridDeGridSala(msg.data, state.currentCodEstab), state.currentCodEstab);
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
        idGeinfo: msg.data.id_geinfo || msg.data.idGeinfo || state.currentIdGeinfo || "",
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
    // Só aceita token cuja aba de origem está na MESMA unidade do painel (msg.codEstab vem
    // da URL /u/{unidade}, não do etb). Sem isso, uma segunda aba do Belle em outra filial
    // trocava o token do painel e a agenda/CS passavam a responder pela unidade errada.
    if (msg.codEstab && String(msg.codEstab) !== String(state.currentCodEstab)) {
      console.warn(`[BelleCopilot] 🚫 Token da unidade #${msg.codEstab} ignorado (painel está na #${state.currentCodEstab}).`);
      return;
    }
    if (msg.token !== state.currentToken) {
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
