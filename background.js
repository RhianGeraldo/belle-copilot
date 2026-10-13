// BELLE COPILOT - BACKGROUND SERVICE WORKER

// Permite que o Side Panel abra ao clicar no ícone da extensão (com proteção para navegadores estáveis e forks)
if (typeof chrome !== "undefined" && chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === "function") {
  try {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error) => console.warn("[BelleCopilot] Aviso ao configurar Side Panel:", error));
  } catch (e) {
    console.warn("[BelleCopilot] Erro não-bloqueante no setPanelBehavior:", e);
  }
}

// Fallback de clique na ação da extensão para garantir abertura em qualquer navegador
if (typeof chrome !== "undefined" && chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener(async (tab) => {
    if (chrome.sidePanel && typeof chrome.sidePanel.open === "function") {
      try {
        if (tab?.windowId) {
          await chrome.sidePanel.open({ windowId: tab.windowId });
          return;
        } else if (tab?.id) {
          await chrome.sidePanel.open({ tabId: tab.id });
          return;
        }
      } catch (err) {
        console.warn("[BelleCopilot] Falha ao abrir via sidePanel.open, usando janela lateral:", err);
      }
    }

    // Fallback: abre o painel em uma janela popup compacta caso sidePanel não esteja disponível no canal
    abrirPainelJanelaFallback(tab);
  });
}

function abrirPainelJanelaFallback(tab) {
  const urlPainel = chrome.runtime.getURL("sidepanel/sidepanel.html");
  if (chrome.windows && chrome.windows.create) {
    chrome.windows.create({
      url: urlPainel,
      type: "popup",
      width: 440,
      height: 800,
      focused: true
    });
  } else if (chrome.tabs && chrome.tabs.create) {
    chrome.tabs.create({ url: urlPainel });
  }
}

// Ouvinte para mensagens que precisem de privilégios de background (ex: ler cookies de autenticação)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request && request.action === "GET_BELLE_COOKIES") {
    chrome.cookies.getAll({ url: "https://app.bellesoftware.com.br/" }, (cookiesUrl) => {
      if (cookiesUrl && cookiesUrl.length > 0) {
        sendResponse({ cookies: cookiesUrl });
      } else {
        chrome.cookies.getAll({ domain: "bellesoftware.com.br" }, (cookiesDomain) => {
          sendResponse({ cookies: cookiesDomain || [] });
        });
      }
    });
    return true; // Mantém o canal de resposta assíncrono aberto
  }
  return false;
});
