/**
 * BELLE COPILOT - MOTOR DE SEGURANÇA & EVOLUÇÃO CLÍNICA DO LASER
 * Valida a progressão técnica de Joules/Energia e gerencia travas de segurança clínica.
 */

import { state } from '../core/state.js';

/**
 * Parâmetros padrão de partida: usados quando NÃO existe histórico da área.
 * A energia fica vazia de propósito — joules nunca são "chutados" nem herdados de outra área.
 */
const PARAMETROS_PADRAO = {
  fototipo: "IV",
  modo: "HR",
  energia: "",
  frequencia: "0,8",
  pulso: "",
  disparos: "200",
  obs: "",
  semHistorico: true,
  areaHistorico: null
};

function extrairPalavrasChaveArea(nomeArea) {
  const ignorar = ['depilação', 'depilacao', 'laser', 'cortesia', 'combo', 'sessões', 'sessoes', 'sessao', 'sessão', 'completa', 'feminina', 'masculina'];
  return (nomeArea || "")
    .toLowerCase()
    .split(/[\s\-\(\)\/\+]+/)
    .filter(w => w.length >= 3 && !ignorar.includes(w));
}

/**
 * Recupera os últimos parâmetros aplicados NA MESMA ÁREA da cliente.
 *
 * Regra clínica: se não houver registro anterior daquela área específica, nada é
 * pré-preenchido. Herdar joules de outra região (ex.: virilha → buço) é risco direto
 * de queimadura, então a aplicadora precisa definir a energia manualmente.
 */
