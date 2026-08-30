/**
 * BELLE COPILOT - MODAL DE AGENDAMENTO DA PRÓXIMA SESSÃO (RECEPÇÃO / COMERCIAL)
 * Aplica as regras clínicas de intervalo entre procedimentos:
 * - Depilação para Depilação: +45 dias
 * - Clareamento para Clareamento: +45 dias
 * - Depilação para Clareamento: +25 dias
 * - Clareamento para Depilação: +25 dias
 * 
 * Formatação de Data em DD/MM/YYYY com dia da semana e consulta oficial de saldos.
 */

import { state } from '../core/state.js';
import { buscarSaldoVendaPlanoApi } from '../core/api-client.js';

const modalAgendarProxima = document.getElementById("modal-agendar-proxima");
const modalAgendaNomeCliente = document.getElementById("modal-agenda-nome-cliente");
const modalAgendaInfoPaciente = document.getElementById("modal-agenda-info-paciente");
const modalAgendaContextoHoje = document.getElementById("modal-agenda-contexto-hoje");
const modalAgendaBadgeRegra = document.getElementById("modal-agenda-badge-regra");
const modalAgendaTipoProximoBadge = document.getElementById("modal-agenda-tipo-proximo-badge");
const modalAgendaLblData = document.getElementById("modal-agenda-lbl-data");
const modalAgendaDataBrDisplay = document.getElementById("modal-agenda-data-br-display");
const modalAgendaListaServicos = document.getElementById("modal-agenda-lista-servicos");
const modalAgendaInputData = document.getElementById("modal-agenda-input-data");
const modalAgendaInputHora = document.getElementById("modal-agenda-input-hora");
const modalAgendaSelectSala = document.getElementById("modal-agenda-select-sala");
const btnCancelarAgendarProxima = document.getElementById("btn-cancelar-agendar-proxima");
const btnConfirmarAgendarProxima = document.getElementById("btn-confirmar-agendar-proxima");

let callbackSalvar = null;
let currentAppAgendamento = null;
let tipoProcedimentoAtual = "depilacao"; // "depilacao" ou "clareamento"

const DIAS_SEMANA = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado"
];

/**
 * Identifica se um texto / serviço refere-se a Clareamento ou Depilação a Laser
 */
export function identificarTipoProcedimento(texto = "") {
  if (!texto) return "depilacao";
  const t = texto.toLowerCase();
  if (
    t.includes("claream") || 
    t.includes("clareador") || 
    t.includes("peeling") || 
    t.includes("black peel") || 
    t.includes("melasma") ||
    t.includes("manchas")
  ) {
    return "clareamento";
  }
  return "depilacao";
}

/**
 * Calcula o intervalo clínico exato em dias
 */
export function calcularIntervaloClinico(tipoOrigem, tipoDestino) {
  if (tipoOrigem === "depilacao" && tipoDestino === "depilacao") return 45;
  if (tipoOrigem === "clareamento" && tipoDestino === "clareamento") return 45;
  if (tipoOrigem === "depilacao" && tipoDestino === "clareamento") return 25;
  if (tipoOrigem === "clareamento" && tipoDestino === "depilacao") return 25;
  return 45;
}

/**
 * Obtém a data base de hoje para o cálculo
 */
function obterDataBaseAgendamento(app) {
  let dataBase = new Date();
  
  if (state.currentDataAgenda && /^\d{4}-\d{2}-\d{2}$/.test(state.currentDataAgenda)) {
    const [y, m, d] = state.currentDataAgenda.split("-").map(Number);
    dataBase = new Date(y, m - 1, d);
  } else if (state.currentDataAgenda && /^\d{2}\/\d{2}\/\d{4}$/.test(state.currentDataAgenda)) {
    const [d, m, y] = state.currentDataAgenda.split("/").map(Number);
    dataBase = new Date(y, m - 1, d);
  }

  return dataBase;
}

/**
 * Atualiza o texto DD/MM/YYYY e dia da semana na tela
 */
function atualizarTextoDataBr(dataObj) {
  if (!modalAgendaDataBrDisplay || !dataObj || isNaN(dataObj.getTime())) return;
  const dd = String(dataObj.getDate()).padStart(2, "0");
  const mm = String(dataObj.getMonth() + 1).padStart(2, "0");
  const yyyy = dataObj.getFullYear();
  const diaSemana = DIAS_SEMANA[dataObj.getDay()] || "";
  modalAgendaDataBrDisplay.textContent = `📅 ${dd}/${mm}/${yyyy} (${diaSemana})`;
}

