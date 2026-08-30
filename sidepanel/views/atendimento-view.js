/**
 * BELLE COPILOT - VIEW DE ATENDIMENTO CLÍNICO (APLICADORA / LASER)
 * Gerencia a ficha clínica da cliente, histórico de parâmetros, formulários com steppers e fluxo de finalização.
 */

import { state, limparCachesAtendimento } from '../core/state.js';
import { 
  buscarGetServicosApi, 
  buscarParametrosLaserApi, 
  buscarSaldoVendaPlanoApi, 
  salvarParametrosLaserEmLoteApi, 
  finalizarAtendimentoApi 
} from '../core/api-client.js';
import { atualizarOfertasSugeridasAtendimento } from '../engines/cadencia-ofertas.js';
import { 
  extrairParametrosAnterioresDaArea, 
  coletarParametrosDosFormularios, 
  verificarEvolucaoParametros 
} from '../engines/laser-safety.js';
import { abrirModalTravaEvolucao } from '../components/modal-trava.js';
import { abrirModalProximoAgendamento } from '../components/modal-proximo.js';

const atendimentoPlaceholder = document.getElementById("atendimento-placeholder");
const atendimentoContent = document.getElementById("atendimento-content");
const atendHorario = document.getElementById("atend-horario");
const atendStatusBadge = document.getElementById("atend-status-badge");
const atendNomeCliente = document.getElementById("atend-nome-cliente");
const atendCodPaciente = document.getElementById("atend-cod-paciente");
const atendCpf = document.getElementById("atend-cpf");
const atendTelefone = document.getElementById("atend-telefone");
const atendSala = document.getElementById("atend-sala");
const atendProfissional = document.getElementById("atend-profissional");
const atendCodConsulta = document.getElementById("atend-cod-consulta");
const atendTagsBox = document.getElementById("atend-tags-box");
const atendCardPacote = document.getElementById("atend-card-pacote");
const atendMultiAppBox = document.getElementById("atend-multi-app-box");
const atendMultiQtd = document.getElementById("atend-multi-qtd");
const atendMultiButtons = document.getElementById("atend-multi-buttons");
const atendNomePlano = document.getElementById("atend-nome-plano");
const atendCodOrcamento = document.getElementById("atend-cod-orcamento");
const atendQtdServicos = document.getElementById("atend-qtd-servicos");
const atendListaServicos = document.getElementById("atend-lista-servicos");
const atendCardParametros = document.getElementById("atend-card-parametros");
const atendLaserDataBadge = document.getElementById("atend-laser-data-badge");
const loadingLaserParams = document.getElementById("loading-laser-params");
const atendListaLaserParams = document.getElementById("atend-lista-laser-params");
const atendQtdAreasRegistro = document.getElementById("atend-qtd-areas-registro");
const atendListaFormsLaser = document.getElementById("atend-lista-forms-laser");
const btnSalvarParametrosLaser = document.getElementById("btn-salvar-parametros-laser");
const atendStatusSalvarLaser = document.getElementById("atend-status-salvar-laser");
const btnAtendFinalizar = document.getElementById("btn-atend-finalizar");
const btnAtendVoltar = document.getElementById("btn-atend-voltar");

let callbackAtivarAba = null;
let callbackRecarregarAgenda = null;

function formatarDataPtBr(dataIso) {
  if (!dataIso) return "";
  const parts = dataIso.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dataIso;
}

export function renderizarMultiplosAgendamentosHoje(appAtual) {
  if (!atendMultiAppBox || !atendMultiButtons) return;

  const codCli = appAtual.codCliente;
  const nomeCli = (appAtual.clienteNome || "").toLowerCase().trim();

  const agendamentosMesmoCliente = (state.appointmentsData || []).filter(a => {
    if (a.isBloqueado || a.status === "bloqueado") return false;
    if (codCli && a.codCliente) {
      return String(a.codCliente) === String(codCli);
    }
    if (nomeCli && a.clienteNome) {
      return a.clienteNome.toLowerCase().trim() === nomeCli;
    }
    return false;
  });

  if (agendamentosMesmoCliente.length <= 1) {
    atendMultiAppBox.style.display = "none";
    return;
  }

  agendamentosMesmoCliente.sort((a, b) => a.horario.localeCompare(b.horario));
  atendMultiAppBox.style.display = "block";
  if (atendMultiQtd) atendMultiQtd.textContent = agendamentosMesmoCliente.length;

  let btnsHtml = "";
  agendamentosMesmoCliente.forEach(a => {
    const isCurrent = String(a.id) === String(appAtual.id) || String(a.codConsulta) === String(appAtual.codConsulta);
    const procs = (a.arrServ && a.arrServ.length > 0) ? a.arrServ.map(s => s.nome).join(", ") : (a.procedimento || "Laser");
    const activeClass = isCurrent ? "active" : "";

    btnsHtml += `
      <button class="multi-app-btn ${activeClass}" data-id="${a.id}" data-consulta="${a.codConsulta}">
        <span class="multi-app-time">⏰ ${a.horario}</span>
        <span class="multi-app-proc" title="${procs}">✨ ${procs}</span>
        <span class="app-badge ${isCurrent ? 'badge-atendimento' : 'badge-confirmado'}">${isCurrent ? 'Em Tela' : a.statusFormatado || a.status}</span>
      </button>
    `;
  });

  atendMultiButtons.innerHTML = btnsHtml;

  atendMultiButtons.querySelectorAll(".multi-app-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-id");
      const targetCons = btn.getAttribute("data-consulta");
      const targetApp = state.appointmentsData.find(x => String(x.id) === String(targetId) || String(x.codConsulta) === String(targetCons));
      if (targetApp) {
        abrirAtendimento(targetApp);
      }
    });
  });
}

