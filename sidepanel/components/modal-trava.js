/**
 * BELLE COPILOT - MODAL DE TRAVA DE SEGURANÇA (SEM EVOLUÇÃO)
 */

const modalTravaEvolucao = document.getElementById("modal-trava-evolucao");
const listaAreasSemEvolucao = document.getElementById("lista-areas-sem-evolucao");
const btnConfirmarSalvarSemEvolucao = document.getElementById("btn-confirmar-salvar-sem-evolucao");
const btnCancelarSalvarSemEvolucao = document.getElementById("btn-cancelar-salvar-sem-evolucao");

let callbackConfirmar = null;

export function abrirModalTravaEvolucao(areasSemEvolucao, onConfirmar) {
  if (!modalTravaEvolucao || !listaAreasSemEvolucao) return;
  callbackConfirmar = onConfirmar;

  let html = "";
  areasSemEvolucao.forEach(item => {
    html += `
      <div class="modal-area-alert-item">
        <span class="modal-area-name">⚠️ ${item.nomeArea || item.area}</span>
        <span class="modal-area-energy">Energia mantida em ${item.currentEnergia}J (Última: ${item.origEnergia}J)</span>
      </div>
    `;
  });

  listaAreasSemEvolucao.innerHTML = html;
  modalTravaEvolucao.style.display = "flex";
}

export function fecharModalTravaEvolucao() {
  if (modalTravaEvolucao) {
    modalTravaEvolucao.style.display = "none";
  }
  callbackConfirmar = null;
}

btnConfirmarSalvarSemEvolucao?.addEventListener("click", () => {
  if (typeof callbackConfirmar === "function") {
    callbackConfirmar();
  }
  fecharModalTravaEvolucao();
});

btnCancelarSalvarSemEvolucao?.addEventListener("click", () => {
  fecharModalTravaEvolucao();
});
