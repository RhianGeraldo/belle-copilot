// Belle Software - Network Interceptor (Main World)
(function() {
  if (window.__BELLE_MAIN_INTERCEPTOR_ACTIVE__) return;
  window.__BELLE_MAIN_INTERCEPTOR_ACTIVE__ = true;
  window.__BELLE_LAST_AGENDA_DATA__ = null;
  window.__BELLE_LAST_AGENDA_REQUEST__ = null;

  // Origem exata do Belle: as mensagens NUNCA vao para "*", senao qualquer iframe,
  // script de terceiro ou outra extensao na pagina consegue ler a sessao do ERP.
  const BELLE_ORIGIN = window.location.origin;

  // Token vive apenas neste escopo fechado (nem window, nem DOM).
  // A UNIDADE nao e derivada daqui: o Belle envia "etb=1" em todas as filiais (doc 11.4).
  // Quem identifica a unidade logada e a URL /u/{unidade} lida pelo content script.
  let authTokenAtivo = null;

  console.log("[Belle Agenda Assistant] Interceptor de rede ativo no contexto MAIN.");

  function dispatchInterceptedData(url, method, requestBody, response, status) {
    if (!url) return;
    // Frame sem origem definida (sandbox) nao e a aplicacao do Belle: nada e publicado.
    if (!BELLE_ORIGIN || BELLE_ORIGIN === "null") return;
    if (status < 200 || status >= 300) return;

    let parsed = response;
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch (e) {
        return;
      }
    }

    if (parsed && (typeof parsed === "object" || Array.isArray(parsed))) {
      let detectedDate = null;
      const matchUrl = url.match(/[?&]data=(\d{4}-\d{2}-\d{2})/);
      if (matchUrl) {
        detectedDate = matchUrl[1];
      } else if (requestBody) {
        try {
          const b = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
          if (b && b.dtAgenda) {
            const matchDt = b.dtAgenda.match(/^(\d{4}-\d{2}-\d{2})/);
            if (matchDt) detectedDate = matchDt[1];
          }
        } catch(e) {}
      } else if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].dt_consulta) {
        detectedDate = parsed[0].dt_consulta;
      }

      if (detectedDate) {
        window.__BELLE_LAST_AGENDA_DATE__ = detectedDate;
        try {
          document.documentElement.setAttribute("data-belle-agenda-date", detectedDate);
        } catch(e) {}
      }

      if (url.includes("agendaapi") && Array.isArray(parsed)) {
        window.__BELLE_LAST_AGENDA_DATA__ = parsed;
        window.__BELLE_LAST_AGENDA_REQUEST__ = {
          url: url,
          method: method,
          body: requestBody,
          date: detectedDate
        };
      }

      window.postMessage({
        type: "BELLE_INTERCEPTED_HTTP",
        url: url,
        method: method,
        requestBody: requestBody,
        response: parsed,
        status: status,
        date: detectedDate,
        token: authTokenAtivo
      }, BELLE_ORIGIN);
    }
  }

  // 1. Intercepta XMLHttpRequest (AngularJS $http / jQuery $.ajax)
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
    const nome = header ? String(header).toLowerCase() : "";
    if (nome === "authorization" && value) {
      // Guarda apenas em memoria do interceptor e repassa pelo postMessage com origem fixa.
      authTokenAtivo = value;
    }
    return origSetHeader.apply(this, arguments);
  };

  XMLHttpRequest.prototype.open = function(method, url) {
    this._method = method || "GET";
    this._url = url || "";
    this._handled = false;
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    this._requestBody = body;
    const self = this;

    function onResponseReady() {
      if (self._handled) return;
      if (self.readyState !== 4) return;
      self._handled = true;

      const url = self._url || "";
      if (!url || (!url.includes("agendaapi") && !url.includes("recuperar_dados") && !url.includes("gridsala") && !url.includes("salas") && !url.includes("get_servicos") && !url.includes("parametro_laser") && !url.includes("saldovendaplano") && !url.includes("detalhes_api") && !url.includes("edicaoagenda") && !url.includes("validar_agendamento") && !url.includes("atendimento") && !url.includes("parametros"))) {
        return;
      }

      let respData = null;
      try {
        if (self.responseType === "json" || (self.response && typeof self.response === "object")) {
          respData = self.response;
        } else if (!self.responseType || self.responseType === "text" || self.responseType === "") {
          respData = self.responseText;
        } else {
          respData = self.response;
        }
      } catch (err) {
        respData = self.response;
      }

      let bodyStr = null;
      if (typeof self._requestBody === "string") {
        bodyStr = self._requestBody;
      } else if (self._requestBody) {
        try { bodyStr = JSON.stringify(self._requestBody); } catch (e) {}
      }

      dispatchInterceptedData(url, self._method, bodyStr, respData, self.status);
    }

    // Um único listener: "loadend" dispara sempre no fim (sucesso, erro ou abort).
    // Antes eram tres listeners por requisicao, e "readystatechange" ainda executava o
    // handler a cada mudanca de estado de toda XHR da pagina.
    this.addEventListener("loadend", onResponseReady);

    return origSend.apply(this, arguments);
  };

  // 2. Intercepta Fetch API
  const origFetch = window.fetch;
  window.fetch = async function(resource, init) {
    const response = await origFetch.apply(this, arguments);
    try {
      const url = typeof resource === 'string' ? resource : resource?.url;
      if (url && (url.includes("agendaapi") || url.includes("recuperar_dados") || url.includes("salas") || url.includes("gridsala") || url.includes("get_servicos") || url.includes("parametro_laser") || url.includes("saldovendaplano") || url.includes("detalhes_api") || url.includes("edicaoagenda") || url.includes("validar_agendamento") || url.includes("atendimento") || url.includes("parametros"))) {
        const clone = response.clone();
        let bodyData = init?.body;
        if (bodyData && typeof bodyData !== 'string') {
          try { bodyData = JSON.stringify(bodyData); } catch (err) {}
        }
        try {
          const json = await clone.json();
          dispatchInterceptedData(url, init?.method || "GET", bodyData, json, response.status);
        } catch (je) {
          const text = await clone.text();
          dispatchInterceptedData(url, init?.method || "GET", bodyData, text, response.status);
        }
      }
    } catch (e) {}
    return response;
  };
})();
