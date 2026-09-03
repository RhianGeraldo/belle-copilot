/**
 * BELLE COPILOT - PERMISSÕES & CONTROLE DE ACESSO POR PERFIL (RBAC)
 * Gerencia a adaptação dinâmica das telas para Aplicadoras, Consultoras e Gerentes.
 */

import { state } from './state.js';

export function classificarPerfilUsuario(userData, codUsuario = "") {
  // Se não há dados retornados na chamada de rede:
  // Se já tínhamos um perfil válido no estado e ele não era o default ("gerente"), mantém o que já estava!
  if (!userData) {
    if (state.currentUserRole && state.currentUserRole !== "gerente") {
      return state.currentUserRole;
    }
    const cod = String(codUsuario || "").toLowerCase();
    if (cod.includes("admin") || cod.includes("master") || cod.includes("diretor") || cod.includes("gerente")) {
      return "gerente";
    }
    if (cod.includes("consultor") || cod.includes("venda")) {
      return "consultora";
    }
    if (cod.includes("aplicador") || cod.includes("laser")) {
      return "aplicadora";
    }
    if (cod.includes("crc")) {
      return "crc";
    }
    return state.currentUserRole || "consultora";
  }

  // Extrai nomes dos grupos retornados pela API /recuperar_dados do Belle Software
  const gruposNomes = (Array.isArray(userData.grupos) ? userData.grupos.map(g => g.nome || "") : []).join(" ").toUpperCase();
  const loginStr = (userData.login || userData.cod_usuario || codUsuario || "").toUpperCase();
  const nomeStr = (userData.nom_usuario || userData.nomeUsuario || "").toUpperCase();
  const fullText = `${gruposNomes} ${loginStr} ${nomeStr}`;

  // 1. DIRETORIA - NOVO ou GERENTE - NOVO (Acesso total)
  if (
    gruposNomes.includes("DIRETORIA") ||
    gruposNomes.includes("GERENTE") ||
    fullText.includes("DIRETORIA - NOVO") ||
    fullText.includes("GERENTE - NOVO") ||
    fullText.includes("MASTER") ||
    fullText.includes("ADMIN") ||
    fullText.includes("SUPERVISOR") ||
    fullText.includes("PROPRIETARI")
  ) {
    return "gerente";
  }

  // 2. CONSULTORA - NOVO (Comercial / Vendas)
  // IMPORTANTE: checado ANTES de CRC ou termos de atendimento para garantir foco comercial
  if (
    gruposNomes.includes("CONSULTORA") ||
    fullText.includes("CONSULTORA - NOVO") ||
    fullText.includes("CONSULTOR") ||
    fullText.includes("VENDEDOR") ||
    fullText.includes("COMERCIAL") ||
    fullText.includes("VENDAS")
  ) {
    return "consultora";
  }

  // 3. CRC - NOVO (Central de Relacionamento com o Cliente)
  if (
    gruposNomes.includes("CRC") ||
    fullText.includes("CRC - NOVO") ||
    fullText.includes("RELACIONAMENTO")
  ) {
    return "crc";
  }

  // 4. APLICADORA - NOVO (Laser / Técnica / Estética)
  if (
    gruposNomes.includes("APLICADORA") ||
    fullText.includes("APLICADORA - NOVO") ||
    fullText.includes("APLICADOR") ||
    fullText.includes("ESTETIC") ||
    fullText.includes("BIOMEDIC") ||
    fullText.includes("FISIOTERAP") ||
    fullText.includes("LASER") ||
    fullText.includes("OPERADOR")
  ) {
    return "aplicadora";
  }

  // 5. Recepção / Portaria (caso legado)
  if (
    fullText.includes("RECEPC") ||
    fullText.includes("PORTARIA")
  ) {
    return "recepcao";
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

    if (typeof onAtivarAba === "function") onAtivarAba("tab-vendas");
  } else if (perfil === "crc") {
    // 🤝 Modo CRC: Central de Relacionamento (navega entre Agenda e Comercial, sem números financeiros da diretoria)
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

    if (typeof onAtivarAba === "function") onAtivarAba("tab-agenda");
  } else {
    // 👑 Modo Gerente / Diretoria: Exibe barra superior com Módulos (Agenda | Comercial)
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