export function renderizarServicosComSaldo(servicosSaldo) {
  if (!atendListaServicos) return;

  if (!Array.isArray(servicosSaldo) || servicosSaldo.length === 0) {
    return;
  }

  state.lastSaldoServicosCache = servicosSaldo;
  if (atendQtdServicos) atendQtdServicos.textContent = `${servicosSaldo.length} área${servicosSaldo.length === 1 ? '' : 's'}`;

  let html = "";
  servicosSaldo.forEach(s => {
    const nome = s.servico || s.nome || s.nom_servico || "Área a Laser";
    const realizadas = parseInt(s.gasto || s.realizadas || s.qtd_executada || 0, 10);
    const contratadas = parseInt(s.quantidade || s.contratadas || s.qtd_contratada || 10, 10);
    const saldo = parseInt(s.saldo_atual || s.saldo || (contratadas - realizadas), 10);
    const cod = s.codServ || s.cod_servico || s.id || "";
    const pct = Math.min(100, Math.round((realizadas / Math.max(1, contratadas)) * 100));

    html += `
      <div class="atend-service-card">
        <div class="atend-service-header">
          <span class="atend-service-name">✨ ${nome}</span>
          <span class="atend-service-progress">📊 Sessão ${realizadas}/${contratadas}</span>
        </div>
        <div class="atend-session-bar-wrap">
          <div class="atend-session-bar-fill" style="width: ${pct}%;"></div>
        </div>
        <div class="atend-service-footer">
          <span class="atend-service-code">🏷️ ${cod ? `Cód: ${cod}` : ''}</span>
          <span class="atend-service-saldo">Restam: <strong>${saldo} sessões</strong></span>
        </div>
      </div>
    `;
  });

  atendListaServicos.innerHTML = html;

  // Atualiza também os formulários de registro por área com as áreas do plano
  renderizarFormulariosParametrosLaser(servicosSaldo, state.ultimosRegistrosLaserCliente);

  if (state.selectedAppointment) {
    atualizarOfertasSugeridasAtendimento(state.selectedAppointment, servicosSaldo, state.ultimosRegistrosLaserCliente);
  }
}

export function renderizarParametrosLaser(registros) {
  if (!atendListaLaserParams) return;
  if (loadingLaserParams) loadingLaserParams.style.display = "none";

  state.ultimosRegistrosLaserCliente = Array.isArray(registros) ? registros : [];

  if (!Array.isArray(registros) || registros.length === 0) {
    if (atendLaserDataBadge) atendLaserDataBadge.textContent = "Sem registros";
    atendListaLaserParams.innerHTML = '<div style="font-size: 11px; color: #64748b; padding: 6px;">Nenhum parâmetro de laser anterior registrado para esta cliente.</div>';
    renderizarFormulariosParametrosLaser(state.currentListaServicosRegistro, []);
    return;
  }

  const primeiraDataHora = registros[0].data_hora;
  const diaRecente = primeiraDataHora ? primeiraDataHora.split(" ")[0] : "";
  const registrosUltimoDia = diaRecente ? registros.filter(r => r.data_hora && r.data_hora.startsWith(diaRecente)) : [registros[0]];

  if (atendLaserDataBadge && diaRecente) {
    atendLaserDataBadge.textContent = `Última Sessão: ${formatarDataPtBr(diaRecente)}`;
  }

  let cardsHtml = "";
  registrosUltimoDia.forEach(r => {
    const hora = r.data_hora ? r.data_hora.split(" ")[1]?.substring(0, 5) : "";
    let tagsHtml = "";
    if (r.fototipo) tagsHtml += `<span class="laser-tag laser-tag-fototipo">Fototipo: ${r.fototipo}</span>`;
    if (r.modo_aplicacao) tagsHtml += `<span class="laser-tag laser-tag-modo">Modo: ${r.modo_aplicacao}</span>`;
    if (r.energia) tagsHtml += `<span class="laser-tag">Energia: ${r.energia}</span>`;
    if (r.frequencia) tagsHtml += `<span class="laser-tag">Freq: ${r.frequencia}</span>`;
    if (r.largura_pulso) tagsHtml += `<span class="laser-tag">Pulso: ${r.largura_pulso}</span>`;
    if (r.qtd_disparos) tagsHtml += `<span class="laser-tag">Disparos: ${r.qtd_disparos}</span>`;

    cardsHtml += `
      <div class="atend-laser-card">
        <div class="atend-laser-header">
          <span class="atend-laser-area">⚡ ${r.area || 'Área Geral'}</span>
          ${hora ? `<span class="atend-laser-time">⏰ ${hora}</span>` : ''}
        </div>
        ${r.profissional ? `<div class="atend-laser-prof">👩‍⚕️ Aplicado por: <strong>${r.profissional}</strong></div>` : ''}
        ${tagsHtml ? `<div class="atend-laser-tags">${tagsHtml}</div>` : ''}
        ${r.observacao ? `<div class="atend-laser-obs">${r.observacao}</div>` : '<div style="font-size:11px; color:#94a3b8; font-style:italic;">Sem observações adicionais.</div>'}
      </div>
    `;
  });

  atendListaLaserParams.innerHTML = cardsHtml;
  renderizarFormulariosParametrosLaser(state.currentListaServicosRegistro, state.ultimosRegistrosLaserCliente);

  if (state.selectedAppointment) {
    atualizarOfertasSugeridasAtendimento(state.selectedAppointment, state.lastSaldoServicosCache, state.ultimosRegistrosLaserCliente);
  }
}

