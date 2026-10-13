/**
 * BELLE COPILOT - MODAL DE LANÇAMENTO RÁPIDO DE ORÇAMENTO (VOZ & TEXTO COM IA)
 * Permite à aplicadora falar pelo microfone (Web Speech API) ou digitar livremente
 * o que combinou com a cliente na maca. A IA estrutura a proposta e gera o WhatsApp na hora.
 */

import { state } from '../core/state.js';
import { estruturarOrcamentoPorIa } from '../core/ai-client.js';
import { registrarOportunidadeNoAtendiCrm } from '../core/atendi-crm-client.js';

let modalEl = null;
let recognition = null;
let isGravando = false;
let dadosOrcamentoAtual = null;
let callbackSalvar = null;

export function abrirPaginaPermissaoMicrofone() {
  const url = (typeof chrome !== "undefined" && chrome.runtime?.getURL)
    ? chrome.runtime.getURL("sidepanel/mic-permissao.html")
    : "mic-permissao.html";

  if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
    chrome.tabs.create({ url });
  } else {
    window.open(url, "_blank");
  }
}

function criarInstanciaReconhecimento() {
  const SpeechRecClass = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecClass) {
    console.warn("[Voz] Web Speech API não suportada neste ambiente.");
    return null;
  }

  const rec = new SpeechRecClass();
  rec.lang = "pt-BR";
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  rec.onstart = () => {
    isGravando = true;
    atualizarUIGravacao(true, "🔴 Ouvindo... Fale agora");
  };

  let historicoLocalFinal = "";

  rec.onresult = (event) => {
    let interimTranscript = "";

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const item = event.results[i];
      if (item.isFinal) {
        const trecho = (item[0]?.transcript || "").trim();
        if (trecho) {
          historicoLocalFinal = `${historicoLocalFinal} ${trecho}`.trim().replace(/\s+/g, " ");
        }
      } else {
        interimTranscript += (item[0]?.transcript || "");
      }
    }

    const falaAtual = `${historicoLocalFinal} ${interimTranscript}`.trim().replace(/\s+/g, " ");
    const textarea = document.getElementById("input-relato-orcamento");
    if (textarea) {
      textarea.setAttribute("data-base-voz", falaAtual);
      
      const itens = Array.from(ofertasSelecionadas);
      if (itens.length > 0) {
        textarea.value = `${itens.join(", ")}. ${falaAtual}`.trim();
      } else {
        textarea.value = falaAtual;
      }
    }
  };

  rec.onerror = (event) => {
    console.warn("[Voz] Evento de erro local:", event.error);
    isGravando = false;
    
    let msgErro = "Erro ao capturar áudio.";
    let linkPermissao = false;
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      msgErro = "Microfone não autorizado. Abrindo página para liberar...";
      linkPermissao = true;
      abrirPaginaPermissaoMicrofone();
    } else if (event.error === "no-speech") {
      msgErro = "Nenhuma fala detectada. Toque novamente para falar.";
    } else if (event.error === "network") {
      msgErro = "Falha de rede no reconhecimento do Google.";
    }
    
    atualizarUIGravacao(false, msgErro, true, linkPermissao);
  };

  rec.onend = () => {
    if (isGravando) {
      isGravando = false;
      atualizarUIGravacao(false);
    }
  };

  return rec;
}

let gravandoViaAbaBelle = false;

