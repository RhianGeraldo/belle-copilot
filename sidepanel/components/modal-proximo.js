/**
 * BELLE COPILOT - MODAL DE ALERTA DE MÚLTIPLOS AGENDAMENTOS DO MESMO CLIENTE
 */

const modalProximoAgendamento = document.getElementById("modal-proximo-agendamento");
const modalProximoNomeCliente = document.getElementById("modal-proximo-nome-cliente");
const modalProximoListaCards = document.getElementById("modal-proximo-lista-cards");
const btnProximoVoltarAgenda = document.getElementById("btn-proximo-voltar-agenda");
const btnProximoIniciarAtendimento = document.getElementById("btn-proximo-iniciar-atendimento");

let callbackIniciarProximo = null;
let proximoPendente = null;

export function abrirModalProximoAgendamento(clienteNome, proximoApp, onIniciarProximo) {
  if (!modalProximoAgendamento) return;

  proximoPendente = proximoApp;
  callbackIniciarProximo = onIniciarProximo;

  if (modalProximoNomeCliente) {
    modalProximoNomeCliente.textContent = clienteNome || "da Paciente";
  }

  if (modalProximoListaCards && proximoApp) {
    const procs = (proximoApp.arrServ && proximoApp.arrServ.length > 0)
      ? proximoApp.arrServ.map(s => s.nome).join(", ")
      : (proximoApp.procedimento || "Procedimento a Laser");

    modalProximoListaCards.innerHTML = `
      <div class="next-app-card">
        <div style="display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 4px;">
          <span style="color: #0284c7;">⏰ ${proximoApp.horario} - ${proximoApp.hrFim}</span>
          <span class="app-badge badge-confirmado">${proximoApp.statusFormatado || proximoApp.status}</span>
        </div>
        <div style="font-weight: 800; font-size: 13px; color: #0f172a; margin-bottom: 2px;">
          ✨ ${procs}
        </div>
        <div style="font-size: 11px; color: #64748b;">
          👩‍⚕️ ${proximoApp.profissional} • 📍 ${proximoApp.salaNome}
        </div>
      </div>
    `;
  }

  modalProximoAgendamento.style.display = "flex";
}

export function fecharModalProximoAgendamento() {
  if (modalProximoAgendamento) {
    modalProximoAgendamento.style.display = "none";
  }
  proximoPendente = null;
  callbackIniciarProximo = null;
}

btnProximoIniciarAtendimento?.addEventListener("click", () => {
  if (typeof callbackIniciarProximo === "function" && proximoPendente) {
    callbackIniciarProximo(proximoPendente);
  }
  fecharModalProximoAgendamento();
});

btnProximoVoltarAgenda?.addEventListener("click", () => {
  fecharModalProximoAgendamento();
});