export function renderizarFormulariosParametrosLaser(listaServicos, historicoRegistros = []) {
  if (!atendListaFormsLaser) return;
  
  if (Array.isArray(listaServicos) && listaServicos.length > 0) {
    state.currentListaServicosRegistro = [...listaServicos];
  } else if (state.selectedAppointment?.arrServ && state.selectedAppointment.arrServ.length > 0) {
    state.currentListaServicosRegistro = [...state.selectedAppointment.arrServ];
  } else if (state.selectedAppointment?.procedimento) {
    state.currentListaServicosRegistro = [{
      nome: state.selectedAppointment.procedimento,
      cod_servico: state.selectedAppointment.codTipo || ""
    }];
  }

  const historico = (Array.isArray(historicoRegistros) && historicoRegistros.length > 0) 
    ? historicoRegistros 
    : state.ultimosRegistrosLaserCliente;

  if (atendQtdAreasRegistro) {
    atendQtdAreasRegistro.textContent = `${state.currentListaServicosRegistro.length} área${state.currentListaServicosRegistro.length === 1 ? '' : 's'}`;
  }

  if (state.currentListaServicosRegistro.length === 0) {
    atendListaFormsLaser.innerHTML = '<div style="font-size: 11px; color: #64748b; padding: 6px;">Nenhuma área encontrada para registrar parâmetros.</div>';
    return;
  }

  let formsHtml = "";
  state.currentListaServicosRegistro.forEach((s, idx) => {
    const sCod = s.codServ || s.cod_servico || (55556400 + idx);
    const sNome = s.nome || `Área #${idx + 1}`;
    const areaFormatada = `${sCod} - ${sNome}`;

    const prev = extrairParametrosAnterioresDaArea(sNome, historico);

    const energiaNum = parseFloat(prev.energia) || 25;
    const freqNum = parseFloat(String(prev.frequencia || "0.8").replace(",", ".")) || 0.8;
    const disparosNum = parseInt(prev.disparos, 10) || 200;

    formsHtml += `
      <div class="atend-param-form-card" 
           data-idx="${idx}"
           data-cod-serv="${sCod}" 
           data-area-nome="${sNome}"
           data-area-formatada="${areaFormatada}"
           data-orig-fototipo="${prev.fototipo}"
           data-orig-modo="${prev.modo}"
           data-orig-energia="${energiaNum}"
           data-orig-frequencia="${freqNum}"
           data-orig-disparos="${disparosNum}"
           data-orig-obs="">
        
        <div class="param-form-header">
          <span class="param-form-title" title="${areaFormatada}">✨ ${areaFormatada}</span>
          <span class="param-form-tag">Área ${idx + 1} de ${state.currentListaServicosRegistro.length}</span>
        </div>

        <div class="param-fields-grid">
          <div class="param-field">
            <label>Fototipo:</label>
            <select class="param-input param-fototipo">
              <option value="I" ${prev.fototipo === 'I' ? 'selected' : ''}>I</option>
              <option value="II" ${prev.fototipo === 'II' ? 'selected' : ''}>II</option>
              <option value="III" ${prev.fototipo === 'III' ? 'selected' : ''}>III</option>
              <option value="IV" ${prev.fototipo === 'IV' || !prev.fototipo ? 'selected' : ''}>IV</option>
              <option value="V" ${prev.fototipo === 'V' ? 'selected' : ''}>V</option>
              <option value="VI" ${prev.fototipo === 'VI' ? 'selected' : ''}>VI</option>
            </select>
          </div>

          <div class="param-field">
            <label>Modo:</label>
            <select class="param-input param-modo">
              <option value="HR" ${prev.modo === 'HR' || !prev.modo ? 'selected' : ''}>HR</option>
              <option value="SHR" ${prev.modo === 'SHR' ? 'selected' : ''}>SHR</option>
              <option value="STAMP" ${prev.modo === 'STAMP' ? 'selected' : ''}>STAMP</option>
            </select>
          </div>

          <div class="param-field">
            <label>Energia (J):</label>
            <div class="param-stepper-wrap">
              <button type="button" class="btn-param-step" data-delta="-1">−</button>
              <input type="number" step="1" min="0" max="100" class="param-input param-energia" value="${energiaNum}">
              <button type="button" class="btn-param-step" data-delta="1">+</button>
            </div>
          </div>

          <div class="param-field">
            <label>Frequência:</label>
            <div class="param-stepper-wrap">
              <button type="button" class="btn-param-step" data-delta="-0.1">−</button>
              <input type="number" step="0.1" min="0.1" max="10.0" class="param-input param-frequencia" value="${freqNum}">
              <button type="button" class="btn-param-step" data-delta="0.1">+</button>
            </div>
          </div>

          <div class="param-field">
            <label>Qtd Disparos:</label>
            <div class="param-stepper-wrap">
              <button type="button" class="btn-param-step" data-delta="-50">−</button>
              <input type="number" step="50" min="0" max="5000" class="param-input param-disparos" value="${disparosNum}">
              <button type="button" class="btn-param-step" data-delta="50">+</button>
            </div>
          </div>
        </div>

        <div class="param-field" style="margin-top: 8px;">
          <label style="display: flex; justify-content: space-between; align-items: center;">
            <span>Observação Clínica da Área:</span>
            <span style="font-weight: normal; font-size: 10px; color: #8b5cf6;">💡 Opções rápidas</span>
          </label>
          <div class="param-obs-pills-row">
            <span class="obs-pill" data-text="Boa tolerância">👍 Boa tolerância</span>
            <span class="obs-pill" data-text="Pele íntegra">✨ Pele íntegra</span>
            <span class="obs-pill" data-text="Sensibilidade leve">⚡ Sensibilidade leve</span>
            <span class="obs-pill" data-text="Hiperemia leve">🔴 Hiperemia leve</span>
            <span class="obs-pill" data-text="Pelos finos">🔍 Pelos finos</span>
            <span class="obs-pill" data-text="Pelos grossos">💥 Pelos grossos</span>
            <span class="obs-pill" data-text="Sem intercorrências">✅ Sem intercorrências</span>
          </div>
          <input type="text" class="param-input param-obs" placeholder="ex: ${sNome.split(' - ')[0]} ${energiaNum}J • Boa tolerância" value="">
        </div>
      </div>
    `;
  });

  atendListaFormsLaser.innerHTML = formsHtml;
}

