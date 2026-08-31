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

  // 2. Recepção / Atendimento
  if (
    fullText.includes("recepc") ||
    fullText.includes("atendiment") ||
    fullText.includes("portaria")
  ) {
    return "recepcao";
  }

  // 3. Consultora / Vendas
  if (
    fullText.includes("consultor") ||
    fullText.includes("vendedor") ||
    fullText.includes("comercial") ||
    fullText.includes("vendas")
  ) {
    return "consultora";
  }

  // 4. Aplicadora / Esteticista / Biomédica / Laser
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

/** Perfil com acesso aos números de gestão (faturamento, conversão, ranking). */
export function ehGerente() {
  return state.currentUserRole === "gerente";
}

/**
 * Números de gestão do funil de vendas ficam restritos ao gerente.
 * A consultora continua com as filas de trabalho (aguardando, pendente, vencendo),
 * que é o que ela precisa para operar — sem ver faturamento, ticket médio,
 * taxa de conversão nem o ranking das colegas.
 */
export function aplicarVisibilidadeGerencial() {
  const gerente = ehGerente();
  const kpisVendas = document.getElementById("vendas-kpi-grid");
  const rankingVendas = document.getElementById("vendas-ranking");

  if (kpisVendas) kpisVendas.style.display = gerente ? "grid" : "none";
  if (rankingVendas) rankingVendas.style.display = gerente ? "block" : "none";
}

export function aplicarVisualizacaoPorPerfil(perfil, { onAtivarAba } = {}) {
  state.currentUserRole = perfil;
  console.log(`[PERFIL] 👤 Aplicando modo de visualização: ${perfil.toUpperCase()}`);

  aplicarVisibilidadeGerencial();

  const rolePreviewContainer = document.getElementById("role-preview-container");
  const selectRolePreview = document.getElementById("select-role-preview");
  const mainModuleNav = document.getElementById("main-module-nav");
  const moduleAgenda = document.getElementById("module-agenda");
  const moduleComercial = document.getElementById("module-comercial");
  const tabModuleAgenda = document.getElementById("tab-module-agenda");
  const tabModuleComercial = document.getElementById("tab-module-comercial");

  if (rolePreviewContainer) {
    rolePreviewContainer.style.display = (state.currentUserOriginalRole === "gerente") ? "block" : "none";
    if (selectRolePreview) selectRolePreview.value = perfil;
  }

  if (perfil === "aplicadora" || perfil === "recepcao") {
    // 📅 Modo Aplicadora / Recepção: Foco exclusivo no Módulo Agenda
    if (mainModuleNav) mainModuleNav.style.display = "none";
    if (moduleAgenda) {
      moduleAgenda.style.display = "flex";
      moduleAgenda.classList.add("active");
    }
    if (moduleComercial) {
      moduleComercial.style.display = "none";
      moduleComercial.classList.remove("active");
    }

    if (typeof onAtivarAba === "function") onAtivarAba("tab-agenda");
  } else if (perfil === "consultora") {
    // 🎯 Modo Consultora: Foco exclusivo no Módulo Comercial
    if (mainModuleNav) mainModuleNav.style.display = "none";
    if (moduleAgenda) {
      moduleAgenda.style.display = "none";
      moduleAgenda.classList.remove("active");
    }
    if (moduleComercial) {
      moduleComercial.style.display = "flex";
      moduleComercial.classList.add("active");
    }

    if (typeof onAtivarAba === "function") onAtivarAba("tab-comercial");
  } else {
    // 👑 Modo Gerente: Exibe barra superior com Módulos (Agenda | Comercial)
    if (mainModuleNav) mainModuleNav.style.display = "flex";
    if (moduleAgenda) {
      moduleAgenda.style.display = "flex";
      moduleAgenda.classList.add("active");
    }
    if (moduleComercial) {
      moduleComercial.style.display = "none";
      moduleComercial.classList.remove("active");
    }
    if (tabModuleAgenda) tabModuleAgenda.classList.add("active");
    if (tabModuleComercial) tabModuleComercial.classList.remove("active");

  }
}
