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

    statusEl.className = "status sucesso";
    statusEl.innerHTML = "✅ Microfone liberado com sucesso!<br>Você já pode voltar para a aba do Belle e usar a voz. Esta janela fechará em breve...";

    setTimeout(() => {
      window.close();
    }, 2500);
  } catch (err) {
    console.warn("Erro ao solicitar microfone:", err);
    statusEl.className = "status erro";
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      statusEl.innerHTML = "⚠️ Permissão bloqueada pelo navegador.<br><br>👉 Clique no ícone de <b>Cadeado / Configurações do Site</b> na barra de endereço (topo do navegador) e mude o <b>Microfone</b> para <b>Permitir</b>. Depois clique no botão acima novamente.";
    } else {
      statusEl.textContent = "Erro ao acessar microfone: " + (err.message || err.name);
    }
  }
}

if (btn) {
  btn.addEventListener("click", pedirPermissaoMicrofone);
}