export async function salvarParametrosLaserDireto(parametros) {
  if (!btnSalvarParametrosLaser) return;

  btnSalvarParametrosLaser.disabled = true;
  btnSalvarParametrosLaser.textContent = "⏳ Gravando no Belle...";

  if (atendStatusSalvarLaser) {
    atendStatusSalvarLaser.style.display = "block";
    atendStatusSalvarLaser.className = "param-save-status status-saving";
    atendStatusSalvarLaser.textContent = "Salvando parâmetros na ficha da cliente...";
  }

  const res = await salvarParametrosLaserEmLoteApi(parametros);

  if (res.success) {
    btnSalvarParametrosLaser.textContent = "✅ Parâmetros Salvos!";
    btnSalvarParametrosLaser.style.background = "#16a34a";
    if (atendStatusSalvarLaser) {
      atendStatusSalvarLaser.className = "param-save-status status-success";
      atendStatusSalvarLaser.textContent = `Sucesso: ${res.salvos} parâmetro(s) registrado(s) com sucesso no prontuário!`;
    }

    if (state.selectedAppointment?.codCliente) {
      buscarParametrosLaserApi(state.currentToken, state.selectedAppointment.codCliente, state.currentCodEstab)
        .then(registros => renderizarParametrosLaser(registros))
        .catch(() => {});
    }

    setTimeout(() => {
      btnSalvarParametrosLaser.disabled = false;
      btnSalvarParametrosLaser.textContent = "💾 Salvar Parâmetros (Todas as Áreas)";
      btnSalvarParametrosLaser.style.background = "";
      if (atendStatusSalvarLaser) atendStatusSalvarLaser.style.display = "none";
    }, 4000);
  } else {
    btnSalvarParametrosLaser.disabled = false;
    btnSalvarParametrosLaser.textContent = "💾 Salvar Parâmetros (Todas as Áreas)";
    if (atendStatusSalvarLaser) {
      atendStatusSalvarLaser.className = "param-save-status status-error";
      atendStatusSalvarLaser.textContent = `Erro ao salvar: ${res.error || 'Falha na requisição'}. Tente novamente.`;
    }
  }
}