/**
 * Recalcula e atualiza o banner de regra, intervalo e data sugerida no modal
 */
function atualizarRegraEDataSugerida() {
  if (!currentAppAgendamento) return;

  // 1. Identifica quais serviços estão selecionados
  const checkedServicos = [];
  modalAgendaListaServicos?.querySelectorAll("input[name='servico_agendar']:checked").forEach(chk => {
    checkedServicos.push(chk.value);
  });

  const textoDestino = checkedServicos.join(" ") || currentAppAgendamento.procedimento || "";
  const tipoDestino = identificarTipoProcedimento(textoDestino);

  // 2. Calcula intervalo em dias
  const diasIntervalo = calcularIntervaloClinico(tipoProcedimentoAtual, tipoDestino);

  // 3. Calcula nova data sugerida a partir da data base
  const dataBase = obterDataBaseAgendamento(currentAppAgendamento);
  const dataSugerida = new Date(dataBase.getTime());
  dataSugerida.setDate(dataSugerida.getDate() + diasIntervalo);

  const yyyy = dataSugerida.getFullYear();
  const mm = String(dataSugerida.getMonth() + 1).padStart(2, "0");
  const dd = String(dataSugerida.getDate()).padStart(2, "0");
  const dataFormatadaIso = `${yyyy}-${mm}-${dd}`;

  if (modalAgendaInputData) {
    modalAgendaInputData.value = dataFormatadaIso;
  }

  if (modalAgendaLblData) {
    modalAgendaLblData.textContent = `🗓️ Data Sugerida (+${diasIntervalo} dias):`;
  }

  atualizarTextoDataBr(dataSugerida);

  // 4. Atualiza badges e banners explicativos
  const nomeOrigem = (tipoProcedimentoAtual === "clareamento") ? "🧴 Clareamento" : "🪒 Depilação";
  const nomeDestino = (tipoDestino === "clareamento") ? "🧴 Clareamento" : "🪒 Depilação";

  if (modalAgendaTipoProximoBadge) {
    modalAgendaTipoProximoBadge.textContent = (tipoDestino === "clareamento") ? "🧴 Clareamento" : "🪒 Depilação";
    modalAgendaTipoProximoBadge.style.background = (tipoDestino === "clareamento") ? "#fef3c7" : "#e0f2fe";
    modalAgendaTipoProximoBadge.style.color = (tipoDestino === "clareamento") ? "#92400e" : "#0369a1";
  }

  if (modalAgendaBadgeRegra) {
    const isCruzado = (tipoProcedimentoAtual !== tipoDestino);
    modalAgendaBadgeRegra.style.background = isCruzado ? "#eff6ff" : "#f0fdf4";
    modalAgendaBadgeRegra.style.borderColor = isCruzado ? "#bfdbfe" : "#bbf7d0";
    modalAgendaBadgeRegra.style.borderLeftColor = isCruzado ? "#0284c7" : "#16a34a";
    modalAgendaBadgeRegra.style.color = isCruzado ? "#1e40af" : "#166534";
    modalAgendaBadgeRegra.innerHTML = `⏱️ Regra Clínica: ${nomeOrigem} ➔ ${nomeDestino} (<strong>+${diasIntervalo} dias</strong> de intervalo)`;
  }
}

/**
 * Renderiza a lista de serviços e saldos exatos das áreas
 */
