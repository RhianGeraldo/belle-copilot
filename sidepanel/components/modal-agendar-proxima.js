/**
 * BELLE COPILOT - MODAL DE AGENDAMENTO DA PRÓXIMA SESSÃO (RECEPÇÃO / COMERCIAL)
 * Calcula a data ideal (+30 a 45 dias), extrai as áreas com saldo e permite criar o agendamento no Belle.
 */

import { state } from '../core/state.js';

const modalAgendarProxima = document.getElementById("modal-agendar-proxima");
const modalAgendaNomeCliente = document.getElementById("modal-agenda-nome-cliente");
const modalAgendaInfoPaciente = document.getElementById("modal-agenda-info-paciente");
const modalAgendaListaServicos = document.getElementById("modal-agenda-lista-servicos");
const modalAgendaInputData = document.getElementById("modal-agenda-input-data");
const modalAgendaInputHora = document.getElementById("modal-agenda-input-hora");
const modalAgendaSelectSala = document.getElementById("modal-agenda-select-sala");
const btnCancelarAgendarProxima = document.getElementById("btn-cancelar-agendar-proxima");
const btnConfirmarAgendarProxima = document.getElementById("btn-confirmar-agendar-proxima");

let callbackSalvar = null;
let currentAppAgendamento = null;

export function abrirModalAgendarProxima(app, onSalvar) {
  if (!modalAgendarProxima) return;

  currentAppAgendamento = app;
  callbackSalvar = onSalvar;

  if (modalAgendaNomeCliente) {
    modalAgendaNomeCliente.textContent = app.clienteNome || "Cliente";
  }

  if (modalAgendaInfoPaciente) {
    const pront = app.codCliente ? `#${app.codCliente}` : "N/A";
    const tel = app.telefone || "Não informado";
    modalAgendaInfoPaciente.textContent = `Prontuário: ${pront} • Celular: ${tel}`;
  }

  // 1. Calcula a data ideal: hoje + 35 dias (intervalo seguro do laser)
  if (modalAgendaInputData) {
    const dataFutura = new Date();
    dataFutura.setDate(dataFutura.getDate() + 35);
    const yyyy = dataFutura.getFullYear();
    const mm = String(dataFutura.getMonth() + 1).padStart(2, "0");
    const dd = String(dataFutura.getDate()).padStart(2, "0");
    modalAgendaInputData.value = `${yyyy}-${mm}-${dd}`;
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

    // Mapeamento de progresso de lbServ
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
          <span>✨ <strong>${sNome}</strong> ${sessaoTxt ? `<small style="color: #0284c7; font-weight: 700;">${sessaoTxt}</small>` : ''}</span>
        </label>
      `;
    });

    modalAgendaListaServicos.innerHTML = itemsHtml || '<div style="font-size: 11px; color: #64748b;">Nenhuma área encontrada.</div>';
  }

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