export async function executarFluxoFinalizacaoAtendimento(app) {
  if (!app) return;

  const parametrosParaSalvar = coletarParametrosDosFormularios();
  const { possuiSemEvolucao, areasSemEvolucao } = verificarEvolucaoParametros(parametrosParaSalvar);

  const executarSalvarEFinalizar = async () => {
    if (parametrosParaSalvar.length > 0) {
      await salvarParametrosLaserDireto(parametrosParaSalvar);
    }

    if (btnAtendFinalizar) {
      btnAtendFinalizar.disabled = true;
      btnAtendFinalizar.textContent = "⏳ Concluindo...";
    }

    const codConsulta = app.codConsulta || app.id;
    const sucesso = await finalizarAtendimentoApi(state.currentToken, codConsulta, state.currentCodEstab);

    if (btnAtendFinalizar) {
      btnAtendFinalizar.disabled = false;
      btnAtendFinalizar.textContent = "✅ Finalizar Atendimento";
    }

    if (sucesso) {
      app.status = "finalizado";
      app.statusFormatado = "Atendido";
      if (atendStatusBadge) {
        atendStatusBadge.className = "app-badge badge-finalizado";
        atendStatusBadge.textContent = "Atendido";
      }

      const codCli = app.codCliente;
      const nomeCli = (app.clienteNome || "").toLowerCase().trim();
      const horaAtual = app.horario || "00:00";

      const proximoAgendamentoHoje = (state.appointmentsData || []).find(a => {
        if (String(a.id) === String(app.id) || String(a.codConsulta) === String(app.codConsulta)) return false;
        if (a.isBloqueado || a.status === "bloqueado" || a.status === "finalizado") return false;

        const mesmoCliente = (codCli && a.codCliente && String(a.codCliente) === String(codCli)) ||
                             (nomeCli && a.clienteNome && a.clienteNome.toLowerCase().trim() === nomeCli);
        if (!mesmoCliente) return false;

        return a.horario >= horaAtual;
      });

      if (proximoAgendamentoHoje) {
        abrirModalProximoAgendamento(app.clienteNome, proximoAgendamentoHoje, (prox) => {
          abrirAtendimento(prox);
        });
      } else {
        // Encontra a próxima cliente da fila (preferência: status "aguardando", ou próximo agendamento do dia)
        const proximaClienteFila = (state.appointmentsData || []).find(a => {
          if (String(a.id) === String(app.id) || String(a.codConsulta) === String(app.codConsulta)) return false;
          if (a.isBloqueado || a.status === "bloqueado" || a.status === "finalizado" || a.status === "falta") return false;
          
          const mesmoCli = (codCli && a.codCliente && String(a.codCliente) === String(codCli)) ||
                           (nomeCli && a.clienteNome && a.clienteNome.toLowerCase().trim() === nomeCli);
          if (mesmoCli) return false;

          return a.status === "aguardando";
        }) || (state.appointmentsData || []).find(a => {
          if (String(a.id) === String(app.id) || String(a.codConsulta) === String(app.codConsulta)) return false;
          if (a.isBloqueado || a.status === "bloqueado" || a.status === "finalizado" || a.status === "falta") return false;
          
          const mesmoCli = (codCli && a.codCliente && String(a.codCliente) === String(codCli)) ||
                           (nomeCli && a.clienteNome && a.clienteNome.toLowerCase().trim() === nomeCli);
          if (mesmoCli) return false;

          return a.horario >= horaAtual;
        });

        if (proximaClienteFila) {
          abrirAtendimento(proximaClienteFila);
        } else {
          if (typeof callbackAtivarAba === "function") callbackAtivarAba("tab-agenda");
        }
        if (typeof callbackRecarregarAgenda === "function") callbackRecarregarAgenda();
      }
    } else {
      alert("Não foi possível finalizar o agendamento no Belle. Verifique a conexão.");
    }
  };

  if (possuiSemEvolucao) {
    abrirModalTravaEvolucao(areasSemEvolucao, () => {
      executarSalvarEFinalizar();
    });
  } else {
    executarSalvarEFinalizar();
  }
}

