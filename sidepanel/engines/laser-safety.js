/**
 * BELLE COPILOT - MOTOR DE SEGURANÇA & EVOLUÇÃO CLÍNICA DO LASER
 * Valida a progressão técnica de Joules/Energia e gerencia travas de segurança clínica.
 */

import { state } from '../core/state.js';

export function extrairParametrosAnterioresDaArea(nomeArea, historicoRegistros = []) {
  if (!Array.isArray(historicoRegistros) || historicoRegistros.length === 0) {
    return {
      fototipo: "IV",
      modo: "HR",
      energia: "25",
      frequencia: "0,8",
      pulso: "",
      disparos: "200",
      obs: ""
    };
  }

  const cleanNome = (nomeArea || "").toLowerCase();
  
  let matchReg = null;
  for (const reg of historicoRegistros) {
    const areaReg = (reg.area || "").toLowerCase();
    const obsReg = (reg.observacao || "").toLowerCase();
    
    const keywords = cleanNome.split(/[\s\-\(\)\/\+]+/).filter(w => w.length >= 3 && !['depilação', 'laser', 'cortesia', 'combo', 'sessões', 'sessao', 'completa', 'feminina', 'masculina'].includes(w));
    
    const matchedKeyword = keywords.some(k => areaReg.includes(k) || obsReg.includes(k));
    if (matchedKeyword) {
      matchReg = reg;
      break;
    }
  }

  if (!matchReg) {
    matchReg = historicoRegistros[0];
  }

  let obsArea = matchReg.observacao || "";
  if (obsArea.includes("\n")) {
    const linhas = obsArea.split("\n").map(l => l.trim()).filter(Boolean);
    const keywords = cleanNome.split(/[\s\-\(\)\/\+]+/).filter(w => w.length >= 3 && !['depilação', 'laser', 'cortesia', 'combo'].includes(w));
    const linhaEspecifica = linhas.find(l => keywords.some(k => l.toLowerCase().includes(k)));
    if (linhaEspecifica) {
      obsArea = linhaEspecifica;
    }
  }

  let energiaEncontrada = matchReg.energia || "";
  if (!energiaEncontrada && obsArea) {
    const matchEnergia = obsArea.match(/\b(\d{2,3})\s*(?:j|ft|joules)?\b/i);
    if (matchEnergia) energiaEncontrada = matchEnergia[1];
  }

  return {
    fototipo: matchReg.fototipo || "IV",
    modo: matchReg.modo_aplicacao || "HR",
    energia: energiaEncontrada || matchReg.energia || "25",
    frequencia: matchReg.frequencia || "0,8",
    pulso: matchReg.largura_pulso || "",
    disparos: matchReg.qtd_disparos || "200",
    obs: matchReg.observacao || ""
  };
}

export function coletarParametrosDosFormularios() {
  const formCards = document.querySelectorAll(".atend-param-form-card");
  if (!formCards || formCards.length === 0) return [];

  const app = state.selectedAppointment;
  const hojeStr = new Date().toISOString().replace("T", " ").substring(0, 19);

  const listaParaSalvar = [];
  formCards.forEach(card => {
    const codServ = card.getAttribute("data-cod-serv");
    const areaNome = card.getAttribute("data-area-nome") || "Área";
    const areaFormatada = card.getAttribute("data-area-formatada") || areaNome;

    const fototipo = card.querySelector(".param-fototipo")?.value || "IV";
    const modo = card.querySelector(".param-modo")?.value || "HR";
    const energia = card.querySelector(".param-energia")?.value || "25";
    const frequencia = card.querySelector(".param-frequencia")?.value || "0,8";
    const disparos = card.querySelector(".param-disparos")?.value || "200";
    const obs = card.querySelector(".param-obs")?.value?.trim() || "";

    const origFototipo = card.getAttribute("data-orig-fototipo") || "";
    const origModo = card.getAttribute("data-orig-modo") || "";
    const origEnergia = parseFloat(card.getAttribute("data-orig-energia")) || 0;
    const origFreq = parseFloat(card.getAttribute("data-orig-frequencia")) || 0;
    const origDisparos = parseInt(card.getAttribute("data-orig-disparos"), 10) || 0;

    const currentEnergiaNum = parseFloat(energia) || 0;
    const isSemEvolucao = (origEnergia > 0 && currentEnergiaNum === origEnergia);

    listaParaSalvar.push({
      cod_paciente: String(app?.codCliente || ""),
      data_hora: hojeStr,
      area: areaFormatada,
      fototipo: fototipo,
      modo_aplicacao: modo,
      energia: String(energia),
      frequencia: String(frequencia).replace(".", ","),
      largura_pulso: "",
      qtd_disparos: String(disparos),
      observacao: obs,
      profissional: app?.profissional || state.currentUserName || "Profissional",
      isSemEvolucao: isSemEvolucao,
      origEnergia: origEnergia,
      currentEnergia: currentEnergiaNum,
      nomeArea: areaNome
    });
  });

  return listaParaSalvar;
}

export function verificarEvolucaoParametros(parametrosParaSalvar) {
  const areasSemEvolucao = parametrosParaSalvar.filter(p => p.isSemEvolucao);
  return {
    possuiSemEvolucao: areasSemEvolucao.length > 0,
    areasSemEvolucao: areasSemEvolucao
  };
}