function renderizarListaServicosSaldo(servicosComSaldo) {
  if (!modalAgendaListaServicos) return;

  if (!Array.isArray(servicosComSaldo) || servicosComSaldo.length === 0) {
    modalAgendaListaServicos.innerHTML = '<div style="font-size: 11px; color: #64748b; padding: 4px;">Nenhuma área encontrada no plano.</div>';
    return;
  }

  let itemsHtml = "";
  servicosComSaldo.forEach((s, idx) => {
    const sNome = s.servico || s.nome || s.nom_servico || `Área #${idx + 1}`;
    const sTipo = identificarTipoProcedimento(sNome);
    const iconTipo = (sTipo === "clareamento") ? "🧴" : "🪒";
    
    const realizadas = parseInt(s.gasto || s.realizadas || s.qtd_executada || 0, 10);
    const contratadas = parseInt(s.quantidade || s.contratadas || s.qtd_contratada || 10, 10);
    const saldoRestante = parseInt(s.saldo_atual || s.saldo || (contratadas - realizadas), 10);
    const proximaSessao = realizadas + 1;

    let sessaoTxt = "";
    if (contratadas > 0) {
      if (saldoRestante > 0) {
        sessaoTxt = `(Sessão ${proximaSessao}/${contratadas} • Restam ${saldoRestante} sessões)`;
      } else {
        sessaoTxt = `(Concluído ${realizadas}/${contratadas} • Saldo: 0)`;
      }
    }

    const isChecked = saldoRestante > 0 ? "checked" : "";
    const isDesabilitado = saldoRestante <= 0 ? "style='opacity: 0.6;'" : "";

    itemsHtml += `
      <label class="check-servico-item" ${isDesabilitado}>
        <input type="checkbox" name="servico_agendar" value="${sNome}" ${isChecked}>
        <span>${iconTipo} <strong>${sNome}</strong> ${sessaoTxt ? `<small style="color: #0284c7; font-weight: 700;">${sessaoTxt}</small>` : ''}</span>
      </label>
    `;
  });

  modalAgendaListaServicos.innerHTML = itemsHtml;

  // Listener para recalcular ao alternar seleção
  modalAgendaListaServicos.querySelectorAll("input[name='servico_agendar']").forEach(chk => {
    chk.addEventListener("change", () => {
      atualizarRegraEDataSugerida();
    });
  });

  atualizarRegraEDataSugerida();
}

export async function abrirModalAgendarProxima(app, onSalvar) {
  if (!modalAgendarProxima || !app) return;

  currentAppAgendamento = app;
  callbackSalvar = onSalvar;

  // 1. Identifica procedimento atual da sessão de hoje
  const textoOrigem = `${app.procedimento || ''} ${(app.arrServ || []).map(s => s.nome).join(' ')} ${app.lbServ || ''}`;
  tipoProcedimentoAtual = identificarTipoProcedimento(textoOrigem);

  const statusLabel = app.statusFormatado || app.status || "Atendido";
  const statusElegivel = (app.status === "aguardando" || app.status === "atendimento" || app.status === "finalizado");

  if (modalAgendaNomeCliente) {
    modalAgendaNomeCliente.textContent = `👤 ${app.clienteNome || "Cliente"}`;
  }

  if (modalAgendaInfoPaciente) {
    const pront = app.codCliente ? `#${app.codCliente}` : "N/A";
    const tel = app.telefone || "Não informado";
    modalAgendaInfoPaciente.textContent = `Prontuário: ${pront} • Celular: ${tel}`;
  }

  if (modalAgendaContextoHoje) {
    const nomeProcHoje = (tipoProcedimentoAtual === "clareamento") ? "🧴 Clareamento" : "🪒 Depilação a Laser";
    modalAgendaContextoHoje.innerHTML = `📍 Sessão de Hoje: <strong>${nomeProcHoje}</strong> <span style="font-weight: 800; color: ${statusElegivel ? '#16a34a' : '#64748b'};">• [Status: ${statusLabel}]</span>`;
  }

  // 2. Preenche horário padrão
  if (modalAgendaInputHora) {
    modalAgendaInputHora.value = app.horario || "09:00";
  }

  // 3. Preenche as opções de salas
  if (modalAgendaSelectSala) {
    modalAgendaSelectSala.innerHTML = "";
    const salas = state.currentSalas || [];
    if (salas.length > 0) {
      salas.forEach(sala => {
        const opt = document.createElement("option");
        opt.value = sala.id || sala.id_recurso || sala.cod_sala || sala.nome;
        opt.textContent = `📍 ${sala.nome || sala.title}`;
        if (sala.nome === app.salaNome) opt.selected = true;
        modalAgendaSelectSala.appendChild(opt);
      });
    } else {
      const opt = document.createElement("option");
      opt.value = app.codSala || "1";
      opt.textContent = `📍 ${app.salaNome || 'SALA DEPILAÇÃO A LASER'}`;
      modalAgendaSelectSala.appendChild(opt);
    }
  }

  // 4. Carrega e exibe as áreas com saldo
  if (modalAgendaListaServicos) {
    modalAgendaListaServicos.innerHTML = '<div style="font-size: 11px; color: #64748b; padding: 4px;">Carregando saldo de sessões...</div>';
    
    // a) Tenta buscar saldo exato da API oficial saldovendaplano
    let servicosSaldo = null;
    if (app.codOrcamento && state.currentToken) {
      try {
        servicosSaldo = await buscarSaldoVendaPlanoApi(state.currentToken, app.codOrcamento, app.codPlano, app.idGeinfo, state.currentCodEstab);
      } catch (e) {}
    }

    if (Array.isArray(servicosSaldo) && servicosSaldo.length > 0) {
      renderizarListaServicosSaldo(servicosSaldo);
    } else {
      // b) Fallback: extrai do lbServ / arrServ
      let servicosFallback = (app.arrServ && app.arrServ.length > 0) ? [...app.arrServ] : [];
      if (servicosFallback.length === 0 && app.procedimento) {
        servicosFallback.push({ nome: app.procedimento, cod_servico: "" });
      }

      const progressoMap = new Map();
      if (app.lbServ) {
        const linhas = app.lbServ.split("<br>").map(l => l.trim()).filter(Boolean);
        linhas.forEach(l => {
          const match = l.match(/(.+?)\s*-\s*(\d+)\/(\d+)/);
          if (match) {
            const f = parseInt(match[2], 10) || 0;
            const tot = parseInt(match[3], 10) || 10;
            progressoMap.set(match[1].trim().toLowerCase(), { feitas: f, total: tot, saldo: Math.max(0, tot - f) });
          }
        });
      }

      const formatado = servicosFallback.map(s => {
        const sNome = s.nome || "Área";
        let f = 0, tot = 10, sal = 10;
        for (const [k, v] of progressoMap.entries()) {
          if (sNome.toLowerCase().includes(k) || k.includes(sNome.toLowerCase().substring(0, 8))) {
            f = v.feitas;
            tot = v.total;
            sal = v.saldo;
            break;
          }
        }
        return {
          nome: sNome,
          gasto: f,
          quantidade: tot,
          saldo: sal
        };
      });

      renderizarListaServicosSaldo(formatado);
    }
  }

  // 5. Listener no input de data para atualizar o texto DD/MM/YYYY se o usuário escolher outra data no picker
  modalAgendaInputData?.addEventListener("change", (e) => {
    if (e.target.value) {
      const [y, m, d] = e.target.value.split("-").map(Number);
      const dataManual = new Date(y, m - 1, d);
      atualizarTextoDataBr(dataManual);
    }
  });

  atualizarRegraEDataSugerida();
  modalAgendarProxima.style.display = "flex";
}

