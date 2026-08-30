/**
 * BELLE COPILOT - VIEW DE CONFIGURAÇÕES & DIAGNÓSTICO
 */

import { state } from '../core/state.js';

const inputTokenManual = document.getElementById("input-token-manual");
const inputCodEstab = document.getElementById("input-cod-estab");
const inputCodUsuario = document.getElementById("input-cod-usuario");
const btnSalvarConfig = document.getElementById("btn-salvar-config");
const btnRecarregarTudo = document.getElementById("btn-recarregar-tudo");
const btnConfigVoltar = document.getElementById("btn-config-voltar");
const btnOpenConfig = document.getElementById("btn-open-config");
const btnTestAgendaApi = document.getElementById("btn-test-agenda-api");
const debugStatusBadge = document.getElementById("debug-status-badge");
const debugRawResponse = document.getElementById("debug-raw-response");

export function inicializarConfigView({ onAtivarAba, onRecarregarTudo } = {}) {
  btnOpenConfig?.addEventListener("click", () => {
    if (inputTokenManual) inputTokenManual.value = state.currentToken || "";
    if (inputCodEstab) inputCodEstab.value = state.currentCodEstab || "1";
    if (inputCodUsuario) inputCodUsuario.value = state.currentCodUsuario || "master-admin";
    if (typeof onAtivarAba === "function") onAtivarAba("tab-config");
  });

  btnConfigVoltar?.addEventListener("click", () => {
    if (typeof onAtivarAba === "function") onAtivarAba("tab-agenda");
  });

  btnSalvarConfig?.addEventListener("click", () => {
    const manualTok = inputTokenManual?.value.trim();
    const manualUser = inputCodUsuario?.value.trim();
    if (manualTok) state.currentToken = manualTok;
    if (manualUser) state.currentCodUsuario = manualUser;

    btnSalvarConfig.textContent = "✅ Parâmetros Salvos!";
    setTimeout(() => {
      btnSalvarConfig.textContent = "💾 Salvar Parâmetros";
      if (typeof onRecarregarTudo === "function") onRecarregarTudo();
    }, 800);
  });

  btnRecarregarTudo?.addEventListener("click", () => {
    if (typeof onRecarregarTudo === "function") onRecarregarTudo();
  });

  btnTestAgendaApi?.addEventListener("click", async () => {
    if (debugStatusBadge) debugStatusBadge.textContent = "Status: Disparando requisição...";
    if (debugRawResponse) debugRawResponse.textContent = "Aguardando resposta do Belle Software...";

    try {
      const url = `https://app.bellesoftware.com.br/api/release/controller/Agenda/v1.0/agendaapi?data=${state.currentDataAgenda}&estabGeral=1`;
      const res = await fetch(url, {
        headers: {
          "authorization": state.currentToken,
          "accept": "application/json, text/plain, */*"
        }
      });
      const data = await res.json();
      if (debugStatusBadge) debugStatusBadge.textContent = `Status: ${res.status} ${res.statusText} (${Array.isArray(data) ? data.length : 0} registros)`;
      if (debugRawResponse) debugRawResponse.textContent = JSON.stringify(data, null, 2).substring(0, 3000);
    } catch (err) {
      if (debugStatusBadge) debugStatusBadge.textContent = `Status: Erro na chamada`;
      if (debugRawResponse) debugRawResponse.textContent = String(err);
    }
  });
}