function atualizarUIGravacao(gravando, mensagemStatus = "", isErro = false, linkPermissao = false) {
  const btnMic = document.getElementById("btn-mic-orcamento");
  const txtMicStatus = document.getElementById("txt-mic-status");
  const statusMic = document.getElementById("status-mic-orcamento");
  const inputWrap = document.querySelector(".popup-input-mic-wrap");

  if (inputWrap) {
    if (gravando) {
      inputWrap.classList.add("ouvindo");
    } else {
      inputWrap.classList.remove("ouvindo");
    }
  }

  if (btnMic) {
    if (gravando) {
      btnMic.classList.add("gravando");
    } else {
      btnMic.classList.remove("gravando");
    }
  }

  if (txtMicStatus) {
    txtMicStatus.textContent = gravando ? "Parar" : "Falar por voz";
  }

  if (statusMic) {
    if (gravando) {
      statusMic.style.display = "inline-flex";
      statusMic.innerHTML = `<span class="mic-dot-pulse"></span><span>${mensagemStatus || "Gravando... Fale agora"}</span>`;
      statusMic.className = "mic-status-label ouvindo";
    } else if (isErro && mensagemStatus) {
      statusMic.style.display = "inline-flex";
      statusMic.className = "mic-status-label erro";
      if (linkPermissao) {
        statusMic.innerHTML = `<span>⚠️ ${mensagemStatus} <a href="#" id="link-abrir-mic-perm" style="color: #0284c7; text-decoration: underline; font-weight: 700; margin-left: 4px;">Clique para autorizar</a></span>`;
        const link = document.getElementById("link-abrir-mic-perm");
        link?.addEventListener("click", (e) => {
          e.preventDefault();
          abrirPaginaPermissaoMicrofone();
        });
      } else {
        statusMic.innerHTML = `<span>⚠️ ${mensagemStatus}</span>`;
      }
    } else {
      statusMic.style.display = "none";
      statusMic.textContent = "";
      statusMic.className = "mic-status-label";
    }
  }
}

function processarTextoVozRecebido(finalTexto = "", interimTexto = "") {
  const textarea = document.getElementById("input-relato-orcamento");
  if (!textarea) return;

  const falaAtual = `${finalTexto} ${interimTexto}`.trim().replace(/\s+/g, " ");
  textarea.setAttribute("data-base-voz", falaAtual);

  const itens = Array.from(ofertasSelecionadas);
  if (itens.length > 0) {
    textarea.value = `${itens.join(", ")}. ${falaAtual}`.trim();
  } else {
    textarea.value = falaAtual;
  }
}

async function obterAbaAtivaBelleId() {
  if (typeof chrome === "undefined" || !chrome.tabs) return null;
  try {
    const tabs = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
    const tabAtual = tabs?.[0];
    if (tabAtual?.id && tabAtual.url && tabAtual.url.includes("bellesoftware.com.br")) {
      return tabAtual.id;
    }
    // Fallback: qualquer aba aberta do Belle
    const todasTabs = await new Promise(r => chrome.tabs.query({ url: "*://*.bellesoftware.com.br/*" }, r));
    return todasTabs?.[0]?.id || null;
  } catch (e) {
    return null;
  }
}

let usarReconhecimentoLocalDireto = false;

// Verifica se a extensão já teve o microfone liberado anteriormente
try {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    chrome.storage.local.get(["mic_extensao_autorizado"], (res) => {
      if (res?.mic_extensao_autorizado) {
        usarReconhecimentoLocalDireto = true;
      }
    });
  }
} catch (e) {}

async function iniciarGravacao() {
  // Se o microfone já foi liberado diretamente para a extensão, grava local no painel sem passar pela página web
  if (usarReconhecimentoLocalDireto) {
    iniciarGravacaoLocal();
    return;
  }

  const tabId = await obterAbaAtivaBelleId();
  
  if (tabId) {
    gravandoViaAbaBelle = true;
    isGravando = true;
    atualizarUIGravacao(true, "🔴 Ouvindo... Fale agora");

    try {
      chrome.tabs.sendMessage(tabId, { action: "BELLE_VOZ_INICIAR" }, (response) => {
        if (chrome.runtime.lastError || !response?.sucesso) {
          console.warn("[Voz] Fallback para reconhecimento local:", chrome.runtime.lastError || response?.erro);
          gravandoViaAbaBelle = false;
          iniciarGravacaoLocal();
        }
      });
      return;
    } catch (e) {
      gravandoViaAbaBelle = false;
    }
  }

  iniciarGravacaoLocal();
}