export function renderizarProximaClienteAguardando(currentApp) {
  const cardProxima = document.getElementById("card-proxima-aguardando");
  const infoProxima = document.getElementById("proxima-aguardando-info");
  if (!cardProxima || !infoProxima) return;

  const currentId = currentApp?.id || currentApp?.codConsulta;
  const currentCli = currentApp?.codCliente;
  const currentNome = (currentApp?.clienteNome || "").toLowerCase().trim();

  // 1. Procura a próxima cliente que está com status "aguardando"
  const proximaAguardando = (state.appointmentsData || []).find(a => {
    if (String(a.id) === String(currentId) || String(a.codConsulta) === String(currentId)) return false;
    if (a.isBloqueado || a.status === "bloqueado" || a.status === "finalizado" || a.status === "falta") return false;

    const mesmoCliente = (currentCli && a.codCliente && String(a.codCliente) === String(currentCli)) ||
                         (currentNome && a.clienteNome && a.clienteNome.toLowerCase().trim() === currentNome);
    if (mesmoCliente) return false;

    return a.status === "aguardando";
  });

  if (proximaAguardando) {
    const procs = (proximaAguardando.arrServ && proximaAguardando.arrServ.length > 0)
      ? proximaAguardando.arrServ.map(s => s.nome).join(", ")
      : (proximaAguardando.procedimento || "Depilação a Laser");

    cardProxima.style.display = "block";
    infoProxima.innerHTML = `
      <div class="proxima-aguardando-content">
        <div class="proxima-aguardando-detalhes">
          <strong class="proxima-nome">👤 ${proximaAguardando.clienteNome}</strong>
          <span class="proxima-meta">⏰ ${proximaAguardando.horario} • 📍 ${proximaAguardando.salaNome}</span>
          <span style="font-size: 11px; color: #7c2d12; margin-top: 2px; line-height: 1.2;">✨ ${procs}</span>
        </div>
        <button class="btn-chamar-proxima" id="btn-chamar-proxima-aguardando" data-id="${proximaAguardando.id}">
          🔔 Chamar
        </button>
      </div>
    `;

    const btnChamar = document.getElementById("btn-chamar-proxima-aguardando");
    btnChamar?.addEventListener("click", () => {
      abrirAtendimento(proximaAguardando);
    });
  } else {
    cardProxima.style.display = "none";
  }
}

