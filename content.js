// Belle Software - Content Script para o Auxiliar de Agenda (ISOLATED World)

// =========================================================
// 1. EXTRAÇÃO E NORMALIZAÇÃO DE DATAS DA PÁGINA
// =========================================================
function formatarParaIso(dataStr) {
  if (!dataStr) return null;
  const s = String(dataStr).trim();

  // Caso 1: Formato ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }

  // Caso 2: Formato Brasileiro DD/MM/YYYY
  const matchBr = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (matchBr) {
    const dia = matchBr[1].padStart(2, "0");
    const mes = matchBr[2].padStart(2, "0");
    const ano = matchBr[3];
    return `${ano}-${mes}-${dia}`;
  }

  // Caso 3: Formato com texto (ex: "29 de Agosto de 2026" ou "29 Ago 2026")
  const meses = {
    jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
    jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
    janeiro: "01", fevereiro: "02", marco: "03", abril: "04", maio: "05", junho: "06",
    julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12"
  };
  const matchTexto = s.toLowerCase().match(/(\d{1,2})\s*(?:de|\/|-)?\s*([a-zçãé]{3,9})\s*(?:de|\/|-)?\s*(\d{4})/);
  if (matchTexto) {
    const dia = matchTexto[1].padStart(2, "0");
    const mesTxt = matchTexto[2].normalize("NFD").replace(/[\u0300-\u036f]/g, "").substring(0, 3);
    const mes = meses[mesTxt] || "01";
    const ano = matchTexto[3];
    return `${ano}-${mes}-${dia}`;
  }

  return null;
}

function extrairDataAgendaPagina() {
  try {
    // 0. Data gravada pelo interceptor na raiz HTML
    const attrData = document.documentElement.getAttribute("data-belle-agenda-date");
    if (attrData && /^\d{4}-\d{2}-\d{2}$/.test(attrData)) {
      return attrData;
    }

    // 1. Inputs visíveis de data / calendário do Belle
    const dateInputs = document.querySelectorAll(
      'input[type="date"], input.datepicker, input.date-picker, #dtAgenda, #dataAgenda, #data_agenda, input[name*="data"], input[name*="dt"], input[ng-model*="data"], input[ng-model*="dt"]'
    );
    for (const inp of dateInputs) {
      if (inp.value) {
        const iso = formatarParaIso(inp.value);
        if (iso) return iso;
      }
    }

    // 2. Elementos de cabeçalho da agenda (dhtmlx, fullcalendar, custom)
    const headerDateElements = document.querySelectorAll(
      '.dhx_cal_date, .fc-toolbar-title, .fc-header-title, .agenda-date, .current-date, .data-atual, [class*="calendar-date"], [class*="agenda-date"], .header-data, .titulo-agenda-data'
    );
    for (const el of headerDateElements) {
      const text = el.textContent?.trim() || "";
      const match = text.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/) || text.match(/\b\d{4}-\d{2}-\d{2}\b/);
      if (match) {
        const iso = formatarParaIso(match[0]);
        if (iso) return iso;
      }
      const isoTexto = formatarParaIso(text);
      if (isoTexto) return isoTexto;
    }

    // 3. Parâmetros na URL (?data=... ou ?dt=...)
    const urlParams = new URLSearchParams(window.location.search);
    const urlDate = urlParams.get("data") || urlParams.get("dt") || urlParams.get("dtIni") || urlParams.get("date");
    if (urlDate) {
      const iso = formatarParaIso(urlDate);
      if (iso) return iso;
    }

    // 4. LocalStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.toLowerCase().includes("agenda") || key.toLowerCase().includes("data") || key.toLowerCase().includes("date"))) {
        const val = localStorage.getItem(key);
        if (val) {
          const iso = formatarParaIso(val);
          if (iso) return iso;
        }
      }
    }

    // 5. Procura no topo do texto da página
    const topText = document.body.innerText ? document.body.innerText.substring(0, 2000) : "";
    const matchTop = topText.match(/\b\d{2}\/\d{2}\/\d{4}\b/);
    if (matchTop) {
      const iso = formatarParaIso(matchTop[0]);
      if (iso) return iso;
    }
  } catch (e) {
    console.warn("[Agenda Assistant] Erro ao extrair data da página:", e);
  }

  return null;
}

function extrairContextoPagina() {
  const result = {
    codEstab: 1,
    codUsuario: "master-admin",
    userName: null,
    dataAgenda: extrairDataAgendaPagina(),
    url: window.location.href,
    localStorage: {},
    auth: null
  };

  try {
    const matchEstab = window.location.pathname.match(/\/u\/(\d+)/);
    if (matchEstab) {
      result.codEstab = parseInt(matchEstab[1], 10);
    }

    const userElement = document.querySelector(
      ".user-profile-name, .user-name, .header-user, #nomUsuario, .nome-usuario, .user-info-name"
    );
    if (userElement && userElement.textContent) {
      result.userName = userElement.textContent.trim();
    }

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        result.localStorage[key] = localStorage.getItem(key);
      }
    }

    const tokenAttr = document.documentElement.getAttribute("data-belle-token");
    let tokenFromStorage = null;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith("token") || k.toLowerCase().includes("auth"))) {
          const val = localStorage.getItem(k);
          if (val && val.length > 10) {
            tokenFromStorage = val;
            break;
          }
        }
      }
    } catch(e) {}

    const finalToken = tokenAttr || tokenFromStorage;
    if (finalToken) {
      result.auth = {
        token: finalToken,
        user: result.codUsuario,
        etb: result.codEstab
      };
    }
  } catch (e) {
    console.warn("[Agenda Assistant] Erro ao extrair contexto:", e);
  }

  return result;
}