export function fecharModalAgendarProxima() {
  if (modalAgendarProxima) {
    modalAgendarProxima.style.display = "none";
  }
  currentAppAgendamento = null;
  callbackSalvar = null;
}

btnConfirmarAgendarProxima?.addEventListener("click", () => {
  if (!currentAppAgendamento) return;

  const dataEscolhida = modalAgendaInputData?.value;
  const horaEscolhida = modalAgendaInputHora?.value;
  const salaEscolhida = modalAgendaSelectSala?.value;

  const checkedServicos = [];
  modalAgendaListaServicos?.querySelectorAll("input[name='servico_agendar']:checked").forEach(chk => {
    checkedServicos.push(chk.value);
  });

  const dadosAgendamento = {
    clienteNome: currentAppAgendamento.clienteNome,
    codCliente: currentAppAgendamento.codCliente,
    telefone: currentAppAgendamento.telefone,
    cpf: currentAppAgendamento.cpf,
    data: dataEscolhida,
    horario: horaEscolhida,
    sala: salaEscolhida,
    servicos: checkedServicos
  };

  console.log("[BelleCopilot] 📅 Solicitação de agendamento de próxima sessão:", dadosAgendamento);

  if (typeof callbackSalvar === "function") {
    callbackSalvar(dadosAgendamento);
  }

  let dataFormatadaBr = dataEscolhida;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dataEscolhida)) {
    const [y, m, d] = dataEscolhida.split("-");
    dataFormatadaBr = `${d}/${m}/${y}`;
  }

  alert(`✅ Solicitação de agendamento para ${dadosAgendamento.clienteNome} no dia ${dataFormatadaBr} às ${horaEscolhida} registrada com sucesso!`);
  fecharModalAgendarProxima();
});

btnCancelarAgendarProxima?.addEventListener("click", () => {
  fecharModalAgendarProxima();
});
