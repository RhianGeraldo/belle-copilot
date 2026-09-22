/**
 * BELLE COPILOT - MOTOR DE INTELIGÊNCIA ARTIFICIAL (OPENROUTER / GPT-4o-mini)
 * 
 * Integração centralizada com IA generativa para:
 * 1. Oportunidades & Vendas: Mensagens altamente persuasivas e personalizadas para resgate de orçamentos no WhatsApp.
 * 2. Atendimento & Ofertas: Pitches clínicos e scripts verbais sob medida para a aplicadora encantar na cadeira.
 */

import { state } from './state.js';

const _OR_KEY_ENCODED = "c2stb3ItdjEtMWZlMTEzMDhmNDVmZjliZTY1MzY2MDk2YjI0ZmI1M2Y5MTM2YmMzNThjYjc1NDhlNjA3OGEzZTFlNTI3YzE4MA==";
export const OPENROUTER_DEFAULT_KEY = (typeof atob === "function") 
  ? atob(_OR_KEY_ENCODED) 
  : (typeof Buffer !== "undefined" ? Buffer.from(_OR_KEY_ENCODED, "base64").toString("utf-8") : "");
export const OPENROUTER_DEFAULT_MODEL = "openai/gpt-4o-mini";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// Cache em memória para respostas de IA (evita chamadas repetidas desnecessárias)
const aiCache = new Map();

/**
 * Obtém a chave e o modelo configurados (suporta sobrescrita local via storage)
 */
export async function obterConfiguracaoIa() {
  let apiKey = OPENROUTER_DEFAULT_KEY;
  let model = OPENROUTER_DEFAULT_MODEL;

  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const res = await new Promise(r => chrome.storage.local.get(["openRouterApiKey", "openRouterModel"], r));
      if (res?.openRouterApiKey) apiKey = res.openRouterApiKey.trim();
      if (res?.openRouterModel) model = res.openRouterModel.trim();
    }
  } catch (e) {
    // Silencioso, usa defaults
  }

  return { apiKey, model };
}

/**
 * Salva customização de chave ou modelo da IA no storage local
 */
export async function salvarConfiguracaoIa({ apiKey, model }) {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    await new Promise(r => chrome.storage.local.set({
      openRouterApiKey: apiKey ? apiKey.trim() : OPENROUTER_DEFAULT_KEY,
      openRouterModel: model ? model.trim() : OPENROUTER_DEFAULT_MODEL
    }, r));
  }
}

/**
 * Executa uma chamada direta ao OpenRouter com tratamento de erro e timeout
 */