const defaultArrGrid = [
  {
    "id_geinfo": 114411,
    "codigo": 989472,
    "login": "master-admin",
    "cod_tipo": 1,
    "cod_sala": 58770,
    "todos": "1",
    "id": 58770,
    "cod_clinica": "1",
    "nom_clinica": "ESTETICA E LASER LINHARES",
    "nome": "AVALIAÇÃO NOVOS CLIENTES",
    "tempo": "5",
    "limite": 2,
    "foto": "",
    "title": "AVALIAÇÃO NOVOS CLIENTES",
    "businessHours": [
      {"daysOfWeek":[1],"startTime":"07:50","endTime":"12:00"},
      {"daysOfWeek":[1],"startTime":"12:00","endTime":"20:10"},
      {"daysOfWeek":[2],"startTime":"07:50","endTime":"12:00"},
      {"daysOfWeek":[2],"startTime":"12:00","endTime":"20:10"},
      {"daysOfWeek":[3],"startTime":"07:50","endTime":"12:00"},
      {"daysOfWeek":[3],"startTime":"12:00","endTime":"20:10"},
      {"daysOfWeek":[4],"startTime":"07:50","endTime":"12:00"},
      {"daysOfWeek":[4],"startTime":"12:00","endTime":"20:10"},
      {"daysOfWeek":[5],"startTime":"07:50","endTime":"12:00"},
      {"daysOfWeek":[5],"startTime":"12:00","endTime":"20:10"},
      {"daysOfWeek":[6],"startTime":"07:50","endTime":"17:00"}
    ]
  },
  {
    "id_geinfo": 114411,
    "codigo": 989473,
    "login": "master-admin",
    "cod_tipo": 2,
    "cod_sala": 7451,
    "todos": "1",
    "id": 7451,
    "cod_clinica": "1",
    "nom_clinica": "ESTETICA E LASER LINHARES",
    "nome": "TRATAMENTO ND YAG",
    "tempo": "10",
    "limite": 2,
    "foto": "",
    "title": "TRATAMENTO ND YAG",
    "businessHours": [
      {"daysOfWeek":[1],"startTime":"07:50","endTime":"12:00"},
      {"daysOfWeek":[1],"startTime":"12:00","endTime":"20:10"},
      {"daysOfWeek":[2],"startTime":"07:50","endTime":"12:00"},
      {"daysOfWeek":[2],"startTime":"12:00","endTime":"20:10"},
      {"daysOfWeek":[3],"startTime":"07:50","endTime":"12:00"},
      {"daysOfWeek":[3],"startTime":"12:00","endTime":"20:10"},
      {"daysOfWeek":[4],"startTime":"07:50","endTime":"12:00"},
      {"daysOfWeek":[4],"startTime":"12:00","endTime":"20:10"},
      {"daysOfWeek":[5],"startTime":"07:50","endTime":"12:00"},
      {"daysOfWeek":[5],"startTime":"12:00","endTime":"20:10"},
      {"daysOfWeek":[6],"startTime":"07:50","endTime":"17:00"}
    ]
  },
  {
    "id_geinfo": 114411,
    "codigo": 989474,
    "login": "master-admin",
    "cod_tipo": 2,
    "cod_sala": 32147,
    "todos": "1",
    "id": 32147,
    "cod_clinica": "1",
    "nom_clinica": "ESTETICA E LASER LINHARES",
    "nome": "SALA DEPILAÇÃO A LASER oficial -01",
    "tempo": "5",
    "limite": 1,
    "foto": "",
    "title": "SALA DEPILAÇÃO A LASER oficial -01",
    "businessHours": [
      {"daysOfWeek":[1],"startTime":"08:00","endTime":"19:00"},
      {"daysOfWeek":[2],"startTime":"08:00","endTime":"19:00"},
      {"daysOfWeek":[3],"startTime":"08:00","endTime":"19:00"},
      {"daysOfWeek":[4],"startTime":"08:00","endTime":"19:00"},
      {"daysOfWeek":[5],"startTime":"08:00","endTime":"19:00"},
      {"daysOfWeek":[6],"startTime":"08:00","endTime":"16:00"}
    ]
  }
];

