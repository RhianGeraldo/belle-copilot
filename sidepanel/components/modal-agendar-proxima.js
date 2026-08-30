/**
 * BELLE COPILOT - MODAL DE AGENDAMENTO DA PRÓXIMA SESSÃO (RECEPÇÃO / COMERCIAL)
 * Aplica as regras clínicas de intervalo entre procedimentos:
 * - Depilação para Depilação: +45 dias
 * - Clareamento para Clareamento: +45 dias
 * - Depilação para Clareamento: +25 dias
 * - Clareamento para Depilação: +25 dias
 * 
 * Data base calculada a partir do agendamento de hoje se status for Aguardando, Em Andamento ou Atendido.
 */

import { state } from '../core/state.js';

const modalAgendarProxima = document.getElementById("modal-agendar-proxima");
const modalAgendaNomeCliente = document.getElementById("modal-agenda-nome-cliente");
const modalAgendaInfoPaciente = document.getElementById("modal-agenda-info-paciente");
const modalAgendaContextoHoje = document.getElementById("modal-agenda-contexto-hoje");
const modalAgendaBadgeRegra = document.getElementById("modal-agenda-badge-regra");
const modalAgendaTipoProximoBadge = document.getElementById("modal-agenda-tipo-proximo-badge");
const modalAgendaLblData = document.getElementById("modal-agenda-lbl-data");
const modalAgendaListaServicos = document.getElementById("modal-agenda-lista-servicos");
const modalAgendaInputData = document.getElementById("modal-agenda-input-data");
const modalAgendaInputHora = document.getElementById("modal-agenda-input-hora");
const modalAgendaSelectSala = document.getElementById("modal-agenda-select-sala");
const btnCancelarAgendarProxima = document.getElementById("btn-cancelar-agendar-proxima");
const btnConfirmarAgendarProxima = document.getElementById("btn-confirmar-agendar-proxima");

let callbackSalvar = null;
let currentAppAgendamento = null;
let tipoProcedimentoAtual = "depilacao"; // "depilacao" ou "clareamento"

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

export function abrirModalAgendarProxima(app, onSalvar) {
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

  // 4. Lista de Áreas / Serviços com saldo ou extraídos de lbServ / arrServ
  if (modalAgendaListaServicos) {
    let servicos = (app.arrServ && app.arrServ.length > 0) ? [...app.arrServ] : [];
    if (servicos.length === 0 && app.procedimento) {
      servicos.push({ nome: app.procedimento, cod_servico: "" });
    }

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

    let itemsHtml = "";
    servicos.forEach((s, idx) => {
      const sNome = s.nome || `Área #${idx + 1}`;
      const sTipo = identificarTipoProcedimento(sNome);
      const iconTipo = (sTipo === "clareamento") ? "🧴" : "🪒";
      
      let sessaoTxt = "";
      for (const [k, v] of progressoMap.entries()) {
        if (sNome.toLowerCase().includes(k) || k.includes(sNome.toLowerCase().substring(0, 8))) {
          const parts = v.split("/");
          if (parts.length === 2) {
            const feitas = Number(parts[0]) || 0;
            const total = Number(parts[1]) || 0;
            sessaoTxt = `(Próxima: ${feitas + 1}/${total} - Restam ${Math.max(0, total - feitas - 1)})`;
          }
          break;
        }
      }

      itemsHtml += `
        <label class="check-servico-item">
          <input type="checkbox" name="servico_agendar" value="${sNome}" checked>
          <span>${iconTipo} <strong>${sNome}</strong> ${sessaoTxt ? `<small style="color: #0284c7; font-weight: 700;">${sessaoTxt}</small>` : ''}</span>
        </label>
      `;
    });

    modalAgendaListaServicos.innerHTML = itemsHtml || '<div style="font-size: 11px; color: #64748b;">Nenhuma área encontrada.</div>';

    // Adiciona listener para recalcular em tempo real ao marcar/desmarcar checkboxes
    modalAgendaListaServicos.querySelectorAll("input[name='servico_agendar']").forEach(chk => {
      chk.addEventListener("change", () => {
        atualizarRegraEDataSugerida();
      });
    });
  }

  // 5. Executa cálculo inicial de intervalo e data sugerida
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

  alert(`✅ Solicitação de agendamento para ${dadosAgendamento.clienteNome} no dia ${dataEscolhida} às ${horaEscolhida} registrada com sucesso!`);
  fecharModalAgendarProxima();
});

btnCancelarAgendarProxima?.addEventListener("click", () => {
  fecharModalAgendarProxima();
});
