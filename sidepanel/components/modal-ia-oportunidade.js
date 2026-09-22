/**
 * BELLE COPILOT - WHATSAPP COPILOT IA (OPORTUNIDADES & VENDAS)
 * Interface ultra-refinada com preview realista de chat do WhatsApp,
 * múltiplos tons de persuasão (fechamento, urgência, empático, condição) e
 * envio com 1 clique.
 */

import { gerarMensagemOportunidadeIa } from '../core/ai-client.js';

const modalIa = document.getElementById("modal-ia-oportunidade");
const modalIaAvatar = document.getElementById("modal-ia-avatar");
const modalIaNome = document.getElementById("modal-ia-cliente-nome");
const modalIaPlano = document.getElementById("modal-ia-plano-info");
const modalIaLoading = document.getElementById("modal-ia-loading");
const modalIaCorpo = document.getElementById("modal-ia-corpo");
const modalIaTextarea = document.getElementById("modal-ia-textarea");
const modalIaCharCount = document.getElementById("modal-ia-char-count");
const modalIaTimestamp = document.getElementById("modal-ia-timestamp");
const btnIaCopiar = document.getElementById("btn-modal-ia-copiar");
const btnIaWpp = document.getElementById("btn-modal-ia-wpp");
const btnIaWppTexto = document.getElementById("btn-modal-ia-wpp-texto");
const btnIaRegenerar = document.getElementById("btn-modal-ia-regenerar");
const btnIaFechar = document.getElementById("btn-modal-ia-fechar");

let orcamentoAtivo = null;
let tomAtivo = "fechamento";

function normalizarTelefoneWpp(telefone) {
  if (!telefone) return "";
  const limpo = String(telefone).replace(/\D/g, "");
  if (!limpo) return "";
  if (limpo.length === 10 || limpo.length === 11) {
    return `55${limpo}`;
  }
  if (limpo.startsWith("55") && (limpo.length === 12 || limpo.length === 13)) {
    return limpo;
  }
  return limpo;
}