export async function abrirAtendimento(app, servicosExtras = null, { onAtivarAba, onRecarregarAgenda } = {}) {
  if (!app) return;
  if (onAtivarAba) callbackAtivarAba = onAtivarAba;
  if (onRecarregarAgenda) callbackRecarregarAgenda = onRecarregarAgenda;

  state.selectedAppointment = app;

  if (atendimentoPlaceholder) atendimentoPlaceholder.style.display = "none";
  if (atendimentoContent) atendimentoContent.style.display = "flex";

  if (atendHorario) atendHorario.textContent = `⏰ ${app.horario || '00:00'} - ${app.hrFim || '00:00'} (${app.duracaoMin || 0}m)`;
  
  if (atendStatusBadge) {
    let badgeClass = "badge-agendado";
    let statusLabel = app.statusFormatado || app.status;
    if (app.status === "aguardando") { badgeClass = "badge-aguardando"; statusLabel = "Aguardando"; }
    else if (app.status === "confirmado") { badgeClass = "badge-confirmado"; statusLabel = "Confirmado"; }
    else if (app.status === "agendado") { badgeClass = "badge-agendado"; statusLabel = "Marcado"; }
    else if (app.status === "atendimento") { badgeClass = "badge-atendimento"; statusLabel = "Em Andamento"; }
    else if (app.status === "finalizado") { badgeClass = "badge-finalizado"; statusLabel = "Atendido"; }
    else if (app.status === "falta") { badgeClass = "badge-falta"; statusLabel = "Falhou"; }
    else if (app.status === "bloqueado") { badgeClass = "badge-bloqueado"; statusLabel = "Bloqueado"; }

    atendStatusBadge.className = `app-badge ${badgeClass}`;
    atendStatusBadge.textContent = statusLabel;
  }

  renderizarProximaClienteAguardando(app);

  if (atendNomeCliente) atendNomeCliente.textContent = app.clienteNome || "Cliente";
  if (atendCodPaciente) atendCodPaciente.textContent = app.codCliente ? `#${app.codCliente}` : "N/A";
  if (atendCpf) atendCpf.textContent = app.cpf || "Não informado";
  if (atendTelefone) atendTelefone.textContent = app.telefone || "Não informado";
  if (atendSala) atendSala.textContent = app.salaNome || app.sala || "Geral";
  if (atendProfissional) atendProfissional.textContent = app.profissional || "Não informada";
  if (atendCodConsulta) atendCodConsulta.textContent = app.codConsulta ? `#${app.codConsulta}` : (app.id ? `#${app.id}` : "N/A");

  if (atendTagsBox) {
    let tagsHtml = "";
    if (app.questPendente) tagsHtml += `<span class="tag-alert-quest">⚠️ Questionário Pendente</span>`;
    if (app.fazAniver) tagsHtml += `<span class="tag-alert-aniver">🎂 Aniversariante</span>`;
    if (app.tagsCliente) {
      const clientTags = app.tagsCliente.split(",").map(t => t.trim()).filter(Boolean);
      clientTags.forEach(tag => {
        tagsHtml += `<span class="tag-alert-client">🏷️ ${tag}</span>`;
      });
    }

    if (tagsHtml) {
      atendTagsBox.innerHTML = tagsHtml;
      atendTagsBox.style.display = "flex";
    } else {
      atendTagsBox.style.display = "none";
    }
  }

  renderizarMultiplosAgendamentosHoje(app);

  // Pacote / Contrato
  if (atendNomePlano) atendNomePlano.textContent = app.nomePlano || app.procedimento || "Atendimento Avulso / Procedimento";
  if (atendCodOrcamento) {
    if (app.codOrcamento) {
      atendCodOrcamento.textContent = `Orçamento / Venda: #${app.codOrcamento}`;
      atendCodOrcamento.style.display = "inline-block";
    } else {
      atendCodOrcamento.style.display = "none";
    }
  }

  // Lista de Serviços & Áreas
  let listaServicos = (app.arrServ && app.arrServ.length > 0) ? [...app.arrServ] : [];

  if (listaServicos.length === 0 && !servicosExtras && app.codConsulta && state.currentToken) {
    try {
      servicosExtras = await buscarGetServicosApi(state.currentToken, app.codConsulta, state.currentCodEstab);
    } catch (e) {}
  }

  if (listaServicos.length === 0 && servicosExtras && servicosExtras.servicos) {
    const nomes = servicosExtras.servicos.split(",").map(s => s.trim()).filter(Boolean);
    nomes.forEach((nome, idx) => {
      listaServicos.push({
        nome: nome,
        cod_servico: idx === 0 && servicosExtras.cod_serv ? servicosExtras.cod_serv : ""
      });
    });
  }

  if (listaServicos.length === 0 && app.procedimento) {
    listaServicos.push({
      nome: app.procedimento,
      cod_servico: app.codTipo || ""
    });
  }

  if (atendQtdServicos) atendQtdServicos.textContent = `${listaServicos.length} área${listaServicos.length === 1 ? '' : 's'}`;

  // Mapeamento de progresso de lbServ (ex: "AXILAS (P) - depilação a laser - 15/40")
  const progressoMap = new Map();
  if (app.lbServ) {
    const linhas = app.lbServ.split("<br>").map(l => l.trim()).filter(Boolean);
    linhas.forEach(l => {
      const match = l.match(/(.+?)\s*-\s*(\d+\/\d+)/);
      if (match) {
        progressoMap.set(match[1].trim().toLowerCase(), match[2]);
      }
    });
  }

  // 1. Renderização visual IMEDIATA das áreas com barras de sessões (0ms)
  let cardsHtml = "";
  listaServicos.forEach((s, idx) => {
    const sNome = s.nome || `Procedimento #${idx + 1}`;
    const sCod = s.cod_servico ? `Cód: ${s.cod_servico}` : `Área #${idx + 1}`;
    
    // Procura progresso de sessões no lbServ
    let progressoTxt = "";
    let sFeitas = 0;
    let sTotal = 0;
    let perc = 0;
    for (const [k, v] of progressoMap.entries()) {
      if (sNome.toLowerCase().includes(k) || k.includes(sNome.toLowerCase().substring(0, 8))) {
        progressoTxt = `📊 Sessão ${v}`;
        const parts = v.split("/");
        if (parts.length === 2) {
          sFeitas = Number(parts[0]) || 0;
          sTotal = Number(parts[1]) || 0;
          if (sTotal > 0) perc = Math.min(100, Math.round((sFeitas / sTotal) * 100));
        }
        break;
      }
    }

    cardsHtml += `
      <div class="atend-service-card">
        <div class="atend-service-header">
          <span class="atend-service-name">✨ ${sNome}</span>
          ${progressoTxt ? `<span class="atend-service-progress">${progressoTxt}</span>` : ''}
        </div>
        ${sTotal > 0 ? `
          <div class="atend-session-bar-wrap">
            <div class="atend-session-bar-fill" style="width: ${perc}%;"></div>
          </div>
        ` : ''}
        <div class="atend-service-footer">
          <span class="atend-service-code">🏷️ ${sCod}</span>
          ${sTotal > 0 ? `<span class="atend-service-saldo">Restam: <strong>${sTotal - sFeitas} sessões</strong></span>` : ''}
        </div>
      </div>
    `;
  });

  if (atendListaServicos) {
    atendListaServicos.innerHTML = cardsHtml || '<div style="font-size: 12px; color: #64748b; padding: 8px;">Nenhum procedimento discriminado.</div>';
  }

  // Renderiza imediatamente os formulários de registro por área
  renderizarFormulariosParametrosLaser(listaServicos, state.ultimosRegistrosLaserCliente);

  // Ativa a aba Atendimento imediatamente
  if (typeof callbackAtivarAba === "function") {
    callbackAtivarAba("tab-atendimento");
  }

  // 2. Busca o saldo exato e oficial de cada área via saldovendaplano usando cod_plano_paciente
  if (app.codOrcamento && state.currentToken) {
    buscarSaldoVendaPlanoApi(state.currentToken, app.codOrcamento, app.codPlano, app.idGeinfo, state.currentCodEstab)
      .then(resSaldo => {
        if (Array.isArray(resSaldo) && resSaldo.length > 0) {
          renderizarServicosComSaldo(resSaldo);
        }
      })
      .catch(() => {});
  }

  // 3. Busca parâmetros anteriores do prontuário do laser
  if (atendListaLaserParams) atendListaLaserParams.innerHTML = '<div style="font-size: 11px; color: #64748b; padding: 4px;">Consultando histórico no prontuário...</div>';
  if (loadingLaserParams) loadingLaserParams.style.display = "flex";
  if (atendLaserDataBadge) atendLaserDataBadge.textContent = "Buscando...";

  if (app.codCliente && state.currentToken) {
    buscarParametrosLaserApi(state.currentToken, app.codCliente, state.currentCodEstab)
      .then(registros => {
        renderizarParametrosLaser(registros);
      })
      .catch(() => {
        renderizarParametrosLaser([]);
      });
  } else {
    renderizarParametrosLaser([]);
  }
}