function iniciarGravacaoLocal() {
  const SpeechRecClass = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecClass) {
    alert("Reconhecimento de voz não suportado neste navegador. Digite seu relato no campo de texto.");
    return;
  }

  if (recognition) {
    try { recognition.stop(); } catch (e) {}
  }

  recognition = criarInstanciaReconhecimento();
  if (!recognition) return;

  try {
    recognition.start();
    isGravando = true;
    atualizarUIGravacao(true, "🔴 Ouvindo... Fale o que combinou com a cliente");
  } catch (err) {
    console.warn("[Voz] Falha ao iniciar recognition local:", err);
    isGravando = false;
    atualizarUIGravacao(false, "Falha ao iniciar microfone. Tente novamente.");
  }
}

async function pararGravacao() {
  isGravando = false;
  if (gravandoViaAbaBelle) {
    gravandoViaAbaBelle = false;
    const tabId = await obterAbaAtivaBelleId();
    if (tabId) {
      try {
        chrome.tabs.sendMessage(tabId, { action: "BELLE_VOZ_PARAR" }, () => {
          const _ = chrome.runtime.lastError;
        });
      } catch (e) {}
    }
  }

  if (recognition) {
    try { recognition.stop(); } catch (e) {}
  }
  atualizarUIGravacao(false);
}

let ofertasDisponiveis = [];
let ofertasSelecionadas = new Set();

function sincronizarTextoComSelecao() {
  const textarea = document.getElementById("input-relato-orcamento");
  if (!textarea) return;

  const itens = Array.from(ofertasSelecionadas);
  const baseVoz = textarea.getAttribute("data-base-voz") || "";

  if (itens.length > 0) {
    const textoChips = itens.join(", ");
    textarea.value = baseVoz ? `${textoChips}. ${baseVoz}` : textoChips;
  } else if (baseVoz) {
    textarea.value = baseVoz;
  }
}

function renderizarChipsOfertas() {
  const container = document.getElementById("popup-orcamento-chips-container");
  const lista = document.getElementById("popup-orcamento-chips-list");
  if (!container || !lista) return;

  if (!Array.isArray(ofertasDisponiveis) || ofertasDisponiveis.length === 0) {
    container.style.display = "none";
    lista.innerHTML = "";
    return;
  }

  container.style.display = "flex";
  lista.innerHTML = "";

  ofertasDisponiveis.forEach((item) => {
    const textoOferta = typeof item === "string" ? item : (item.ofertaPrincipal || item.oQueOfertar || item.nome || "");
    if (!textoOferta) return;

    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `chip-orcamento-item ${ofertasSelecionadas.has(textoOferta) ? "selected" : ""}`;
    
    let icone = "✨";
    if (textoOferta.toLowerCase().includes("manutenção")) icone = "💎";
    else if (textoOferta.toLowerCase().includes("resgate") || textoOferta.toLowerCase().includes("fechar")) icone = "🔥";
    else if (textoOferta.toLowerCase().includes("expansão") || textoOferta.toLowerCase().includes("pacote")) icone = "⚡";

    chip.innerHTML = `<span class="chip-icon">${icone}</span><span>${textoOferta}</span>`;

    chip.addEventListener("click", () => {
      if (ofertasSelecionadas.has(textoOferta)) {
        ofertasSelecionadas.delete(textoOferta);
        chip.classList.remove("selected");
      } else {
        ofertasSelecionadas.add(textoOferta);
        chip.classList.add("selected");
      }
      sincronizarTextoComSelecao();
    });

    lista.appendChild(chip);
  });
}

