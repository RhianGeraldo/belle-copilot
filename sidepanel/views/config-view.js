/**
 * BELLE COPILOT - VIEW DE CONFIGURAÇÕES & DIAGNÓSTICO
 */

import { state } from '../core/state.js';
import { listarCache, limparCache, formatarIdade } from '../core/cache-persistente.js';

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
const cacheLista = document.getElementById("cache-lista");
const btnAtualizarCache = document.getElementById("btn-atualizar-cache");
const btnLimparCache = document.getElementById("btn-limpar-cache");

function escaparHtml(txt = "") {
  return String(txt).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatarTamanho(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatarValidade(ms = 0) {
  const h = Math.round(ms / 3600000);
  return h >= 24 ? `${Math.round(h / 24)} d` : `${h} h`;
}

/** Mostra o que está guardado no cache local desta unidade. */
export async function renderizarInventarioCache() {
  if (!cacheLista) return;

  const unidade = state.currentCodEstab || "";
  if (!unidade) {
    cacheLista.innerHTML = '<div style="font-size: 11px; color: #64748b;">Sessão do Belle ainda não resolvida.</div>';
    return;
  }

  const entradas = await listarCache(unidade);

  cacheLista.innerHTML = entradas.map(e => {
    if (!e.presente) {
      return `
        <div class="cache-item cache-ausente">
          <span class="cache-item-dot"></span>
          <div class="cache-item-info">
            <span class="cache-item-titulo">${escaparHtml(e.rotulo)}</span>
            <span class="cache-item-meta">Ainda não guardado — será salvo na próxima sincronização.</span>
          </div>
          <span class="cache-item-tag">vazio</span>
        </div>`;
    }

    const classe = e.expirado ? "cache-vencido" : "";
    const tag = e.expirado ? "revalidar" : "válido";
    return `
      <div class="cache-item ${classe}">
        <span class="cache-item-dot"></span>
        <div class="cache-item-info">
          <span class="cache-item-titulo">${escaparHtml(e.rotulo)}</span>
          ${e.resumo ? `<span class="cache-item-resumo">${escaparHtml(e.resumo)}</span>` : ""}
          <span class="cache-item-meta">
            Atualizado ${formatarIdade(e.idadeMs)} • validade ${formatarValidade(e.validadeMs)} • ${formatarTamanho(e.tamanhoBytes)}${e.itens !== null ? ` • ${e.itens} item(ns)` : ""}
          </span>
        </div>
        <span class="cache-item-tag">${tag}</span>
      </div>`;
  }).join("");

  const unidadeNome = state.currentClinicaNome ? ` (${state.currentClinicaNome})` : "";
  cacheLista.innerHTML += `
    <div style="font-size: 10px; color: #94a3b8; margin-top: 6px;">
      Unidade #${escaparHtml(unidade)}${escaparHtml(unidadeNome)}${state.currentIdGeinfo ? ` • id_geinfo ${escaparHtml(state.currentIdGeinfo)}` : ""}
    </div>`;
}

export function inicializarConfigView({ onAtivarAba, onRecarregarTudo } = {}) {
  btnOpenConfig?.addEventListener("click", () => {
    if (inputTokenManual) inputTokenManual.value = state.currentToken || "";
    if (inputCodEstab) inputCodEstab.value = state.currentCodEstab || "";
    if (inputCodUsuario) inputCodUsuario.value = state.currentCodUsuario || "";
    if (typeof onAtivarAba === "function") onAtivarAba("tab-config");
    renderizarInventarioCache();
  });

  btnAtualizarCache?.addEventListener("click", () => renderizarInventarioCache());

  btnLimparCache?.addEventListener("click", async () => {
    await limparCache(state.currentCodEstab || "");
    btnLimparCache.textContent = "✅ Limpo!";
    await renderizarInventarioCache();
    setTimeout(() => { btnLimparCache.textContent = "🗑️ Limpar"; }, 1500);
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
