const btn = document.getElementById("btn-autorizar");
const statusEl = document.getElementById("status");

async function pedirPermissaoMicrofone() {
  try {
    statusEl.className = "status";
    statusEl.style.display = "block";
    statusEl.textContent = "Solicitando permissão de microfone ao navegador...";

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      statusEl.className = "status erro";
      statusEl.textContent = "Seu navegador não oferece suporte à API de mídia de microfone.";
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Permissão concedida com sucesso! Encerra as faixas de áudio imediatamente.
    stream.getTracks().forEach(t => t.stop());

    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.set({ mic_extensao_autorizado: true });
    }

    statusEl.className = "status sucesso";
    statusEl.innerHTML = "✅ Microfone liberado com sucesso!<br>Você já pode voltar para o Belle Copilot e usar a voz. Esta janela fechará em breve...";

    setTimeout(() => {
      window.close();
    }, 2000);
  } catch (err) {
    console.warn("Erro ao solicitar microfone:", err);
    statusEl.className = "status erro";
    const msg = String(err.message || "").toLowerCase();
    const nome = String(err.name || "");

    if (nome === "NotFoundError" || nome === "DevicesNotFoundError" || msg.includes("device not found") || msg.includes("requested device")) {
      statusEl.innerHTML = "⚠️ <b>Nenhum microfone detectado no computador.</b><br><br>O sistema não encontrou nenhum microfone ou headset conectado.<br><br>👉 Conecte um microfone ou fone de ouvido e clique no botão <b>Autorizar Microfone</b> acima.";
    } else if (nome === "NotAllowedError" || nome === "PermissionDeniedError") {
      statusEl.innerHTML = "⚠️ <b>Permissão bloqueada pelo navegador.</b><br><br>👉 Clique no ícone de <b>Cadeado / Configurações do Site</b> no topo da barra de endereço e altere o <b>Microfone</b> para <b>Permitir</b>. Depois clique no botão <b>Autorizar Microfone</b> acima.";
    } else {
      statusEl.textContent = "Erro ao acessar microfone: " + (err.message || err.name);
    }
  }
}

if (btn) {
  btn.addEventListener("click", () => pedirPermissaoMicrofone());
}

// Dispara uma única vez ao carregar a página
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => pedirPermissaoMicrofone());
} else {
  pedirPermissaoMicrofone();
}