export function abrirModalLancamentoOrcamento({ sugestaoInicial = "", ofertas = [], onSalvar = null } = {}) {
  modalEl = document.getElementById("modal-lancar-orcamento");
  if (!modalEl) return;

  callbackSalvar = onSalvar;
  dadosOrcamentoAtual = null;
  ofertasSelecionadas.clear();

  // Se passou lista de ofertas ou se tiver ofertas no módulo
  ofertasDisponiveis = Array.isArray(ofertas) && ofertas.length > 0 ? ofertas : [];

  const textarea = document.getElementById("input-relato-orcamento");
  if (textarea) {
    textarea.setAttribute("data-base-text", "");
    textarea.setAttribute("data-base-voz", "");
    
    if (sugestaoInicial) {
      ofertasSelecionadas.add(sugestaoInicial);
      textarea.value = sugestaoInicial;
    } else {
      textarea.value = "";
    }
    setTimeout(() => { textarea.focus(); }, 100);
  }

  const elClienteSub = document.getElementById("popup-orcamento-cliente-sub");
  if (elClienteSub) {
    const nome = state.selectedAppointment?.clienteNome || "Cliente em Atendimento";
    elClienteSub.textContent = `👤 ${nome}`;
  }

  renderizarChipsOfertas();
  pararGravacao();
  modalEl.style.display = "flex";
}

export function fecharModalLancamentoOrcamento() {
  pararGravacao();
  if (modalEl) modalEl.style.display = "none";
}