export function extrairParametrosAnterioresDaArea(nomeArea, historicoRegistros = [], codServ = "") {
  if (!Array.isArray(historicoRegistros) || historicoRegistros.length === 0) {
    return { ...PARAMETROS_PADRAO };
  }

  // O fototipo é característica da PACIENTE (não da área), então pode vir do registro mais recente.
  const fototipoPaciente = (historicoRegistros.find(r => r.fototipo) || {}).fototipo || PARAMETROS_PADRAO.fototipo;

  const codAlvo = String(codServ || "").trim();
  const keywords = extrairPalavrasChaveArea(nomeArea);

  // 1. Match forte: o código do serviço gravado no início do campo "area" (ex.: "55556400 - AXILAS").
  let matchReg = codAlvo
    ? historicoRegistros.find(reg => {
        const areaReg = String(reg.area || "").trim();
        return areaReg.startsWith(`${codAlvo} -`) || areaReg.startsWith(`${codAlvo}-`) || String(reg.codServ || "") === codAlvo;
      })
    : null;

  // 2. Match por nome da área. A busca é feita apenas no campo "area" — casar com o texto
  //    livre da observação produzia falsos positivos entre regiões diferentes.
  if (!matchReg && keywords.length > 0) {
    matchReg = historicoRegistros.find(reg => {
      const areaReg = String(reg.area || "").toLowerCase();
      return areaReg && keywords.some(k => areaReg.includes(k));
    });
  }

  // 3. Sem histórico DESTA área: devolve o padrão sem energia. Nunca cai no registro de outra região.
  if (!matchReg) {
    console.log(`[LaserSafety] 🛡️ Sem histórico anterior da área "${nomeArea}" para esta cliente — energia não será pré-preenchida.`);
    return { ...PARAMETROS_PADRAO, fototipo: fototipoPaciente };
  }

  // Quando a observação tem uma linha por área, isola a linha da área atual.
  let obsArea = matchReg.observacao || "";
  if (obsArea.includes("\n")) {
    const linhas = obsArea.split("\n").map(l => l.trim()).filter(Boolean);
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

  const temEnergia = String(energiaEncontrada || "").trim() !== "" && parseFloat(energiaEncontrada) > 0;

  return {
    fototipo: matchReg.fototipo || fototipoPaciente,
    modo: matchReg.modo_aplicacao || PARAMETROS_PADRAO.modo,
    energia: temEnergia ? String(energiaEncontrada) : "",
    frequencia: matchReg.frequencia || PARAMETROS_PADRAO.frequencia,
    pulso: matchReg.largura_pulso || "",
    disparos: matchReg.qtd_disparos || PARAMETROS_PADRAO.disparos,
    obs: matchReg.observacao || "",
    semHistorico: !temEnergia,
    areaHistorico: matchReg.area || null
  };
}

export function coletarParametrosDosFormularios() {
  const formCards = document.querySelectorAll(".atend-param-form-card");
  if (!formCards || formCards.length === 0) return [];

  const app = state.selectedAppointment;
  const hojeStr = new Date().toISOString().replace("T", " ").substring(0, 19);

  const listaParaSalvar = [];
  formCards.forEach(card => {
    const codServ = card.getAttribute("data-cod-serv") || "";
    const areaNome = card.getAttribute("data-area-nome") || "Área";
    const areaFormatada = card.getAttribute("data-area-formatada") || areaNome;
    const status = card.getAttribute("data-status") || "realizada";
    const isRealizada = status === "realizada";

    const fototipo = card.querySelector(".param-fototipo")?.value || "IV";
    const modo = card.querySelector(".param-modo")?.value || "HR";
    const energia = (card.querySelector(".param-energia")?.value || "").trim();
    const frequencia = card.querySelector(".param-frequencia")?.value || "0,8";
    const disparos = card.querySelector(".param-disparos")?.value || "200";
    const obsRealizada = card.querySelector(".param-obs")?.value?.trim() || "";
    
    const removerDoAgendamento = card.querySelector(".chk-remover-agendamento") ? card.querySelector(".chk-remover-agendamento").checked : true;
    const skipObs = card.querySelector(".param-skip-obs")?.value?.trim() || "";

    const origFototipo = card.getAttribute("data-orig-fototipo") || "";
    const origModo = card.getAttribute("data-orig-modo") || "";
    const origEnergia = parseFloat(card.getAttribute("data-orig-energia")) || 0;
    const origFreq = parseFloat(card.getAttribute("data-orig-frequencia")) || 0;
    const origDisparos = parseInt(card.getAttribute("data-orig-disparos"), 10) || 0;

    const currentEnergiaNum = parseFloat(energia) || 0;
    const isSemEvolucao = isRealizada && (origEnergia > 0 && currentEnergiaNum === origEnergia);

    const observacaoFinal = isRealizada
      ? obsRealizada
      : (skipObs ? (skipObs.startsWith("NÃO REALIZADA") ? skipObs : `NÃO REALIZADA: ${skipObs}`) : "NÃO REALIZADA HOJE");

    listaParaSalvar.push({
      cod_paciente: String(app?.codCliente || ""),
      data_hora: hojeStr,
      area: areaFormatada,
      codServ: codServ,
      fototipo: fototipo,
      modo_aplicacao: modo,
      energia: isRealizada ? String(energia) : "",
      semEnergiaDefinida: isRealizada && !(parseFloat(energia) > 0),
      frequencia: isRealizada ? String(frequencia).replace(".", ",") : "",
      largura_pulso: "",
      qtd_disparos: isRealizada ? String(disparos) : "0",
      observacao: observacaoFinal,
      obs: observacaoFinal,
      profissional: app?.profissional || state.currentUserName || "Profissional",
      isRealizada: isRealizada,
      status: status,
      removerDoAgendamento: removerDoAgendamento,
      isSemEvolucao: isSemEvolucao,
      origEnergia: origEnergia,
      currentEnergia: currentEnergiaNum,
      nomeArea: areaNome
    });
  });

  return listaParaSalvar;
}

/**
 * Bloqueia a gravação quando uma área marcada como realizada está sem energia definida.
 * Sem isso, um campo em branco viraria um valor padrão gravado no prontuário como se
 * fosse a aplicação real do dia.
 */
export function verificarParametrosObrigatorios(parametrosParaSalvar) {
  const areasSemEnergia = (parametrosParaSalvar || []).filter(p => p.semEnergiaDefinida);
  return {
    possuiPendencia: areasSemEnergia.length > 0,
    areasSemEnergia: areasSemEnergia
  };
}

export function verificarEvolucaoParametros(parametrosParaSalvar) {
  const areasSemEvolucao = (parametrosParaSalvar || []).filter(p => p.isRealizada !== false && p.isSemEvolucao);
  return {
    possuiSemEvolucao: areasSemEvolucao.length > 0,
    areasSemEvolucao: areasSemEvolucao
  };
}