function montarArrGridDeGridSala(gridSalas, codEstab = "1") {
  if (!Array.isArray(gridSalas) || gridSalas.length === 0) return [];
  return gridSalas.map((g, idx) => ({
    id_geinfo: g.id_geinfo || 103868,
    codigo: g.codigo || (922280 + idx),
    login: g.login || "master-admin",
    cod_tipo: g.cod_tipo || 2,
    cod_sala: Number(g.cod_sala || g.id || 0),
    todos: "1",
    id: Number(g.cod_sala || g.id || 0),
    cod_clinica: String(g.cod_clinica || codEstab || "1"),
    nom_clinica: g.nom_clinica || "",
    nome: g.nome || g.title || "",
    tempo: String(g.tempo || "5"),
    limite: g.limite || 1,
    foto: g.foto || "",
    title: g.title || g.nome || "",
    businessHours: g.businessHours || [
      { daysOfWeek: [1], startTime: "07:50", endTime: "12:00" },
      { daysOfWeek: [1], startTime: "12:00", endTime: "20:10" },
      { daysOfWeek: [2], startTime: "07:50", endTime: "12:00" },
      { daysOfWeek: [2], startTime: "12:00", endTime: "20:10" },
      { daysOfWeek: [3], startTime: "07:50", endTime: "12:00" },
      { daysOfWeek: [3], startTime: "12:00", endTime: "20:10" },
      { daysOfWeek: [4], startTime: "07:50", endTime: "12:00" },
      { daysOfWeek: [4], startTime: "12:00", endTime: "20:10" },
      { daysOfWeek: [5], startTime: "07:50", endTime: "12:00" },
      { daysOfWeek: [5], startTime: "12:00", endTime: "20:10" },
      { daysOfWeek: [6], startTime: "07:50", endTime: "17:00" }
    ]
  }));
}

// Executa a requisição de gridsala no contexto da aba ativa do Belle
async function executarRequisicaoGridSalaNaPagina(codEstab) {
  const matchEstab = window.location.pathname.match(/\/u\/(\d+)/);
  const etb = codEstab || (matchEstab ? matchEstab[1] : "1");

  let token = "";
  const cookieMatch = document.cookie.match(new RegExp(`(?:^|; )token_${etb}=([^;]*)`)) || 
                      document.cookie.match(/(?:^|; )token=([^;]*)/);
  if (cookieMatch) token = cookieMatch[1];
  if (!token) {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.includes(`token_${etb}`) || k === "token" || k === "authToken")) {
        token = localStorage.getItem(k);
        break;
      }
    }
  }

  const url = `https://app.bellesoftware.com.br/api/release/controller/Agenda/v1.0/gridsala?etb=${etb}&restringe=0&estabGeral=1`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "authorization": token,
      "accept": "application/json, text/plain, */*"
    }
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

// Executa a requisição oficial da agenda exatamente no contexto da aba ativa do Belle
async function executarRequisicaoAgendaNaPagina(dataAgenda, codEstab) {
  const matchEstab = window.location.pathname.match(/\/u\/(\d+)/);
  const etb = codEstab || (matchEstab ? matchEstab[1] : "1");

  // Localiza o token exato da unidade nos cookies da página
  let token = "";
  const cookieMatch = document.cookie.match(new RegExp(`(?:^|; )token_${etb}=([^;]*)`)) || 
                      document.cookie.match(/(?:^|; )token=([^;]*)/);
  if (cookieMatch) token = cookieMatch[1];
  if (!token) {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.includes(`token_${etb}`) || k === "token" || k === "authToken")) {
        token = localStorage.getItem(k);
        break;
      }
    }
  }

  // Obtém o grid de salas específico desta unidade
  let currentGrid = null;
  if (lastInterceptedArrGrid && lastInterceptedArrGrid.length > 0 && String(lastInterceptedArrGrid[0].cod_clinica) === String(etb)) {
    currentGrid = lastInterceptedArrGrid;
  } else {
    try {
      const gridSalas = await executarRequisicaoGridSalaNaPagina(etb);
      if (Array.isArray(gridSalas) && gridSalas.length > 0) {
        currentGrid = montarArrGridDeGridSala(gridSalas, etb);
        lastInterceptedArrGrid = currentGrid;
      }
    } catch (err) {}
  }

  if (!currentGrid || currentGrid.length === 0) {
    currentGrid = defaultArrGrid;
  }

  const payload = {
    tp: "0",
    canc: false,
    finan: false,
    codCli: "",
    finaliz: false,
    corInad: "#e19999",
    arrGrid: currentGrid,
    semFinan: false,
    tpAgenda: "sala",
    dtAgenda: `${dataAgenda}, 00:00:00`,
    corAgenda: "ct",
    semFinaliz: false,
    destacarInad: "1",
    destacarPendCont: 1,
    corPendContrato: "#6b86dd",
    corAgendSemQuest: "#e1d783",
    destacarNaoPreencQuest: 1,
    verTodas: 1,
    exibir_pc_agenda: "1",
    destacarNomeInad: "1",
    teleatendimento: 0,
    etb: String(etb)
  };

  const response = await fetch("https://app.bellesoftware.com.br/api/release/controller/Agenda/v1.0/agendaapi?estabGeral=1", {
    method: "POST",
    headers: {
      "authorization": token,
      "content-type": "text/plain",
      "accept": "application/json, text/plain, */*"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const json = await response.json();
  return json;
}

// Executa a requisição de salas no contexto da aba ativa do Belle
async function executarRequisicaoSalasNaPagina(diaSemana, codEstab) {
  const matchEstab = window.location.pathname.match(/\/u\/(\d+)/);
  const etb = codEstab || (matchEstab ? matchEstab[1] : "1");

  let token = "";
  const cookieMatch = document.cookie.match(new RegExp(`(?:^|; )token_${etb}=([^;]*)`)) || 
                      document.cookie.match(/(?:^|; )token=([^;]*)/);
  if (cookieMatch) token = cookieMatch[1];
  if (!token) {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.includes(`token_${etb}`) || k === "token" || k === "authToken")) {
        token = localStorage.getItem(k);
        break;
      }
    }
  }

  const url = `https://app.bellesoftware.com.br/api/release/controller/Agenda/v1.0/salas?dia=${diaSemana}&etb=${etb}&restrito=0&tp=2&estabGeral=1`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "authorization": token,
      "accept": "application/json, text/plain, */*"
    }
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

