// Belle Software - Network Interceptor (Main World)
(function() {
  if (window.__BELLE_MAIN_INTERCEPTOR_ACTIVE__) return;
  window.__BELLE_MAIN_INTERCEPTOR_ACTIVE__ = true;
  window.__BELLE_LAST_AGENDA_DATA__ = null;
  window.__BELLE_LAST_AGENDA_REQUEST__ = null;

  console.log("[Belle Agenda Assistant] Interceptor de rede ativo no contexto MAIN.");

  function dispatchInterceptedData(url, method, requestBody, response, status) {
    if (!url) return;
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
        token: window.__BELLE_AUTH_TOKEN__ || null
      }, "*");
    }
  }

  // 1. Intercepta XMLHttpRequest (AngularJS $http / jQuery $.ajax)
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
    if (header && header.toLowerCase() === "authorization" && value) {
      window.__BELLE_AUTH_TOKEN__ = value;
      try {
        document.documentElement.setAttribute("data-belle-token", value);
      } catch(e) {}
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
      if (!url || (!url.includes("agendaapi") && !url.includes("gridsala") && !url.includes("salas") && !url.includes("get_servicos") && !url.includes("parametro_laser") && !url.includes("saldovendaplano") && !url.includes("detalhes_api") && !url.includes("edicaoagenda") && !url.includes("validar_agendamento") && !url.includes("atendimento") && !url.includes("parametros"))) {
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

    this.addEventListener("readystatechange", onResponseReady);
    this.addEventListener("load", onResponseReady);
    this.addEventListener("loadend", onResponseReady);

    return origSend.apply(this, arguments);
  };

  // 2. Intercepta Fetch API
  const origFetch = window.fetch;
  window.fetch = async function(resource, init) {
    const response = await origFetch.apply(this, arguments);
    try {
      const url = typeof resource === 'string' ? resource : resource?.url;
      if (url && (url.includes("agendaapi") || url.includes("salas") || url.includes("gridsala") || url.includes("get_servicos") || url.includes("parametro_laser") || url.includes("saldovendaplano") || url.includes("detalhes_api") || url.includes("edicaoagenda") || url.includes("validar_agendamento") || url.includes("atendimento") || url.includes("parametros"))) {
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

  // 3. Ouvinte de comandos de navegação de data (disparados pelo Copilot)
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.type !== "BELLE_NAVIGATE_DATE_MAIN") return;
    const { dataIso, dataBr } = event.data;
    if (!dataIso) return;

    console.log("[Belle Interceptor] 🧭 Navegando data na interface do Belle:", dataIso, dataBr);

    try {
      // 1. Atualiza inputs de data nativos e com ng-model / datepicker
      const dateInputs = document.querySelectorAll(
        'input[type="date"], input.datepicker, input.date-picker, #dtAgenda, #dataAgenda, #data_agenda, input[name*="data"], input[name*="dt"], input[ng-model*="data"], input[ng-model*="dt"], input[placeholder*="DD/MM"]'
      );
      dateInputs.forEach(inp => {
        if (inp.type === "date") {
          inp.value = dataIso;
        } else {
          inp.value = dataBr || dataIso;
        }
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        inp.dispatchEvent(new Event("change", { bubbles: true }));
      });

      // 2. jQuery Datepicker se disponível
      if (window.jQuery || window.$) {
        const $ = window.jQuery || window.$;
        try {
          $('input.datepicker, input.date-picker, #dtAgenda, #dataAgenda, input[name*="data"], input[name*="dt"]').datepicker('setDate', dataBr || dataIso);
          $('input.datepicker, input.date-picker, #dtAgenda, #dataAgenda, input[name*="data"], input[name*="dt"]').trigger('change');
        } catch (e) {}
      }

      // 3. AngularJS scope se disponível
      if (window.angular) {
        const els = document.querySelectorAll('[ng-controller], [ng-app], #dtAgenda, #dataAgenda, input[ng-model*="data"], input[ng-model*="dt"], body');
        for (const el of els) {
          try {
            const scope = window.angular.element(el).scope();
            if (scope) {
              if (scope.dtAgenda !== undefined) scope.dtAgenda = dataIso;
              if (scope.dataAgenda !== undefined) scope.dataAgenda = dataIso;
              if (scope.data !== undefined && typeof scope.data === "string") scope.data = dataIso;
              if (scope.filtro && typeof scope.filtro === "object") {
                if (scope.filtro.dtAgenda !== undefined) scope.filtro.dtAgenda = dataIso;
                if (scope.filtro.data !== undefined) scope.filtro.data = dataIso;
              }
              if (typeof scope.buscarAgenda === "function") scope.buscarAgenda();
              else if (typeof scope.pesquisar === "function") scope.pesquisar();
              else if (typeof scope.carregarAgenda === "function") scope.carregarAgenda();
              else if (typeof scope.atualizar === "function") scope.atualizar();

              if (scope.$applyAsync) scope.$applyAsync();
              else if (scope.$apply) scope.$apply();
            }
          } catch(e) {}
        }
      }

      // 4. FullCalendar ou DHTMLX Scheduler se disponível
      if (window.calendar && typeof window.calendar.gotoDate === "function") {
        window.calendar.gotoDate(dataIso);
      }
      if (window.scheduler && typeof window.scheduler.setCurrentView === "function") {
        const [y, m, d] = dataIso.split("-").map(Number);
        window.scheduler.setCurrentView(new Date(y, m - 1, d));
      }

      // 5. Clica no botão pesquisar/buscar da agenda se existir
      const btnBuscar = document.querySelector('#btnBuscar, #btnPesquisar, #btn-buscar, #btn-pesquisar, button[ng-click*="buscar"], button[ng-click*="pesquisar"], .btn-search, .btn-buscar');
      if (btnBuscar) {
        btnBuscar.click();
      }

      // 6. Atualiza atributo no documentElement
      document.documentElement.setAttribute("data-belle-agenda-date", dataIso);
    } catch (err) {
      console.warn("[Belle Interceptor] Erro ao alterar data na página:", err);
    }
  });
})();