export function inicializarModalLancamentoOrcamento() {
  const modal = document.getElementById("modal-lancar-orcamento");
  if (!modal) return;

  const btnFechar = document.getElementById("btn-fechar-modal-orcamento");
  btnFechar?.addEventListener("click", fecharModalLancamentoOrcamento);

  const btnCancelar = document.getElementById("btn-fechar-cancelar-orcamento");
  btnCancelar?.addEventListener("click", fecharModalLancamentoOrcamento);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) fecharModalLancamentoOrcamento();
  });

  const btnMic = document.getElementById("btn-mic-orcamento");
  btnMic?.addEventListener("click", () => {
    if (isGravando) {
      pararGravacao();
    } else {
      iniciarGravacao();
    }
  });

  // Ouve eventos de voz enviados pelo content.js da aba ativa do Belle
  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.action === "BELLE_VOZ_EVENTO") {
        if (msg.tipo === "start") {
          isGravando = true;
          atualizarUIGravacao(true, "🔴 Ouvindo... Fale o que ofertou");
        } else if (msg.tipo === "result") {
          processarTextoVozRecebido(msg.final, msg.interim);
        } else if (msg.tipo === "error") {
          isGravando = false;
          gravandoViaAbaBelle = false;
          console.warn("[Voz Content Script] Erro de captura:", msg.erro);
          if (msg.erro === "not-allowed") {
            usarReconhecimentoLocalDireto = true;
            atualizarUIGravacao(false, "Microfone não autorizado. Abrindo página para liberar...", true, true);
            abrirPaginaPermissaoMicrofone();
          } else if (msg.erro === "no-speech") {
            atualizarUIGravacao(false, "Nenhuma fala detectada. Clique no microfone para tentar de novo.", true);
          } else {
            atualizarUIGravacao(false, `Erro na captura: ${msg.erro}`, true);
          }
        } else if (msg.tipo === "end") {
          isGravando = false;
          gravandoViaAbaBelle = false;
          atualizarUIGravacao(false);
        }
      }
    });
  }

  const btnSalvar = document.getElementById("btn-salvar-orc-fila");
  btnSalvar?.addEventListener("click", async () => {
    const textarea = document.getElementById("input-relato-orcamento");
    const texto = textarea?.value?.trim() || "";

    if (!texto) {
      alert("Por favor, digite ou fale o que foi ofertado para a cliente.");
      return;
    }

    pararGravacao();

    const loading = document.getElementById("loading-ia-orcamento");
    if (loading) loading.style.display = "flex";
    if (btnSalvar) btnSalvar.disabled = true;

    try {
      const app = state.selectedAppointment;
      const clienteNome = app?.clienteNome || "Cliente";
      const telefone = app?.telefone || "";

      // Estrutura rapidamente em segundo plano
      const dadosEstruturados = await estruturarOrcamentoPorIa({
        textoTranscrito: texto,
        clienteNome,
        pacotesAtuais: (state.todosPacotesCliente || []).map(p => p.nomePlano || p.servico).filter(Boolean)
      });

      // Salva no estado local e na lista de oportunidades
      if (typeof callbackSalvar === "function") {
        callbackSalvar(dadosEstruturados);
      }

      // Sincroniza com o Atendi CRM
      let crmMsg = "";
      let tituloCrmConfirmado = "";
      let crmResult = null;
      const aplicadoraNomeSessao = (app?.profissional || state.currentUserName || "Aplicadora").trim();

      try {
        crmResult = await registrarOportunidadeNoAtendiCrm({
          clienteNome,
          telefone,
          nomePlano: dadosEstruturados.nomePlano || texto,
          valorEstimado: (typeof dadosEstruturados.valorTotalNumerico === "number" && dadosEstruturados.valorTotalNumerico > 0)
            ? dadosEstruturados.valorTotalNumerico
            : (dadosEstruturados.valorEstimado || 0),
          condicaoPagamento: dadosEstruturados.condicaoPagamento || "",
          areasMencionadas: dadosEstruturados.areas || [],
          sessoes: dadosEstruturados.sessoes || 0,
          resumoMaca: dadosEstruturados.resumoMaca || "",
          relatoTexto: texto,
          aplicadoraNome: aplicadoraNomeSessao
        });
        if (crmResult?.sucesso) {
          tituloCrmConfirmado = crmResult.titulo;
          crmMsg = `\n🚀 Enviado para o Atendi CRM:\n📌 ${crmResult.titulo} (Etapa: Orçamento Gerado)`;
        }
      } catch (crmErr) {
        console.warn("[Atendi CRM] Falha ao enviar para CRM:", crmErr);
      }

      const tituloExibicao = tituloCrmConfirmado || `Cabine - ${dadosEstruturados.nomePlano || texto} — ${clienteNome.split(" ")[0].trim()}`;
      const valorFinalFormatado = crmResult?.valorFormatado || dadosEstruturados.valorEstimado || "A definir";
      const aplicadoraExibicao = crmResult?.aplicadoraNome || aplicadoraNomeSessao;

      fecharModalLancamentoOrcamento();

      // Exibe Popup Elegante com todos os detalhes da oportunidade criada exatamente como chega no Atendi CRM
      exibirPopupSucessoOrcamento({
        titulo: tituloExibicao,
        clienteNome: clienteNome,
        valorFormatado: valorFinalFormatado,
        condicaoPagamento: dadosEstruturados.condicaoPagamento || "",
        funilNome: crmResult?.funilNome || "Vendas",
        etapaNome: crmResult?.etapaNome || "Orçamento Gerado",
        unidadeNome: crmResult?.unidadeNome || state.currentClinicaNome || "Linhares",
        aplicadoraNome: aplicadoraExibicao,
        resumoConversa: dadosEstruturados.resumoMaca || texto
      });
    } catch (err) {
      console.warn("[Orçamento] Erro ao estruturar:", err);
      fecharModalLancamentoOrcamento();

      // Extrai determinístico caso a IA falhe totalmente
      let valFallback = "A definir";
      let condFallback = "";
      const matchParcelas = texto.match(/(\d{1,2})\s*(?:x|vezes(?:\s*de)?|de)\s*(?:R\$\s*)?(\d+(?:[.,]\d{1,2})?)/i);
      if (matchParcelas) {
        const qtd = parseInt(matchParcelas[1], 10) || 1;
        const unit = parseFloat(matchParcelas[2].replace(",", ".")) || 0;
        const tot = Math.round(qtd * unit * 100) / 100;
        valFallback = tot.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        condFallback = `${qtd}x de ${unit.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`;
      }

      exibirPopupSucessoOrcamento({
        titulo: `Cabine - Orçamento de Tratamento a Laser`,
        clienteNome: state.selectedAppointment?.clienteNome || "Cliente",
        valorFormatado: valFallback,
        condicaoPagamento: condFallback,
        funilNome: "Vendas",
        etapaNome: "Orçamento Gerado",
        unidadeNome: "Unidade",
        resumoConversa: texto
      });
    } finally {
      if (loading) loading.style.display = "none";
      if (btnSalvar) btnSalvar.disabled = false;
    }
  });
}

