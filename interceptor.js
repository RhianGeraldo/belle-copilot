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

  const MESES_PT = [
    "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
  ];

  function normalizarTexto(str) {
    return (str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function selecionarDataNoPrimeNGBelle(dataIso) {
    if (!dataIso || !/^\d{4}-\d{2}-\d{2}$/.test(dataIso)) return false;
    const [y, m, d] = dataIso.split("-").map(Number);
    const targetYear = y;
    const targetMonthIndex = m - 1; // 0 a 11
    const targetDay = d;

    console.log(`[Belle Interceptor] 🎯 Clicando no PrimeNG Datepicker: Dia ${targetDay}, Mês ${targetMonthIndex + 1}, Ano ${targetYear}`);

    // 1. Se o popover não estiver aberto, clica no botão .data-atual do topo do Belle
    let datepickerPanel = document.querySelector('.p-datepicker-panel, p-datepicker');
    if (!datepickerPanel || datepickerPanel.offsetParent === null) {
      const trigger = document.querySelector('.data-atual, button.data-atual, [class*="data-atual"], .titulo-agenda-data, .header-data, [aria-label*="Choose Date"]');
      if (trigger) {
        console.log("[Belle Interceptor] 🖱️ Abrindo popover do datepicker (.data-atual)...");
        trigger.click();
        trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      }
    }

    let tentativas = 0;
    const tentarNavegarEClicar = () => {
      tentativas++;

      // 2. Navegação de Mês/Ano no cabeçalho do PrimeNG
      const monthBtn = document.querySelector('.p-datepicker-select-month, [aria-label="Choose Month"]');
      const yearBtn = document.querySelector('.p-datepicker-select-year, [aria-label="Choose Year"]');
      const nextBtn = document.querySelector('.p-datepicker-next-button, [aria-label="Next Month"], p-button.p-datepicker-next-button button');
      const prevBtn = document.querySelector('.p-datepicker-prev-button, [aria-label="Previous Month"], p-button.p-datepicker-prev-button button');

      if (monthBtn && yearBtn) {
        const currentYear = parseInt(yearBtn.textContent.trim(), 10) || targetYear;
        const monthTxt = normalizarTexto(monthBtn.textContent.trim());
        const currentMonthIndex = MESES_PT.findIndex(nm => monthTxt.includes(nm));

        if (currentMonthIndex !== -1 && !isNaN(currentYear)) {
          const diffMonths = (targetYear - currentYear) * 12 + (targetMonthIndex - currentMonthIndex);
          if (diffMonths > 0 && nextBtn) {
            for (let i = 0; i < diffMonths; i++) {
              nextBtn.click();
            }
          } else if (diffMonths < 0 && prevBtn) {
            for (let i = 0; i < Math.abs(diffMonths); i++) {
              prevBtn.click();
            }
          }
        }
      }

      // 3. Busca a célula do dia alvo
      const targetDataDates = [
        `${targetYear}-${targetMonthIndex}-${targetDay}`,
        `${targetYear}-${m}-${targetDay}`,
        `${targetYear}-${String(targetMonthIndex).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`,
        `${targetYear}-${String(m).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`
      ];

      let cell = null;
      for (const dd of targetDataDates) {
        const found = document.querySelector(`.p-datepicker-day[data-date="${dd}"], [data-date="${dd}"]`);
        if (found && !found.closest('.p-datepicker-other-month')) {
          cell = found;
          break;
        }
      }

      // Fallback: procura pelo número do dia na grade do mês atual
      if (!cell) {
        const daySpans = document.querySelectorAll('.p-datepicker-day-cell:not(.p-datepicker-other-month) .p-datepicker-day, .p-datepicker-day:not(.p-datepicker-other-month)');
        for (const sp of daySpans) {
          if (sp.textContent.trim() === String(targetDay)) {
            cell = sp;
            break;
          }
        }
      }

      if (cell) {
        console.log(`[Belle Interceptor] ✅ Célula da data ${dataIso} encontrada no PrimeNG! Disparando clique...`);
        cell.click();
        cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        cell.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        cell.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return true;
      }

      if (tentativas < 8) {
        setTimeout(tentarNavegarEClicar, 60);
      }
    };

    setTimeout(tentarNavegarEClicar, 40);
  }

  // 3. Ouvinte de comandos de navegação de data (disparados pelo Copilot)
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.type !== "BELLE_NAVIGATE_DATE_MAIN") return;
    const { dataIso, dataBr } = event.data;
    if (!dataIso) return;

    console.log("[Belle Interceptor] 🧭 Navegando data na interface do Belle:", dataIso, dataBr);

    try {
      // 1. Simula clique no PrimeNG Datepicker da interface do Belle
      selecionarDataNoPrimeNGBelle(dataIso);

      // 2. Atualiza atributo global de data
      document.documentElement.setAttribute("data-belle-agenda-date", dataIso);
    } catch (err) {
      console.warn("[Belle Interceptor] Erro ao alterar data na página:", err);
    }
  });
})();