// Executa a requisição de get_servicos do atendimento
async function executarRequisicaoGetServicosNaPagina(codConsulta, codEstab) {
  const matchEstab = window.location.pathname.match(/\/u\/(\d+)/);
  const etb = codEstab || (matchEstab ? matchEstab[1] : "1");

  let token = "";
  const cookieMatch = document.cookie.match(new RegExp(`(?:^|; )token_${etb}=([^;]*)`)) || 
                      document.cookie.match(/(?:^|; )token=([^;]*)/);
  if (cookieMatch) token = cookieMatch[1];
  if (!token) {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.includes(`token_${etb}`) || k === "token" || k === "authToken")) {
        token = localStorage.getItem(k);
        break;
      }
    }
  }

  const url = `https://app.bellesoftware.com.br/api/release/controller/PainelAtend/v1.0/get_servicos/${codConsulta}?estabGeral=1`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "authorization": token,
      "accept": "application/json, text/plain, */*"
    }
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

// Executa a requisição de parametro_laser do cliente
async function executarRequisicaoParametrosLaserNaPagina(codCliente, codEstab) {
  const matchEstab = window.location.pathname.match(/\/u\/(\d+)/);
  const etb = codEstab || (matchEstab ? matchEstab[1] : "1");

  let token = "";
  const cookieMatch = document.cookie.match(new RegExp(`(?:^|; )token_${etb}=([^;]*)`)) || 
                      document.cookie.match(/(?:^|; )token=([^;]*)/);
  if (cookieMatch) token = cookieMatch[1];
  if (!token) {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.includes(`token_${etb}`) || k === "token" || k === "authToken")) {
        token = localStorage.getItem(k);
        break;
      }
    }
  }

  const url = `https://app.bellesoftware.com.br/api/release/controller/PainelAtend/v1.0/parametro_laser?dataIni=2021-01-01T03:00:00.000Z&dataFim=2026-08-29T03:00:00.000Z&area=&desconsiderar=true&limit=20&offset=0&descData=1&sortField=data_hora&sortOrder=-1&cliente=${codCliente}&estabGeral=1`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "authorization": token,
      "accept": "application/json, text/plain, */*"
    }
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