export async function chamarIaOpenRouter({ systemPrompt = "", prompt = "", temperature = 0.7, maxTokens = 400, cacheKeyOverride = undefined }) {
  const { apiKey, model } = await obterConfiguracaoIa();

  if (!apiKey) {
    throw new Error("Chave da API OpenRouter não configurada.");
  }

  const cacheKey = (cacheKeyOverride !== undefined) ? cacheKeyOverride : `${model}|${systemPrompt}|${prompt}`;
  if (cacheKey && aiCache.has(cacheKey)) {
    return aiCache.get(cacheKey);
  }

  const payload = {
    model: model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt }
    ],
    temperature: temperature,
    max_tokens: maxTokens
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000); // 18s timeout

  try {
    const res = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://belle-copilot.local",
        "X-Title": "Belle Copilot"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Erro OpenRouter HTTP ${res.status}: ${errText.substring(0, 200)}`);
    }

    const data = await res.json();
    const resposta = data.choices?.[0]?.message?.content?.trim() || "";

    if (!resposta) {
      throw new Error("A IA retornou uma resposta vazia.");
    }

    if (cacheKey) {
      aiCache.set(cacheKey, resposta);
    }
    return resposta;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      throw new Error("Tempo limite de resposta da IA excedido (18s). Verifique sua conexão.");
    }
    throw err;
  }
}

/**
 * Gera um pitch clínico de encantamento e script verbal para a aplicadora falar na maca
 */
export async function gerarPitchOfertaIa({
  clienteNome = "Cliente",
  primeiraArea = "Depilação a Laser",
  sessaoAtual = 1,
  totalSessoes = 10,
  fase = "Intermediária",
  sugestaoOferta = "Nova Região",
  motivoClinico = "",
  historicoAreas = [],
  observacoes = ""
}) {
  const primeiroNome = clienteNome.split(" ")[0];

  const systemPrompt = `Você é a maior especialista em vendas consultivas e atendimento humanizado em clínicas de estética e depilação a laser de alta performance.
Seu objetivo é instruir uma aplicadora/biomédica sobre EXATAMENTE o que e como falar com a cliente enquanto ela está na maca realizando a sessão, com extrema naturalidade, autoridade e empatia.

Diretrizes Obrigatórias:
1. Jamais pareça vendedora insistente ou robótica; a cliente deve sentir que é um conselho profissional de cuidado e resultado estético.
2. O script deve ser conversacional, leve e fácil de falar em voz alta na maca.
3. Responda em Português do Brasil com a seguinte estrutura em Markdown:
**💬 Script Falado na Maca:**
(O texto exato entre aspas que a aplicadora vai falar com a cliente com simpatia)

**💡 Por que funciona:**
(1 frase explicando o gatilho psicológico ou benefício estético direto para a cliente)

**🛡️ Se ela hesitar ou falar de preço/tempo:**
(1 frase curta de contorno de objeção suave e elegante)`;

  const prompt = `Contexto da Cliente:
- Nome da Cliente: ${primeiroNome}
- Procedimento de Hoje: ${primeiraArea}
- Progresso do Pacote: Sessão ${sessaoAtual} de ${totalSessoes} (${fase})
- Oferta / Prescrição Recomendada: ${sugestaoOferta}
- Motivo Clínico Base: ${motivoClinico || "Área complementar para melhor resultado estético"}
- Histórico de Áreas Conhecidas: ${historicoAreas.length > 0 ? historicoAreas.join(", ") : "Nenhuma anterior registrada"}
- Observações da pele/sessão: ${observacoes || "Nenhuma intercorrência"}

Gere o pitch clínico sob medida para esta cliente específica agora.`;

  return chamarIaOpenRouter({
    systemPrompt,
    prompt,
    temperature: 0.7,
    maxTokens: 350
  });
}

/**
 * Gera uma mensagem altamente persuasiva de WhatsApp para resgate de orçamento
 */
export async function gerarMensagemOportunidadeIa({
  clienteNome = "Cliente",
  nomePlano = "Plano a Laser",
  valorFinal = 0,
  diasCorridos = 1,
  fila = "aguardando",
  vemHoje = false,
  horarioHoje = "",
  vendedora = "Consultora",
  tom = "fechamento",
  forcarNovo = false
}) {
  const primeiroNome = clienteNome.split(" ")[0];
  const valorFormatado = Number(valorFinal || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const systemPrompt = `Você é uma especialista em Inside Sales e atendimento humanizado de altíssima conversão para clínicas de estética e depilação a laser no WhatsApp.
Seu objetivo é redigir mensagens curtas, elegantes, carinhosas e altamente persuasivas para avançar um orçamento pendente da cliente no WhatsApp.

Diretrizes Obrigatórias:
1. NUNCA use introduções formais antiquadas como "Olá, espero que esteja bem", "Venho por meio desta", "Gostaria de saber se tem interesse". Comece de forma natural, calorosa e fluida.
2. Use tom pessoal, próximo e seguro, como uma consultora atenciosa digitando no momento pelo celular.
3. Se a cliente estiver na agenda de hoje, o objetivo principal é convidá-la a conversar pessoalmente na clínica hoje quando ela vier!
4. Devolva APENAS o texto pronto da mensagem para envio no WhatsApp (com emojis dosados e negritos em *palavras-chave*). Não adicione saudações de sistema, nem explicações antes ou depois.`;

  let instrucaoTom = "";
  if (tom === "urgencia") {
    instrucaoTom = "Tom: URGÊNCIA ELEGANTE. Mencione que a agenda da profissional/sala para esta área está quase sem vagas para os próximos dias e que você quer garantir o horário dela.";
  } else if (tom === "empatico") {
    instrucaoTom = "Tom: ACOLHEDOR E EMPÁTICO. Destaque o carinho com o resultado dela, autoestima, liberdade da pele lisinha e que você está à disposição para qualquer dúvida ou insegurança.";
  } else if (tom === "condicao") {
    instrucaoTom = "Tom: OPORTUNIDADE & CONDIÇÃO EXCLUSIVA. Mencione que você conseguiu segurar uma condição facilitada (parcelamento flexível ou benefício especial) até esta semana.";
  } else {
    instrucaoTom = "Tom: FECHAMENTO CONSULTIVO. Direto ao ponto com simpatia, recapitulando a decisão e convidando para o próximo passo de início do tratamento.";
  }

  let situacao = "";
  if (vemHoje) {
    situacao = `A cliente ESTÁ AGENDADA PARA VIR À CLÍNICA HOJE às ${horarioHoje || "seu horário"}! Convide-a com carinho para bater um papo rápido de 2 minutinhos e formalizar o plano pessoalmente.`;
  } else if (diasCorridos <= 2) {
    situacao = `O orçamento foi apresentado há apenas ${diasCorridos === 0 ? "algumas horas hoje" : "1 dia"}. A conversa ainda está fresquinha na mente dela.`;
  } else if (diasCorridos <= 7) {
    situacao = `O orçamento foi apresentado há ${diasCorridos} dias. Lembrar com carinho e verificar se restou alguma dúvida.`;
  } else {
    situacao = `O orçamento foi apresentado há ${diasCorridos} dias (já esfriou). Resgatar o contato de forma leve e amigável.`;
  }

  const prompt = `Dados do Orçamento:
- Nome da Cliente: ${primeiroNome}
- Plano / Procedimento: ${nomePlano}
- Valor: ${valorFormatado}
- Idade do Orçamento: apresentado há ${diasCorridos} dia(s)
- Fila Atual: ${fila}
- Situação Específica: ${situacao}
- Consultora / Vendedora: ${vendedora}
- Diretriz de Tom: ${instrucaoTom}

Redija a mensagem perfeita para enviar no WhatsApp agora:`;

  // Quando o usuário clica em "Outra versão", variamos a temperatura ou invalidamos cache
  const cacheKey = forcarNovo ? null : `ia_msg_${clienteNome}_${nomePlano}_${tom}_${diasCorridos}`;

  return chamarIaOpenRouter({
    systemPrompt,
    prompt,
    temperature: forcarNovo ? 0.85 : 0.72,
    maxTokens: 300,
    cacheKeyOverride: cacheKey
  });
}

/**
 * Testa a conexão com o OpenRouter e retorna status
 */
export async function testarConexaoIa() {
  try {
    const res = await chamarIaOpenRouter({
      systemPrompt: "Você é um assistente de teste de conectividade.",
      prompt: "Responda apenas: 'OK'",
      temperature: 0.1,
      maxTokens: 10
    });
    return { success: true, mensagem: res };
  } catch (err) {
    return { success: false, erro: err.message };
  }
}