export function exibirPopupSucessoOrcamento({
  titulo = "Cabine — Oportunidade",
  clienteNome = "Cliente",
  valorFormatado = "A definir",
  condicaoPagamento = "",
  funilNome = "Vendas",
  etapaNome = "Orçamento Gerado",
  unidadeNome = "Unidade",
  aplicadoraNome = "",
  resumoConversa = ""
} = {}) {
  const modalSucesso = document.getElementById("modal-sucesso-orcamento");
  if (!modalSucesso) return;

  const elTitulo = document.getElementById("sucesso-orc-titulo");
  const elCliente = document.getElementById("sucesso-orc-cliente");
  const elValor = document.getElementById("sucesso-orc-valor");
  const elCondicao = document.getElementById("sucesso-orc-condicao");
  const rowCondicao = document.getElementById("sucesso-orc-condicao-row");
  const elFunil = document.getElementById("sucesso-orc-funil");
  const elEtapa = document.getElementById("sucesso-orc-etapa");
  const elUnidade = document.getElementById("sucesso-orc-unidade");
  const elAplicadora = document.getElementById("sucesso-orc-aplicadora");
  const elResumo = document.getElementById("sucesso-orc-resumo");
  const rowResumo = document.getElementById("sucesso-orc-resumo-row");

  if (elTitulo) elTitulo.textContent = titulo;
  if (elCliente) elCliente.textContent = `👤 ${clienteNome}`;
  if (elValor) elValor.textContent = valorFormatado || "A definir";
  if (elFunil) elFunil.textContent = funilNome || "Vendas";
  if (elEtapa) elEtapa.textContent = etapaNome || "Orçamento Gerado";
  if (elUnidade) elUnidade.textContent = `🏢 ${unidadeNome || "Unidade"}`;
  if (elAplicadora) elAplicadora.textContent = `👩‍⚕️ ${aplicadoraNome || state.currentUserName || "Aplicadora"}`;

  if (elCondicao) {
    if (condicaoPagamento && condicaoPagamento !== "A definir") {
      elCondicao.textContent = condicaoPagamento;
      if (rowCondicao) rowCondicao.style.display = "flex";
    } else if (rowCondicao) {
      rowCondicao.style.display = "none";
    }
  }

  if (elResumo) {
    const textoResumo = resumoConversa?.trim();
    if (textoResumo) {
      elResumo.textContent = `"${textoResumo}"`;
      if (rowResumo) rowResumo.style.display = "flex";
    } else if (rowResumo) {
      rowResumo.style.display = "none";
    }
  }

  modalSucesso.style.display = "flex";

  const btnFecharX = document.getElementById("btn-fechar-sucesso-orcamento");
  const btnFecharOk = document.getElementById("btn-fechar-sucesso-ok");

  const fechar = () => {
    modalSucesso.style.display = "none";
  };

  btnFecharX?.addEventListener("click", fechar, { once: true });
  btnFecharOk?.addEventListener("click", fechar, { once: true });
  modalSucesso.addEventListener("click", (e) => {
    if (e.target === modalSucesso) fechar();
  }, { once: true });
}

export function fecharPopupSucessoOrcamento() {
  const modalSucesso = document.getElementById("modal-sucesso-orcamento");
  if (modalSucesso) modalSucesso.style.display = "none";
}