function obterIniciais(nome) {
  if (!nome) return "👤";
  const partes = String(nome).trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "👤";
  if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function obterHorarioAtual() {
  const agora = new Date();
  const h = String(agora.getHours()).padStart(2, "0");
  const m = String(agora.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function atualizarContadorCaracteres() {
  if (!modalIaTextarea || !modalIaCharCount) return;
  const len = modalIaTextarea.value.length;
  modalIaCharCount.textContent = `${len} caractere${len === 1 ? "" : "s"}`;
}

function ajustarAlturaTextarea() {
  if (!modalIaTextarea) return;
  modalIaTextarea.style.height = "auto";
  modalIaTextarea.style.height = `${Math.min(220, Math.max(85, modalIaTextarea.scrollHeight))}px`;
}

function atualizarLinkWpp(textoMensagem) {
  if (!btnIaWpp) return;
  const foneLimpo = orcamentoAtivo ? normalizarTelefoneWpp(orcamentoAtivo.telefone) : "";

  if (foneLimpo) {
    btnIaWpp.classList.remove("disabled");
    btnIaWpp.href = `https://api.whatsapp.com/send?phone=${foneLimpo}&text=${encodeURIComponent(textoMensagem || "")}`;
    btnIaWpp.removeAttribute("aria-disabled");
    if (btnIaWppTexto) btnIaWppTexto.textContent = "Conversar no WhatsApp";
  } else {
    btnIaWpp.classList.add("disabled");
    btnIaWpp.removeAttribute("href");
    btnIaWpp.setAttribute("aria-disabled", "true");
    if (btnIaWppTexto) btnIaWppTexto.textContent = "⚠️ Cliente sem telefone cadastrado";
  }
}

export async function abrirModalIaOportunidade(orc) {
  if (!modalIa) return;
  orcamentoAtivo = orc;

  // Reseta tom para o padrão
  tomAtivo = "fechamento";
  document.querySelectorAll(".ia-tone-chip").forEach(chip => {
    chip.classList.toggle("active", chip.getAttribute("data-tom") === "fechamento");
  });

  const nomeCli = orc.clienteNome || "Cliente";
  if (modalIaNome) modalIaNome.textContent = nomeCli;
  if (modalIaAvatar) modalIaAvatar.textContent = obterIniciais(nomeCli);

  if (modalIaPlano) {
    const valor = Number(orc.valorFinal || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const dias = orc.diasCorridos !== undefined 
      ? (orc.diasCorridos === 0 ? "apresentado hoje" : `há ${orc.diasCorridos} dia${orc.diasCorridos > 1 ? "s" : ""}`)
      : "";
    modalIaPlano.textContent = `💎 ${orc.nomePlano || "Plano"} • ${valor} ${dias ? `• ${dias}` : ""}`;
  }

  if (modalIaTimestamp) {
    modalIaTimestamp.textContent = obterHorarioAtual();
  }

  // Prepara estado inicial do botão WhatsApp
  atualizarLinkWpp("");

  modalIa.style.display = "flex";
  await executarGeracaoIa({ forcarNovo: false });
}

async function executarGeracaoIa({ forcarNovo = false } = {}) {
  if (!orcamentoAtivo) return;

  if (modalIaLoading) modalIaLoading.style.display = "flex";
  if (modalIaCorpo) modalIaCorpo.style.display = "none";
  if (btnIaCopiar) btnIaCopiar.disabled = true;

  try {
    const mensagemIa = await gerarMensagemOportunidadeIa({
      clienteNome: orcamentoAtivo.clienteNome,
      nomePlano: orcamentoAtivo.nomePlano,
      valorFinal: orcamentoAtivo.valorFinal,
      diasCorridos: orcamentoAtivo.diasCorridos ?? 1,
      fila: orcamentoAtivo.fila || "aguardando",
      vemHoje: Boolean(orcamentoAtivo.vemHoje),
      horarioHoje: orcamentoAtivo.horarioHoje || "",
      vendedora: orcamentoAtivo.vendedora || "Consultora",
      tom: tomAtivo,
      forcarNovo
    });

    if (modalIaTextarea) {
      modalIaTextarea.value = mensagemIa;
    }

    if (modalIaTimestamp) {
      modalIaTimestamp.textContent = obterHorarioAtual();
    }

    atualizarLinkWpp(mensagemIa);
    atualizarContadorCaracteres();
    ajustarAlturaTextarea();

    if (modalIaCorpo) modalIaCorpo.style.display = "block";
    if (btnIaCopiar) btnIaCopiar.disabled = false;
  } catch (err) {
    if (modalIaTextarea) {
      modalIaTextarea.value = `Não foi possível gerar a mensagem agora: ${err.message}.\n\nVocê pode usar o script padrão do card ou tentar novamente.`;
    }
    atualizarLinkWpp(modalIaTextarea ? modalIaTextarea.value : "");
    if (modalIaCorpo) modalIaCorpo.style.display = "block";
  } finally {
    if (modalIaLoading) modalIaLoading.style.display = "none";
  }
}

export function fecharModalIaOportunidade() {
  if (modalIa) {
    modalIa.style.display = "none";
  }
  orcamentoAtivo = null;
}

// Listeners de Interação do Usuário
btnIaFechar?.addEventListener("click", () => {
  fecharModalIaOportunidade();
});

modalIa?.addEventListener("click", (e) => {
  if (e.target === modalIa) {
    fecharModalIaOportunidade();
  }
});

btnIaRegenerar?.addEventListener("click", () => {
  executarGeracaoIa({ forcarNovo: true });
});

// Seletor de Tons / Objetivos
document.querySelectorAll(".ia-tone-chip").forEach(chip => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".ia-tone-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    tomAtivo = chip.getAttribute("data-tom") || "fechamento";
    executarGeracaoIa({ forcarNovo: false });
  });
});

// Edição em Tempo Real do Texto no Balão do WhatsApp
modalIaTextarea?.addEventListener("input", (e) => {
  const texto = e.target.value;
  atualizarLinkWpp(texto);
  atualizarContadorCaracteres();
  ajustarAlturaTextarea();
});

// Ação de Copiar
btnIaCopiar?.addEventListener("click", async () => {
  if (!modalIaTextarea) return;
  const texto = modalIaTextarea.value.trim();
  if (!texto) return;

  try {
    await navigator.clipboard.writeText(texto);
    const textoAntigo = btnIaCopiar.innerHTML;
    btnIaCopiar.innerHTML = "✅ Copiado!";
    btnIaCopiar.classList.add("btn-copied");
    setTimeout(() => {
      btnIaCopiar.innerHTML = textoAntigo;
      btnIaCopiar.classList.remove("btn-copied");
    }, 1800);
  } catch (e) {
    modalIaTextarea.select();
    document.execCommand("copy");
    alert("Mensagem copiada para a área de transferência!");
  }
});

// Fechar com a tecla ESC
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modalIa && modalIa.style.display !== "none") {
    fecharModalIaOportunidade();
  }
});
