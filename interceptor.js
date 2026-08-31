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
      const [y, m, d] = dataIso.split("-").map(Number);
      const dtObj = new Date(y, m - 1, d);
      const dataBrFormatada = dataBr || `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;

      // A. FullCalendar (v3, v4, v5, v6)
      if (window.jQuery || window.$) {
        const $ = window.jQuery || window.$;
        try { $('#calendar, #agenda, .fc, [ui-calendar], [id*="calendar"], [id*="agenda"]').fullCalendar('gotoDate', dataIso); } catch (e) {}
        try { $('#calendar, #agenda, .fc, [ui-calendar], [id*="calendar"], [id*="agenda"]').fullCalendar('gotoDate', dtObj); } catch (e) {}
      }

      const fcElements = document.querySelectorAll('.fc, #calendar, #agenda, [id*="calendar"], [id*="agenda"], [class*="fc-"]');
      fcElements.forEach(el => {
        try {
          if (el._calendar && typeof el._calendar.gotoDate === "function") el._calendar.gotoDate(dataIso);
          if (el.__fullCalendar && typeof el.__fullCalendar.gotoDate === "function") el.__fullCalendar.gotoDate(dataIso);
        } catch (e) {}
      });

      if (window.calendar && typeof window.calendar.gotoDate === "function") {
        try { window.calendar.gotoDate(dataIso); } catch (e) {}
      }
      if (window.scheduler && typeof window.scheduler.setCurrentView === "function") {
        try { window.scheduler.setCurrentView(dtObj); } catch (e) {}
      }

      // B. AngularJS (Deep scope and rootScope inspection)
      if (window.angular) {
        const allAngularEls = document.querySelectorAll('[ng-controller], [ng-app], [ui-view], [ng-view], #calendar, #agenda, #dtAgenda, #dataAgenda, input[ng-model*="data"], input[ng-model*="dt"], body');
        allAngularEls.forEach(el => {
          try {
            const scope = window.angular.element(el).scope();
            if (scope) {
              let alterou = false;
              ['dtAgenda', 'dataAgenda', 'data', 'dt_agenda', 'data_agenda', 'dtConsulta', 'dataConsulta'].forEach(k => {
                if (scope[k] !== undefined) {
                  scope[k] = (typeof scope[k] === 'object' && scope[k] instanceof Date) ? dtObj : dataIso;
                  alterou = true;
                }
              });

              if (scope.filtro && typeof scope.filtro === 'object') {
                ['dtAgenda', 'dataAgenda', 'data', 'dt', 'data_agenda', 'dt_agenda'].forEach(k => {
                  if (scope.filtro[k] !== undefined) {
                    scope.filtro[k] = (typeof scope.filtro[k] === 'object' && scope.filtro[k] instanceof Date) ? dtObj : dataIso;
                    alterou = true;
                  }
                });
              }

              if (scope.vm && typeof scope.vm === 'object') {
                ['dtAgenda', 'dataAgenda', 'data', 'dt_agenda', 'data_agenda'].forEach(k => {
                  if (scope.vm[k] !== undefined) {
                    scope.vm[k] = (typeof scope.vm[k] === 'object' && scope.vm[k] instanceof Date) ? dtObj : dataIso;
                    alterou = true;
                  }
                });
                if (scope.vm.filtro && typeof scope.vm.filtro === 'object') {
                  ['dtAgenda', 'dataAgenda', 'data', 'dt'].forEach(k => {
                    if (scope.vm.filtro[k] !== undefined) {
                      scope.vm.filtro[k] = dataIso;
                      alterou = true;
                    }
                  });
                }
                ['buscarAgenda', 'carregarAgenda', 'buscar', 'pesquisar', 'carregar', 'consultar', 'consultarAgenda', 'filtrar'].forEach(fn => {
                  if (typeof scope.vm[fn] === 'function') {
                    try { scope.vm[fn](dataIso); } catch (e) {}
                  }
                });
              }

              ['buscarAgenda', 'carregarAgenda', 'buscar', 'pesquisar', 'carregar', 'consultar', 'consultarAgenda', 'filtrar', 'getAgenda'].forEach(fn => {
                if (typeof scope[fn] === 'function') {
                  try { scope[fn](dataIso); } catch (e) {}
                }
              });

              const rootScope = scope.$root || scope;
              if (rootScope && typeof rootScope.$broadcast === "function") {
                rootScope.$broadcast("MUDOU_DATA_AGENDA", dataIso);
                rootScope.$broadcast("CARREGAR_AGENDA", dataIso);
                rootScope.$broadcast("BUSCAR_AGENDA", dataIso);
                rootScope.$broadcast("agenda:changeDate", dataIso);
              }

              if (alterou) {
                if (scope.$applyAsync) scope.$applyAsync();
                else if (scope.$apply) scope.$apply();
              }
            }
          } catch(e) {}
        });
      }

      // C. Inputs e Datepickers no DOM
      const dateInputs = document.querySelectorAll(
        'input[type="date"], input.datepicker, input.date-picker, #dtAgenda, #dataAgenda, #data_agenda, #data, #txtData, input[name*="data"], input[name*="dt"], input[ng-model*="data"], input[ng-model*="dt"], input[placeholder*="DD/MM"], input[placeholder*="dd/mm"], .hasDatepicker'
      );
      dateInputs.forEach(inp => {
        try {
          if (inp.type === "date") {
            inp.value = dataIso;
          } else {
            inp.value = dataBrFormatada;
          }
          inp.dispatchEvent(new Event("input", { bubbles: true }));
          inp.dispatchEvent(new Event("change", { bubbles: true }));
          inp.dispatchEvent(new Event("blur", { bubbles: true }));
        } catch (e) {}
      });

      if (window.jQuery || window.$) {
        const $ = window.jQuery || window.$;
        try {
          $('input.datepicker, input.date-picker, #dtAgenda, #dataAgenda, #data, input[name*="data"], input[name*="dt"], .hasDatepicker').datepicker('setDate', dataBrFormatada);
          $('input.datepicker, input.date-picker, #dtAgenda, #dataAgenda, #data, input[name*="data"], input[name*="dt"], .hasDatepicker').trigger('change');
        } catch (e) {}
      }

      // D. Botões de busca / pesquisa
      const btnBuscar = document.querySelector('#btnBuscar, #btnPesquisar, #btn-buscar, #btn-pesquisar, button[ng-click*="buscar"], button[ng-click*="pesquisar"], .btn-search, .btn-buscar, button[type="submit"]');
      if (btnBuscar) {
        btnBuscar.click();
      }

      // E. Atualiza atributo global
      document.documentElement.setAttribute("data-belle-agenda-date", dataIso);
    } catch (err) {
      console.warn("[Belle Interceptor] Erro ao alterar data na página:", err);
    }
  });
})();