function renderizarServicosComSaldoFallback(app) {
  if (app.arrServ && app.arrServ.length > 0) {
    const arrSimulado = app.arrServ.map((s, idx) => ({
      servico: s.nome,
      nome: s.nome,
      realizadas: 1,
      contratadas: 10,
      saldo: 9,
      cod_servico: s.cod_servico || (55556400 + idx)
    }));
    renderizarServicosComSaldo(arrSimulado);
  } else {
    renderizarServicosComSaldo([{
      servico: app.procedimento || "Tratamento",
      nome: app.procedimento || "Tratamento",
      realizadas: 1,
      contratadas: 10,
      saldo: 9,
      cod_servico: 55556400
    }]);
  }
}

export function inicializarAtendimentoView({ onAtivarAba, onRecarregarAgenda } = {}) {
  callbackAtivarAba = onAtivarAba;
  callbackRecarregarAgenda = onRecarregarAgenda;

  atendListaFormsLaser?.addEventListener("click", (e) => {
    const stepBtn = e.target.closest(".btn-param-step");
    if (stepBtn) {
      e.preventDefault();
      const wrap = stepBtn.closest(".param-stepper-wrap");
      const input = wrap?.querySelector("input.param-input");
      if (input) {
        const delta = parseFloat(stepBtn.getAttribute("data-delta")) || 0;
        const min = input.hasAttribute("min") ? parseFloat(input.getAttribute("min")) : 0;
        const max = input.hasAttribute("max") ? parseFloat(input.getAttribute("max")) : 9999;
        let val = parseFloat(input.value) || 0;
        val = Math.min(max, Math.max(min, Number((val + delta).toFixed(1))));
        input.value = val;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return;
    }

    const pill = e.target.closest(".obs-pill");
    if (pill) {
      e.preventDefault();
      const card = pill.closest(".atend-param-form-card");
      const obsInput = card?.querySelector(".param-obs");
      const pillText = pill.getAttribute("data-text");
      if (obsInput && pillText) {
        let currentText = obsInput.value.trim();
        if (currentText.includes(pillText)) {
          currentText = currentText.replace(new RegExp(`\\s*(?:•\\s*)?${pillText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'), '').trim();
          currentText = currentText.replace(/^•\s*/, '').replace(/•\s*•/, '•').trim();
          pill.classList.remove("active");
        } else {
          if (currentText.length > 0) {
            currentText += ` • ${pillText}`;
          } else {
            currentText = pillText;
          }
          pill.classList.add("active");
        }
        obsInput.value = currentText;
        obsInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
  });

  btnSalvarParametrosLaser?.addEventListener("click", () => {
    const parametros = coletarParametrosDosFormularios();
    if (parametros.length === 0) {
      alert("Nenhum formulário de parâmetro preenchido para salvar.");
      return;
    }

    const { possuiSemEvolucao, areasSemEvolucao } = verificarEvolucaoParametros(parametros);
    if (possuiSemEvolucao) {
      abrirModalTravaEvolucao(areasSemEvolucao, () => {
        salvarParametrosLaserDireto(parametros);
      });
    } else {
      salvarParametrosLaserDireto(parametros);
    }
  });

  btnAtendFinalizar?.addEventListener("click", () => {
    if (!state.selectedAppointment) return;
    executarFluxoFinalizacaoAtendimento(state.selectedAppointment);
  });

  btnAtendVoltar?.addEventListener("click", () => {
    if (typeof callbackAtivarAba === "function") callbackAtivarAba("tab-agenda");
  });
}
