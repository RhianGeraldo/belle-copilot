/**
 * BELLE COPILOT - PERMISSÕES & CONTROLE DE ACESSO POR PERFIL (RBAC)
 * Gerencia a adaptação dinâmica das telas para Aplicadoras, Consultoras e Gerentes.
 */

import { state } from './state.js';

export function classificarPerfilUsuario(userData, codUsuario = "") {
  if (!userData) {
    const cod = String(codUsuario || "").toLowerCase();
    if (cod.includes("admin") || cod.includes("master")) return "gerente";
    return "gerente";
  }

  const gruposNomes = (Array.isArray(userData.grupos) ? userData.grupos.map(g => g.nome || "") : []).join(" ").toLowerCase();
  const loginStr = (userData.login || userData.cod_usuario || codUsuario || "").toLowerCase();
  const nomeStr = (userData.nom_usuario || userData.nomeUsuario || "").toLowerCase();
  const fullText = `${gruposNomes} ${loginStr} ${nomeStr}`;

  // 1. Gerente / Master / Administrador
  if (
    fullText.includes("master") ||
    fullText.includes("admin") ||
    fullText.includes("gerent") ||
    fullText.includes("gerenc") ||
    fullText.includes("diretor") ||
    fullText.includes("proprietari") ||
    fullText.includes("supervisor")
  ) {
    return "gerente";
  }

  // 2. Consultora / Recepção / Vendas
  if (
    fullText.includes("consultor") ||
    fullText.includes("vendedor") ||
    fullText.includes("comercial") ||
    fullText.includes("recepc") ||
    fullText.includes("atendiment")
  ) {
    return "consultora";
  }

  // 3. Aplicadora / Esteticista / Biomédica / Laser
  if (
    fullText.includes("aplicador") ||
    fullText.includes("estetic") ||
    fullText.includes("biomedic") ||
    fullText.includes("fisioterap") ||
    fullText.includes("laser") ||
    fullText.includes("operador")
  ) {
    return "aplicadora";
  }

  return "aplicadora";
}

export function aplicarVisualizacaoPorPerfil(perfil, { onAtivarAba, onRenderizarComercial }) {
  state.currentUserRole = perfil;
  console.log(`[PERFIL] 👤 Aplicando modo de visualização: ${perfil.toUpperCase()}`);

  const rolePreviewContainer = document.getElementById("role-preview-container");
  const selectRolePreview = document.getElementById("select-role-preview");
  const cardFiltroSalas = document.getElementById("card-filtro-salas");
  const cardKpiGrid = document.getElementById("card-kpi-grid");
  const tabNavAgenda = document.getElementById("tab-nav-agenda");
  const tabNavAtendimento = document.getElementById("tab-nav-atendimento");
  const tabNavComercial = document.getElementById("tab-nav-comercial");

  if (rolePreviewContainer) {
    rolePreviewContainer.style.display = (state.currentUserOriginalRole === "gerente") ? "block" : "none";
    if (selectRolePreview) selectRolePreview.value = perfil;
  }

  if (perfil === "aplicadora") {
    // 🩺 Modo Aplicadora: Agenda do Dia + Atendimento Clínico (Cabine)
    if (cardFiltroSalas) cardFiltroSalas.style.display = "block";
    if (cardKpiGrid) cardKpiGrid.style.display = "grid";
    if (tabNavAgenda) tabNavAgenda.style.display = "block";
    if (tabNavAtendimento) tabNavAtendimento.style.display = "block";
    if (tabNavComercial) tabNavComercial.style.display = "none";

    const activeTab = document.querySelector(".tab-content.active");
    if (!activeTab || activeTab.id === "tab-comercial") {
      if (typeof onAtivarAba === "function") onAtivarAba("tab-agenda");
    }
  } else if (perfil === "consultora") {
    // 🎯 Modo Consultora: Foco exclusivo em Comercial / Oportunidades & Ficha (sem agenda)
    if (cardFiltroSalas) cardFiltroSalas.style.display = "none";
    if (cardKpiGrid) cardKpiGrid.style.display = "none";
    if (tabNavAgenda) tabNavAgenda.style.display = "none";
    if (tabNavAtendimento) tabNavAtendimento.style.display = "none";
    if (tabNavComercial) tabNavComercial.style.display = "block";

    if (typeof onAtivarAba === "function") onAtivarAba("tab-comercial");
    if (typeof onRenderizarComercial === "function") onRenderizarComercial();
  } else {
    // 👑 Modo Gerente: Acesso total (Agenda + Atendimento + Comercial + Configurações)
    if (cardFiltroSalas) cardFiltroSalas.style.display = "block";
    if (cardKpiGrid) cardKpiGrid.style.display = "grid";
    if (tabNavAgenda) tabNavAgenda.style.display = "block";
    if (tabNavAtendimento) tabNavAtendimento.style.display = "block";
    if (tabNavComercial) tabNavComercial.style.display = "block";

    if (typeof onRenderizarComercial === "function") onRenderizarComercial();
  }
}
