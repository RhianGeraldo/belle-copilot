// Belle Software - Content Script para o Auxiliar de Agenda (ISOLATED World)

// =========================================================
// 0. SESSAO ATIVA (token + unidade) CAPTURADA DO PROPRIO BELLE
// O token NUNCA e lido do DOM: chega do interceptor por postMessage com origem validada
// e fica apenas na memoria deste content script (mundo isolado da pagina).
// =========================================================
let tokenAtivoBelle = null;

/**
 * Unidade em que a usuaria esta logada, lida da URL do Belle (/u/{unidade}/...).
 * ATENCAO: os campos "etb", "estabGeral" e "cod_clinica" das requisicoes NAO identificam
 * a filial (o Belle envia "1" em todas). A URL e o cookie token_<unidade> sao as unicas
 * fontes confiaveis, conforme doc 11.4 do mapeamento da API.
 */
function unidadeLogadaNaPagina() {
  const match = window.location.pathname.match(/\/u\/(\d+)/);
  return match ? match[1] : null;
}

// Le o token da unidade informada (o Belle particiona a sessao por unidade: token_1, token_3...)
function lerTokenDaUnidade(etb) {
  const etbStr = String(etb || "").trim();
  if (!etbStr) return null;

  try {
    const cookieMatch = document.cookie.match(new RegExp(`(?:^|; )token_${etbStr}=([^;]*)`));
    if (cookieMatch && cookieMatch[1]) {
      const bruto = cookieMatch[1];
      try { return decodeURIComponent(bruto); } catch (e) { return bruto; }
    }
  } catch (e) {}

  try {
    const ls = localStorage.getItem(`token_${etbStr}`);
    if (ls && ls.length > 10) return ls;
  } catch (e) {}

  return null;
}

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

/**
 * Descobre o codigo/login do usuario logado no Belle a partir do que a propria
 * aplicacao guarda na pagina. Sem isso, `recuperar_dados/{codUsuario}` era chamado
 * sempre com "master-admin" e nao retornava o perfil de outras operadoras.
 */
function descobrirCodUsuarioNaPagina() {
  // 1. Chaves diretas de login no localStorage.
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !/^(login|usuario|user|cod_usuario|codusuario|nom_usuario)$/i.test(k)) continue;
      const raw = (localStorage.getItem(k) || "").trim();
      if (raw && raw.length >= 3 && raw.length <= 60 && !/\s/.test(raw) && !/^[\[{]/.test(raw)) {
        return raw;
      }
    }
  } catch (e) {}

  // 2. Objetos JSON de sessao/perfil guardados pela aplicacao.
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !/usuario|user|login|perfil|sessao|session/i.test(k)) continue;
      const raw = localStorage.getItem(k);
      if (!raw || !/^[\[{]/.test(raw.trim())) continue;
      try {
        const parsed = JSON.parse(raw);
        const obj = Array.isArray(parsed) ? parsed[0] : parsed;
        const cod = obj?.cod_usuario || obj?.codUsuario || obj?.login || obj?.usuario;
        if (cod && String(cod).trim().length >= 3) return String(cod).trim();
      } catch (e) {}
    }
  } catch (e) {}

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

    const codDescoberto = descobrirCodUsuarioNaPagina();
    if (codDescoberto) {
      result.codUsuario = codDescoberto;
    }

    const userElement = document.querySelector(
      ".user-profile-name, .user-name, .header-user, #nomUsuario, .nome-usuario, .user-info-name"
    );
    if (userElement && userElement.textContent) {
      result.userName = userElement.textContent.trim();
    }

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      // Credenciais ficam fora do dump: o token vai apenas em result.auth, ja resolvido por unidade.
      if (key && !/token|auth|senha|password/i.test(key)) {
        result.localStorage[key] = localStorage.getItem(key);
      }
    }

    // A unidade logada vem da URL da aba do Belle e e reportada SEMPRE, mesmo sem token:
    // antes ela viajava apenas dentro de result.auth e, sem token, o painel caia no "1" fixo.
    const unidadeAtiva = unidadeLogadaNaPagina() || String(result.codEstab || "1");
    result.codEstab = unidadeAtiva;

    // Token da unidade logada. O cookie de sessao do Belle costuma ser HttpOnly (invisivel
    // para document.cookie), entao o painel busca o token definitivo via chrome.cookies.
    const finalToken = tokenAtivoBelle || lerTokenDaUnidade(unidadeAtiva);
    if (finalToken) {
      result.auth = {
        token: finalToken,
        user: result.codUsuario,
        etb: unidadeAtiva
      };
    }
  } catch (e) {
    console.warn("[Agenda Assistant] Erro ao extrair contexto:", e);
  }

  return result;
}

// Responde ao painel com o contexto da página (usuário logado, unidade e data ativa).
// As antigas rotas BELLE_FETCH_*/BELLE_SALVAR_* foram removidas: o painel consulta a API
// do Belle diretamente pelo core/api-client.js e nenhuma delas tinha chamador.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_BELLE_PAGE_CONTEXT") {
    sendResponse(extrairContextoPagina());
    return true;
  }
  return false;
});

function safeSendMessage(msg) {
  try {
    // Carimba a unidade de origem: o content script roda em todas as abas do Belle e o
    // painel precisa descartar o que vier de uma filial diferente da que esta aberta.
    const comOrigem = Object.assign({ unidade: unidadeLogadaNaPagina() }, msg);
    chrome.runtime.sendMessage(comOrigem, () => {
      const _ = chrome.runtime.lastError;
    });
  } catch (e) {}
}

// Ouve mensagens do interceptor de rede (interceptor.js rodando no MAIN world)
window.addEventListener("message", (event) => {
  // Só aceita mensagens da própria página do Belle (mesma origem). Sem isso, qualquer
  // iframe de terceiro conseguiria injetar dados ou token falso no painel.
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;
  if (!event.data || event.data.type !== "BELLE_INTERCEPTED_HTTP") return;

  const { url, method, requestBody, response, status, token } = event.data;

  if (token) {
    tokenAtivoBelle = token;
    safeSendMessage({
      action: "BELLE_TOKEN_CAPTURED",
      token: token,
      codEstab: unidadeLogadaNaPagina()
    });
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
        token: token || null,
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

// Verificação de troca de data com timer único: antes cada clique na página agendava o
// próprio setTimeout, e numa agenda cheia isso empilhava dezenas de varreduras de data
// (que podem ler o localStorage inteiro e forçar layout com innerText).
let timerVerificarData = null;
function verificarTrocaDeDataAposClique() {
  if (timerVerificarData) clearTimeout(timerVerificarData);
  timerVerificarData = setTimeout(() => {
    timerVerificarData = null;
    const novaData = extrairDataAgendaPagina();
    if (novaData && novaData !== document.documentElement.getAttribute("data-belle-agenda-date")) {
      safeSendMessage({
        action: "BELLE_DATE_SELECTED",
        data: novaData
      });
    }
  }, 250);
}

// Observa cliques em itens da agenda na página do Belle
document.addEventListener("click", (evt) => {
  try {
    const target = evt.target;
    if (!target) return;

    verificarTrocaDeDataAposClique();

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
