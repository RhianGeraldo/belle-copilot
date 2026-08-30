// Permite que o Side Panel abra ao clicar no ícone da extensão
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("Erro ao configurar Side Panel:", error));

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