// Responde a solicitações vindas do Side Panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_BELLE_PAGE_CONTEXT") {
    sendResponse(extrairContextoPagina());
    return true;
  }

  if (request.action === "BELLE_FETCH_AGENDA_IN_PAGE") {
    executarRequisicaoAgendaNaPagina(request.dataAgenda, request.codEstab)
      .then(data => sendResponse({ success: true, data: data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "BELLE_FETCH_SALAS_IN_PAGE") {
    executarRequisicaoSalasNaPagina(request.diaSemana, request.codEstab)
      .then(data => sendResponse({ success: true, data: data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "BELLE_FETCH_GRIDSALA_IN_PAGE") {
    executarRequisicaoGridSalaNaPagina(request.codEstab)
      .then(data => sendResponse({ success: true, data: data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "BELLE_FETCH_GET_SERVICOS_IN_PAGE") {
    executarRequisicaoGetServicosNaPagina(request.codConsulta, request.codEstab)
      .then(data => sendResponse({ success: true, data: data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "BELLE_FETCH_PARAMETROS_LASER_IN_PAGE") {
    executarRequisicaoParametrosLaserNaPagina(request.codCliente, request.codEstab)
      .then(data => sendResponse({ success: true, data: data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "BELLE_FETCH_SALDO_VENDA_PLANO_IN_PAGE") {
    executarRequisicaoSaldoVendaPlanoNaPagina(request.codOrc, request.codPlano, request.idGeinfo, request.codEstab)
      .then(data => sendResponse({ success: true, data: data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "BELLE_SALVAR_PARAMETRO_LASER_IN_PAGE") {
    executarInclusaoParametroLaserNaPagina(request.payload, request.codEstab)
      .then(data => sendResponse({ success: true, data: data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "BELLE_FETCH_DETALHES_AGENDA_IN_PAGE") {
    executarConsultaDetalhesAgendaNaPagina(request.codAgenda, request.codEstab)
      .then(data => sendResponse({ success: true, data: data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "BELLE_SALVAR_EDICAO_AGENDA_IN_PAGE") {
    executarEdicaoAgendaNaPagina(request.payload, request.codEstab)
      .then(data => sendResponse({ success: true, data: data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "BELLE_VALIDAR_AGENDAMENTO_IN_PAGE") {
    executarValidarAgendamentoNaPagina(request.codConsulta, request.codEstab)
      .then(data => sendResponse({ success: true, data: data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "BELLE_FINALIZAR_ATENDIMENTO_IN_PAGE") {
    executarFinalizarAtendimentoNaPagina(request.codConsulta, request.codEstab)
      .then(data => sendResponse({ success: true, data: data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "BELLE_FETCH_PARAMETROS_EMPRESA_IN_PAGE") {
    executarConsultaParametrosEmpresaNaPagina(request.codEstab)
      .then(data => sendResponse({ success: true, data: data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "BELLE_NAVIGATE_DATE_IN_PAGE") {
    const dataIso = request.dataIso;
    const dataBr = request.dataBr || (function(iso) {
      if (!iso) return "";
      const [y, m, d] = iso.split("-");
      return `${d}/${m}/${y}`;
    })(dataIso);

    console.log("[Agenda Assistant] 🧭 Disparando clique na data no PrimeNG do Belle:", dataIso, dataBr);

    // 1. Repassa para o interceptor no MAIN world (execução no contexto da página)
    window.postMessage({
      type: "BELLE_NAVIGATE_DATE_MAIN",
      dataIso: dataIso,
      dataBr: dataBr
    }, "*");

    // 2. Também tenta no contexto Isolated
    try {
      selecionarDataNoPrimeNGContent(dataIso);
    } catch(e) {}

    sendResponse({ success: true });
    return true;
  }
});

function selecionarDataNoPrimeNGContent(dataIso) {
  if (!dataIso || !/^\d{4}-\d{2}-\d{2}$/.test(dataIso)) return;
  const [y, m, d] = dataIso.split("-").map(Number);
  const targetYear = y;
  const targetMonthIndex = m - 1;
  const targetDay = d;

  const MESES_MAP = {
    "janeiro": 0, "jan": 0, "fevereiro": 1, "fev": 1,
    "marco": 2, "março": 2, "mar": 2, "abril": 3, "abr": 3,
    "maio": 4, "mai": 4, "junho": 5, "jun": 5,
    "julho": 6, "jul": 6, "agosto": 7, "ago": 7,
    "setembro": 8, "set": 8, "outubro": 9, "out": 9,
    "novembro": 10, "nov": 10, "dezembro": 11, "dez": 11
  };

  let stepCount = 0;
  const maxSteps = 40;

  function step() {
    stepCount++;
    if (stepCount > maxSteps) return;

    let datepickerPanel = document.querySelector('.p-datepicker-panel, p-datepicker');
    if (!datepickerPanel || datepickerPanel.offsetParent === null) {
      const trigger = document.querySelector('.data-atual, button.data-atual, [class*="data-atual"], .titulo-agenda-data, .header-data, [aria-label*="Choose Date"]');
      if (trigger) {
        trigger.click();
        setTimeout(step, 90);
        return;
      }
    }

    const monthBtn = document.querySelector('.p-datepicker-select-month, [aria-label="Choose Month"]');
    const yearBtn = document.querySelector('.p-datepicker-select-year, [aria-label="Choose Year"]');
    const nextBtn = document.querySelector('.p-datepicker-next-button, [aria-label="Next Month"], p-button[styleclass*="p-datepicker-next-button"] button, p-button.p-datepicker-next-button button');
    const prevBtn = document.querySelector('.p-datepicker-prev-button, [aria-label="Previous Month"], p-button[styleclass*="p-datepicker-prev-button"] button, p-button.p-datepicker-prev-button button');

    if (monthBtn && yearBtn) {
      const currentYear = parseInt(yearBtn.textContent.trim(), 10) || targetYear;
      const monthTxt = (monthBtn.textContent || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      let currentMonthIndex = -1;
      for (const [nome, idx] of Object.entries(MESES_MAP)) {
        if (monthTxt.includes(nome)) {
          currentMonthIndex = idx;
          break;
        }
      }

      if (currentMonthIndex !== -1 && !isNaN(currentYear)) {
        if (currentYear < targetYear || (currentYear === targetYear && currentMonthIndex < targetMonthIndex)) {
          if (nextBtn) {
            nextBtn.click();
            setTimeout(step, 80);
            return;
          }
        } else if (currentYear > targetYear || (currentYear === targetYear && currentMonthIndex > targetMonthIndex)) {
          if (prevBtn) {
            prevBtn.click();
            setTimeout(step, 80);
            return;
          }
        }
      }
    }

    const targetDataDate = `${targetYear}-${targetMonthIndex}-${targetDay}`;
    const possiveisDatas = [
      targetDataDate,
      `${targetYear}-${m}-${targetDay}`,
      `${targetYear}-${String(targetMonthIndex).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`,
      `${targetYear}-${String(m).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`
    ];

    let cell = null;
    for (const dd of possiveisDatas) {
      const found = document.querySelector(`.p-datepicker-day[data-date="${dd}"], [data-date="${dd}"]`);
      if (found && !found.closest('.p-datepicker-other-month')) {
        cell = found;
        break;
      }
    }

    if (!cell) {
      const validDayCells = document.querySelectorAll('tbody tr td:not(.p-datepicker-other-month) .p-datepicker-day, tbody tr td:not(.p-datepicker-other-month)');
      for (const sp of validDayCells) {
        if (sp.textContent.trim() === String(targetDay)) {
          cell = sp.classList.contains('p-datepicker-day') ? sp : (sp.querySelector('.p-datepicker-day') || sp);
          break;
        }
      }
    }

    if (cell) {
      cell.click();
      cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      cell.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      cell.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

      const parentTd = cell.closest('td');
      if (parentTd) {
        parentTd.click();
        parentTd.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      }
      return;
    }

    setTimeout(step, 90);
  }

  step();
}

// Consulta parâmetros gerais da empresa (logo_empresa, configurações)
async function executarConsultaParametrosEmpresaNaPagina(codEstab) {
  const matchEstab = window.location.pathname.match(/\/u\/(\d+)/);
  const etb = codEstab || (matchEstab ? matchEstab[1] : "1");

  let token = "";
  const cookieMatch = document.cookie.match(new RegExp(`(?:^|; )token_${etb}=([^;]*)`)) || 
                      document.cookie.match(/(?:^|; )token=([^;]*)/);
  if (cookieMatch) token = cookieMatch[1];
  if (!token) {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.includes(`token_${etb}`) || k === "token" || k === "authToken")) {
        token = localStorage.getItem(k);
        break;
      }
    }
  }

  const url = `https://app.bellesoftware.com.br/api/release/controller/Parametros/v1.0/parametros?estabGeral=`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "authorization": token,
      "accept": "application/json, text/plain, */*"
    }
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

// Valida agendamento no Painel de Atendimento (validar_agendamento)
async function executarValidarAgendamentoNaPagina(codConsulta, codEstab) {
  const matchEstab = window.location.pathname.match(/\/u\/(\d+)/);
  const etb = codEstab || (matchEstab ? matchEstab[1] : "1");

  let token = "";
  const cookieMatch = document.cookie.match(new RegExp(`(?:^|; )token_${etb}=([^;]*)`)) || 
                      document.cookie.match(/(?:^|; )token=([^;]*)/);
  if (cookieMatch) token = cookieMatch[1];
  if (!token) {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.includes(`token_${etb}`) || k === "token" || k === "authToken")) {
        token = localStorage.getItem(k);
        break;
      }
    }
  }

  const url = `https://app.bellesoftware.com.br/api/release/controller/PainelAtend/v1.0/validar_agendamento/${codConsulta}?estabGeral=1`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "authorization": token,
      "accept": "application/json, text/plain, */*"
    }
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

// Finaliza o atendimento no Belle (PUT /atendimento)
async function executarFinalizarAtendimentoNaPagina(codConsulta, codEstab) {
  const matchEstab = window.location.pathname.match(/\/u\/(\d+)/);
  const etb = codEstab || (matchEstab ? matchEstab[1] : "1");

  let token = "";
  const cookieMatch = document.cookie.match(new RegExp(`(?:^|; )token_${etb}=([^;]*)`)) || 
                      document.cookie.match(/(?:^|; )token=([^;]*)/);
  if (cookieMatch) token = cookieMatch[1];
  if (!token) {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.includes(`token_${etb}`) || k === "token" || k === "authToken")) {
        token = localStorage.getItem(k);
        break;
      }
    }
  }

  const url = `https://app.bellesoftware.com.br/api/release/controller/PainelAtend/v1.0/atendimento/${codConsulta}?origem=Painel%20de%20Atendimento&estabGeral=1`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "authorization": token,
      "content-type": "text/plain",
      "accept": "application/json, text/plain, */*"
    }
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

// Consulta os detalhes completos do agendamento (detalhes_api)
async function executarConsultaDetalhesAgendaNaPagina(codAgenda, codEstab) {
  const matchEstab = window.location.pathname.match(/\/u\/(\d+)/);
  const etb = codEstab || (matchEstab ? matchEstab[1] : "1");

  let token = "";
  const cookieMatch = document.cookie.match(new RegExp(`(?:^|; )token_${etb}=([^;]*)`)) || 
                      document.cookie.match(/(?:^|; )token=([^;]*)/);
  if (cookieMatch) token = cookieMatch[1];
  if (!token) {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.includes(`token_${etb}`) || k === "token" || k === "authToken")) {
        token = localStorage.getItem(k);
        break;
      }
    }
  }

  const url = `https://app.bellesoftware.com.br/api/release/controller/Agenda/v1.0/detalhes_api/${codAgenda}?estabGeral=1`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "authorization": token,
      "accept": "application/json, text/plain, */*"
    }
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

// Salva a edição do agendamento (edicaoagenda)
async function executarEdicaoAgendaNaPagina(payload, codEstab) {
  const matchEstab = window.location.pathname.match(/\/u\/(\d+)/);
  const etb = codEstab || (matchEstab ? matchEstab[1] : "1");

  let token = "";
  const cookieMatch = document.cookie.match(new RegExp(`(?:^|; )token_${etb}=([^;]*)`)) || 
                      document.cookie.match(/(?:^|; )token=([^;]*)/);
  if (cookieMatch) token = cookieMatch[1];
  if (!token) {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.includes(`token_${etb}`) || k === "token" || k === "authToken")) {
        token = localStorage.getItem(k);
        break;
      }
    }
  }

  const url = `https://app.bellesoftware.com.br/api/release/controller/Agenda/v1.0/edicaoagenda?estabGeral=1`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "authorization": token,
      "content-type": "text/plain",
      "accept": "application/json, text/plain, */*"
    },
    body: typeof payload === "string" ? payload : JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

// Executa inclusão oficial de parâmetro do laser
async function executarInclusaoParametroLaserNaPagina(payload, codEstab) {
  const matchEstab = window.location.pathname.match(/\/u\/(\d+)/);
  const etb = codEstab || (matchEstab ? matchEstab[1] : "1");

  let token = "";
  const cookieMatch = document.cookie.match(new RegExp(`(?:^|; )token_${etb}=([^;]*)`)) || 
                      document.cookie.match(/(?:^|; )token=([^;]*)/);
  if (cookieMatch) token = cookieMatch[1];
  if (!token) {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.includes(`token_${etb}`) || k === "token" || k === "authToken")) {
        token = localStorage.getItem(k);
        break;
      }
    }
  }

  const url = `https://app.bellesoftware.com.br/api/release/controller/PainelAtend/v1.0/parametro_laser?estabGeral=1`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "authorization": token,
      "content-type": "text/plain",
      "accept": "application/json, text/plain, */*"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

// Executa a requisição oficial de saldovendaplano do pacote
async function executarRequisicaoSaldoVendaPlanoNaPagina(codOrc, codPlano, idGeinfo, codEstab) {
  const matchEstab = window.location.pathname.match(/\/u\/(\d+)/);
  const etb = codEstab || (matchEstab ? matchEstab[1] : "1");

  let token = "";
  const cookieMatch = document.cookie.match(new RegExp(`(?:^|; )token_${etb}=([^;]*)`)) || 
                      document.cookie.match(/(?:^|; )token=([^;]*)/);
  if (cookieMatch) token = cookieMatch[1];
  if (!token) {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.includes(`token_${etb}`) || k === "token" || k === "authToken")) {
        token = localStorage.getItem(k);
        break;
      }
    }
  }

  const geinfoParam = idGeinfo ? `idGeinfo=${idGeinfo}&` : "";
  const url = `https://app.bellesoftware.com.br/api/release/controller/Plano/v1.0/saldovendaplano?${geinfoParam}estabGeral=1`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "authorization": token,
      "codorc": String(codOrc || ""),
      "codplano": String(codPlano || ""),
      "total": "1",
      "tpplano": "0",
      "accept": "application/json, text/plain, */*"
    }
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

function safeSendMessage(msg) {
  try {
    chrome.runtime.sendMessage(msg, () => {
      const _ = chrome.runtime.lastError;
    });
  } catch (e) {}
}

// Ouve mensagens do interceptor de rede (interceptor.js rodando no MAIN world)
window.addEventListener("message", (event) => {
  if (event.source !== window || !event.data || event.data.type !== "BELLE_INTERCEPTED_HTTP") return;

  const { url, method, requestBody, response, status, token } = event.data;

  if (token) {
    safeSendMessage({
      action: "BELLE_TOKEN_CAPTURED",
      token: token
    });
  }

  if (requestBody) {
    try {
      const parsedBody = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
      if (parsedBody && Array.isArray(parsedBody.arrGrid) && parsedBody.arrGrid.length > 0) {
        lastInterceptedArrGrid = parsedBody.arrGrid;
      }
    } catch (e) {}
  }

  if (status >= 200 && status < 300 && response) {
    let parsedJson = response;
    if (typeof response === "string") {
      try { parsedJson = JSON.parse(response); } catch (e) { return; }
    }

    if (url.includes("agendaapi") && Array.isArray(parsedJson)) {
      console.log(`[Agenda Assistant] 📥 Interceptados ${parsedJson.length} registros da agendaapi!`);
      safeSendMessage({
        action: "BELLE_LIVE_AGENDA_CAPTURED",
        url: url,
        method: method,
        requestBody: requestBody,
        data: parsedJson
      });
    } else if ((url.includes("salas") || url.includes("gridsala")) && Array.isArray(parsedJson)) {
      console.log(`[Agenda Assistant] 📥 Interceptadas ${parsedJson.length} salas/gridsala!`);
      const matchEtb = url.match(/[?&]etb=(\d+)/);
      safeSendMessage({
        action: "BELLE_LIVE_SALAS_CAPTURED",
        url: url,
        method: method,
        codEstab: matchEtb ? matchEtb[1] : null,
        data: parsedJson
      });
    } else if (url.includes("get_servicos") || url.includes("detalhes_api") || url.includes("edicaoagenda")) {
      const matchCod = url.match(/(?:get_servicos|detalhes_api|edicaoagenda)(?:\/|\?.*?(?:codConsulta|cod_consulta|id|codigo)=)(\d+)/) || url.match(/\/(\d+)(?:\?|$)/);
      const codAgenda = matchCod ? matchCod[1] : null;
      console.log(`[Agenda Assistant] 📥 Interceptado agendamento/atendimento da consulta #${codAgenda}!`);
      safeSendMessage({
        action: "BELLE_LIVE_ATENDIMENTO_CAPTURED",
        codConsulta: codAgenda,
        url: url,
        method: method,
        data: parsedJson
      });
    } else if (url.includes("parametro_laser")) {
      const matchCli = url.match(/cliente=(\d+)/);
      const codCli = matchCli ? matchCli[1] : null;
      console.log(`[Agenda Assistant] 📥 Interceptados parâmetros do laser do cliente #${codCli}!`);
      safeSendMessage({
        action: "BELLE_LIVE_PARAMETROS_LASER_CAPTURED",
        codCliente: codCli,
        url: url,
        method: method,
        data: parsedJson
      });
    } else if (url.includes("saldovendaplano") && Array.isArray(parsedJson)) {
      console.log(`[Agenda Assistant] 📥 Interceptado saldovendaplano (${parsedJson.length} itens)!`);
      safeSendMessage({
        action: "BELLE_LIVE_SALDO_VENDA_PLANO_CAPTURED",
        url: url,
        method: method,
        data: parsedJson
      });
    } else if (url.includes("vendasplanos")) {
      console.log(`[Agenda Assistant] 📥 Interceptado vendasplanos!`);
      safeSendMessage({
        action: "BELLE_LIVE_VENDAS_PLANOS_CAPTURED",
        url: url,
        method: method,
        data: parsedJson
      });
    } else if (url.includes("Parametros") || url.includes("parametros")) {
      console.log(`[Agenda Assistant] 📥 Interceptados parâmetros e logo da empresa!`);
      safeSendMessage({
        action: "BELLE_LIVE_PARAMETROS_EMPRESA_CAPTURED",
        url: url,
        method: method,
        data: parsedJson
      });
    }
  }
});

// Observa mudanças em campos de data na interface do Belle
document.addEventListener("change", (evt) => {
  try {
    const target = evt.target;
    if (!target) return;

    if (
      target.type === "date" || 
      target.classList.contains("datepicker") || 
      target.classList.contains("date-picker") ||
      (target.name && (target.name.includes("data") || target.name.includes("dt"))) ||
      (target.id && (target.id.includes("data") || target.id.includes("dt")))
    ) {
      const iso = formatarParaIso(target.value);
      if (iso) {
        safeSendMessage({
          action: "BELLE_DATE_SELECTED",
          data: iso
        });
      }
    }
  } catch (e) {}
}, true);

// Observa cliques em itens da agenda na página do Belle
document.addEventListener("click", (evt) => {
  try {
    const target = evt.target;
    if (!target) return;

    // Observa alteração de data do calendário do Belle
    setTimeout(() => {
      const novaData = extrairDataAgendaPagina();
      if (novaData && novaData !== document.documentElement.getAttribute("data-belle-agenda-date")) {
        safeSendMessage({
          action: "BELLE_DATE_SELECTED",
          data: novaData
        });
      }
    }, 250);

    // Detecta clique em linha de agendamento, evento ou célula com ID de agendamento/cliente
    const row = target.closest(".dhx_cal_event, .dhx_cal_event_line, .dhx_cal_event_clear, .dhx_body, [event_id], [data-consulta], [data-event-id], .appointment-card, .fc-event, tr, .agenda-item");
    if (row) {
      const text = row.innerText || row.textContent || "";
      
      // 1. Prioridade máxima: event_id do DHTMLX (único por agendamento na grade)
      let rawId = row.getAttribute("event_id") || 
                  row.closest("[event_id]")?.getAttribute("event_id") ||
                  row.getAttribute("data-event-id") || 
                  row.getAttribute("data-consulta") || 
                  row.id;
      
      let matchCod = null;
      if (rawId) {
        const m = String(rawId).match(/\d{5,10}/);
        if (m) matchCod = m[0];
      }
      if (!matchCod) {
        const m = text.match(/\b\d{5,10}\b/);
        if (m) matchCod = m[0];
      }

      // Extrai horário se presente no card para diferenciar atendimentos no mesmo dia
      const matchHorario = text.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/);
      const horarioStr = matchHorario ? matchHorario[0] : null;

      if (matchCod) {
        console.log(`[BelleCopilot] 🖱️ Agendamento clicado na página do Belle: #${matchCod} (Horário: ${horarioStr})`);
        safeSendMessage({
          action: "BELLE_AGENDA_ITEM_SELECTED",
          codConsulta: matchCod,
          codigo: matchCod,
          horario: horarioStr,
          rawText: text.substring(0, 150)
        });
      }
    }
  } catch (e) {}
}, true);
