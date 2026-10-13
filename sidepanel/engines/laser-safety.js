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
    obs: "", // Não pré-preenche observações de sessões passadas
    semHistorico: !temEnergia,
    areaHistorico: matchReg.area || null
  };
}

/**
 * Extrai as sub-zonas anteriores da área para esta cliente.
 * Se na sessão anterior a área foi dividida (ex: [Geral] e [Lábios]),
 * retorna as sub-zonas pré-configuradas com seus respectivos fototipos e energias anteriores.
 */
export function normalizarDataParaIso(dataStr) {
  if (!dataStr) return "";
  const str = String(dataStr).trim();
  const parte = str.split(" ")[0].split("T")[0];
  if (parte.includes("/")) {
    const [d, m, y] = parte.split("/");
    if (d && m && y) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  return parte;
}

export function isRegistroDeHoje(reg, app = null) {
  if (!reg) return false;
  
  const appAlvo = app || state.selectedAppointment;
  const codCli = appAlvo?.codCliente;
  const nomeCli = (appAlvo?.clienteNome || "").toLowerCase().trim();

  // Todos os agendamentos deste cliente hoje
  const agsHoje = (state.appointmentsData || []).filter(a => {
    if (a.isBloqueado || a.status === "bloqueado") return false;
    if (codCli && a.codCliente) return String(a.codCliente) === String(codCli);
    if (nomeCli && a.clienteNome) return a.clienteNome.toLowerCase().trim() === nomeCli;
    return false;
  });

  const idsHoje = agsHoje.map(a => String(a.codConsulta || a.id)).filter(Boolean);
  if (appAlvo?.codConsulta) idsHoje.push(String(appAlvo.codConsulta));
  if (appAlvo?.id) idsHoje.push(String(appAlvo.id));

  // 1. Checa por ID do agendamento (100% infalível quando retornado pelo Belle)
  const regCodAg = String(reg.codAgendamento || reg.cod_agendamento || reg.codConsulta || reg.cod_consulta || "").trim();
  if (regCodAg && idsHoje.includes(regCodAg)) {
    return true;
  }

  // 2. Checa por Data
  const d = new Date();
  const localHoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const agendaData = normalizarDataParaIso(state.currentDataAgenda);

  const rawData = reg.data_hora || reg.data || reg.dataHora || reg.dt_atendimento || reg.dthr_atendimento || reg.dt_inclusao || reg.created_at;
  const regDataIso = normalizarDataParaIso(rawData);

  if (regDataIso) {
    if (regDataIso === localHoje) return true;
    if (agendaData && regDataIso === agendaData) return true;
  }

  return false;
}

export function extrairSubzonasHistorico(nomeArea, historicoRegistros = [], codServ = "", perfilCliente = null) {
  if (!Array.isArray(historicoRegistros) || historicoRegistros.length === 0) {
    if (perfilCliente?.subzonas && codServ && perfilCliente.subzonas[codServ]) {
      return perfilCliente.subzonas[codServ].map(s => ({
        rotulo: s.rotulo || "Geral",
        fototipo: s.fototipo || PARAMETROS_PADRAO.fototipo,
        modo: s.modo || PARAMETROS_PADRAO.modo,
        energiaValor: "",
        energiaAnterior: s.energiaAnterior || "",
        temEnergiaAnterior: false,
        jaSalvoHoje: false,
        freqNum: s.freq || 0.8,
        disparosNum: s.disparos || 200,
        obs: "",
        origEnergia: 0,
        origFototipo: s.fototipo || PARAMETROS_PADRAO.fototipo,
        origModo: s.modo || PARAMETROS_PADRAO.modo
      }));
    }
    return [{
      rotulo: "Geral",
      fototipo: PARAMETROS_PADRAO.fototipo,
      modo: PARAMETROS_PADRAO.modo,
      energiaValor: "",
      energiaAnterior: "",
      temEnergiaAnterior: false,
      jaSalvoHoje: false,
      freqNum: 0.8,
      disparosNum: 200,
      obs: "",
      origEnergia: 0,
      origFototipo: PARAMETROS_PADRAO.fototipo,
      origModo: PARAMETROS_PADRAO.modo
    }];
  }

  const codAlvo = String(codServ || "").trim();
  const keywords = extrairPalavrasChaveArea(nomeArea);

  // 1. Localiza todos os registros pertencentes a esta área
  const regsArea = historicoRegistros.filter(reg => {
    const areaReg = String(reg.area || "").trim();
    if (codAlvo && (areaReg.startsWith(`${codAlvo} -`) || areaReg.startsWith(`${codAlvo}-`) || String(reg.codServ || "") === codAlvo)) {
      return true;
    }
    if (keywords.length > 0) {
      const areaLower = areaReg.toLowerCase();
      return keywords.some(k => areaLower.includes(k));
    }
    return false;
  });

  if (regsArea.length === 0) {
    const fototipoPaciente = (historicoRegistros.find(r => r.fototipo) || {}).fototipo || PARAMETROS_PADRAO.fototipo;
    return [{
      rotulo: "Geral",
      fototipo: fototipoPaciente,
      modo: PARAMETROS_PADRAO.modo,
      energiaValor: "",
      energiaAnterior: "",
      temEnergiaAnterior: false,
      jaSalvoHoje: false,
      freqNum: 0.8,
      disparosNum: 200,
      obs: "",
      origEnergia: 0,
      origFototipo: fototipoPaciente,
      origModo: PARAMETROS_PADRAO.modo
    }];
  }

  // Separa registros gravados HOJE dos registros de sessões passadas reais
  const regsHoje = regsArea.filter(r => isRegistroDeHoje(r));
  const regsPassados = regsArea.filter(r => !isRegistroDeHoje(r));

  // CASO A: Esta área JÁ FOI GRAVADA HOJE no prontuário!
  if (regsHoje.length > 0) {
    return regsHoje.map((reg, idx) => {
      let rotulo = `Sub-Zona ${idx + 1}`;
      const matchBrackets = String(reg.area || "").match(/\[(.*?)\]/);
      const matchParens = String(reg.area || "").match(/\((.*?)\)/);
      if (matchBrackets) {
        rotulo = matchBrackets[1].trim();
      } else if (matchParens) {
        rotulo = matchParens[1].trim();
      } else if (idx === 0) {
        rotulo = "Geral";
      }

      let energiaHoje = reg.energia || "";
      if (!energiaHoje && reg.observacao) {
        const matchEnergia = reg.observacao.match(/\b(\d{2,3})\s*(?:j|ft|joules)?\b/i);
        if (matchEnergia) energiaHoje = matchEnergia[1];
      }

      const anteriorReg = regsPassados[idx] || regsPassados[0] || null;
      let energiaAnterior = anteriorReg?.energia || "";
      if (!energiaAnterior && anteriorReg?.observacao) {
        const matchEnergia = anteriorReg.observacao.match(/\b(\d{2,3})\s*(?:j|ft|joules)?\b/i);
        if (matchEnergia) energiaAnterior = matchEnergia[1];
      }

      const temAnterior = String(energiaAnterior || "").trim() !== "" && parseFloat(energiaAnterior) > 0;
      const freqNum = parseFloat(String(reg.frequencia || "0.8").replace(",", ".")) || 0.8;
      const disparosNum = parseInt(reg.qtd_disparos, 10) || 150;

      const obsTexto = String(reg.observacao || reg.obs || "").toUpperCase();
      const isNaoRealizadaHoje = obsTexto.includes("NÃO REALIZADA") || 
                                 obsTexto.includes("NAO REALIZADA") ||
                                 obsTexto.includes("NÃO FEITO") ||
                                 obsTexto.includes("NAO FEITO");

      return {
        rotulo: rotulo,
        fototipo: reg.fototipo || anteriorReg?.fototipo || "IV",
        modo: reg.modo_aplicacao || anteriorReg?.modo_aplicacao || "HR",
        energiaValor: String(energiaHoje),
        energiaAnterior: temAnterior ? String(energiaAnterior) : "",
        temEnergiaAnterior: temAnterior,
        jaSalvoHoje: true,
        isNaoRealizadaHoje: isNaoRealizadaHoje,
        freqNum: freqNum,
        disparosNum: disparosNum,
        obs: reg.observacao || "",
        origEnergia: temAnterior ? parseFloat(energiaAnterior) : 0,
        origFototipo: anteriorReg?.fototipo || reg.fototipo || "IV",
        origModo: anteriorReg?.modo_aplicacao || reg.modo_aplicacao || "HR",
        origFreq: freqNum,
        origDisparos: disparosNum
      };
    });
  }

  // CASO B: Parâmetros ainda NÃO foram gravados hoje — usa a sessão anterior mais recente
  const primeiraData = regsPassados[0]?.data_hora || regsArea[0]?.data_hora;
  const diaMaisRecente = primeiraData ? primeiraData.split(" ")[0] : "";
  const regsUltimaSessao = diaMaisRecente 
    ? regsPassados.filter(r => r.data_hora && r.data_hora.startsWith(diaMaisRecente))
    : (regsPassados.length > 0 ? [regsPassados[0]] : [regsArea[0]]);

  // Divisão em sub-zonas na sessão anterior
  if (regsUltimaSessao.length >= 2) {
    return regsUltimaSessao.map((reg, idx) => {
      let rotulo = `Sub-Zona ${idx + 1}`;
      const matchBrackets = String(reg.area || "").match(/\[(.*?)\]/);
      const matchParens = String(reg.area || "").match(/\((.*?)\)/);
      if (matchBrackets) {
        rotulo = matchBrackets[1].trim();
      } else if (matchParens) {
        rotulo = matchParens[1].trim();
      } else if (idx === 0) {
        rotulo = "Geral";
      } else {
        rotulo = `Sub-Zona ${idx + 1}`;
      }

      let energiaEncontrada = reg.energia || "";
      if (!energiaEncontrada && reg.observacao) {
        const matchEnergia = reg.observacao.match(/\b(\d{2,3})\s*(?:j|ft|joules)?\b/i);
        if (matchEnergia) energiaEncontrada = matchEnergia[1];
      }

      const temEnergia = String(energiaEncontrada || "").trim() !== "" && parseFloat(energiaEncontrada) > 0;
      const freqNum = parseFloat(String(reg.frequencia || "0.8").replace(",", ".")) || 0.8;
      const disparosNum = parseInt(reg.qtd_disparos, 10) || 150;

      return {
        rotulo: rotulo,
        fototipo: reg.fototipo || "IV",
        modo: reg.modo_aplicacao || "HR",
        energiaValor: temEnergia ? String(energiaEncontrada) : "",
        energiaAnterior: temEnergia ? String(energiaEncontrada) : "",
        temEnergiaAnterior: temEnergia,
        jaSalvoHoje: false,
        freqNum: freqNum,
        disparosNum: disparosNum,
        obs: "",
        origEnergia: temEnergia ? parseFloat(energiaEncontrada) : 0,
        origFototipo: reg.fototipo || "IV",
        origModo: reg.modo_aplicacao || "HR",
        origFreq: freqNum,
        origDisparos: disparosNum
      };
    });
  }

  // Sessão anterior única
  const regUnico = regsUltimaSessao[0];
  let energiaEncontrada = regUnico.energia || "";
  if (!energiaEncontrada && regUnico.observacao) {
    const matchEnergia = regUnico.observacao.match(/\b(\d{2,3})\s*(?:j|ft|joules)?\b/i);
    if (matchEnergia) energiaEncontrada = matchEnergia[1];
  }

  const temEnergia = String(energiaEncontrada || "").trim() !== "" && parseFloat(energiaEncontrada) > 0;
  const freqNum = parseFloat(String(regUnico.frequencia || "0.8").replace(",", ".")) || 0.8;
  const disparosNum = parseInt(regUnico.qtd_disparos, 10) || 200;

  const matchBrackets = String(regUnico.area || "").match(/\[(.*?)\]/);
  const rotulo = matchBrackets ? matchBrackets[1].trim() : "Geral";

  return [{
    rotulo: rotulo,
    fototipo: regUnico.fototipo || "IV",
    modo: regUnico.modo_aplicacao || "HR",
    energiaValor: temEnergia ? String(energiaEncontrada) : "",
    energiaAnterior: temEnergia ? String(energiaEncontrada) : "",
    temEnergiaAnterior: temEnergia,
    jaSalvoHoje: false,
    freqNum: freqNum,
    disparosNum: disparosNum,
    obs: "",
    origEnergia: temEnergia ? parseFloat(energiaEncontrada) : 0,
    origFototipo: regUnico.fototipo || "IV",
    origModo: regUnico.modo_aplicacao || "HR",
    origFreq: freqNum,
    origDisparos: disparosNum
  }];
}

export function coletarParametrosDosFormularios() {
  const formCards = document.querySelectorAll(".atend-param-form-card");
  if (!formCards || formCards.length === 0) return [];

  const app = state.selectedAppointment;
  const d = new Date();
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  const hora = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const seg = String(d.getSeconds()).padStart(2, "0");
  const dataRef = state.currentDataAgenda || `${ano}-${mes}-${dia}`;
  const hojeStr = `${dataRef} ${hora}:${min}:${seg}`;

  const listaParaSalvar = [];
  formCards.forEach(card => {
    const codServ = card.getAttribute("data-cod-serv") || "";
    const codAgendamento = card.getAttribute("data-cod-agendamento") || String(app?.codConsulta || app?.id || "");
    const areaNome = card.getAttribute("data-area-nome") || "Área";
    const areaFormatada = card.getAttribute("data-area-formatada") || areaNome;
    const status = card.getAttribute("data-status") || "realizada";
    const isRealizada = status === "realizada";

    if (!isRealizada) {
      const removerDoAgendamento = card.querySelector(".chk-remover-agendamento") ? card.querySelector(".chk-remover-agendamento").checked : true;
      const skipObs = card.querySelector(".param-skip-obs")?.value?.trim() || "";
      const observacaoFinal = skipObs ? (skipObs.startsWith("NÃO REALIZADA") ? skipObs : `NÃO REALIZADA: ${skipObs}`) : "NÃO REALIZADA HOJE";

      listaParaSalvar.push({
        cod_paciente: String(app?.codCliente || ""),
        codAgendamento: codAgendamento,
        data_hora: hojeStr,
        area: areaFormatada,
        codServ: codServ,
        fototipo: "IV",
        modo_aplicacao: "HR",
        energia: "",
        semEnergiaDefinida: false,
        frequencia: "",
        largura_pulso: "",
        qtd_disparos: "0",
        observacao: observacaoFinal,
        obs: observacaoFinal,
        profissional: app?.profissional || state.currentUserName || "Profissional",
        isRealizada: false,
        status: status,
        removerDoAgendamento: removerDoAgendamento,
        isSemEvolucao: false,
        origEnergia: 0,
        currentEnergia: 0,
        nomeArea: areaNome
      });
      return;
    }

    // Área Realizada: itera sobre cada subzona do card
    const subzonaItems = card.querySelectorAll(".param-subzona-item");
    const temMultiplasSubzonas = subzonaItems.length > 1;

    subzonaItems.forEach((subItem, subIdx) => {
      const rotulo = subItem.querySelector(".subzona-rotulo-input")?.value?.trim() || (temMultiplasSubzonas ? (subIdx === 0 ? "Geral" : `Sub-Zona ${subIdx + 1}`) : "");
      const fototipo = subItem.querySelector(".param-fototipo")?.value || "IV";
      const modo = subItem.querySelector(".param-modo")?.value || "HR";
      const energia = (subItem.querySelector(".param-energia")?.value || "").trim();
      const frequencia = subItem.querySelector(".param-frequencia")?.value || "0,8";
      const disparos = subItem.querySelector(".param-disparos")?.value || "200";
      const obsSub = (subItem.querySelector(".param-obs") || card.querySelector(".param-obs"))?.value?.trim() || "";

      const origEnergia = parseFloat(subItem.getAttribute("data-orig-energia")) || 0;
      const currentEnergiaNum = parseFloat(energia) || 0;
      const isSemEvolucao = isRealizada && (origEnergia > 0 && currentEnergiaNum <= origEnergia);

      const areaParaSalvar = temMultiplasSubzonas && rotulo
        ? `${areaFormatada} [${rotulo}]`
        : areaFormatada;

      const nomeAreaExibicao = temMultiplasSubzonas && rotulo
        ? `${areaNome} [${rotulo}]`
        : areaNome;

      const obsFinal = obsSub 
        ? (temMultiplasSubzonas && rotulo ? `[${rotulo}] ${obsSub}` : obsSub)
        : (temMultiplasSubzonas && rotulo ? `[${rotulo}]` : "");

      listaParaSalvar.push({
        cod_paciente: String(app?.codCliente || ""),
        codAgendamento: codAgendamento,
        data_hora: hojeStr,
        area: areaParaSalvar,
        codServ: codServ,
        subRotulo: rotulo,
        fototipo: fototipo,
        modo_aplicacao: modo,
        energia: String(energia),
        semEnergiaDefinida: !(currentEnergiaNum > 0),
        frequencia: String(frequencia).replace(".", ","),
        largura_pulso: "",
        qtd_disparos: String(disparos),
        observacao: obsFinal,
        obs: obsFinal,
        profissional: app?.profissional || state.currentUserName || "Profissional",
        isRealizada: true,
        status: status,
        removerDoAgendamento: false,
        isSemEvolucao: isSemEvolucao,
        origEnergia: origEnergia,
        currentEnergia: currentEnergiaNum,
        nomeArea: nomeAreaExibicao
      });
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
