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
// Deduplicação de requisições simultâneas em voo (evita disparar múltiplos fetches idênticos ao mesmo tempo)
const inFlightRequests = new Map();

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
export async function chamarIaOpenRouter({ systemPrompt = "", prompt = "", temperature = 0.7, maxTokens = 400, cacheKeyOverride = undefined, responseFormat = undefined }) {
  const { apiKey, model } = await obterConfiguracaoIa();

  if (!apiKey) {
    throw new Error("Chave da API OpenRouter não configurada.");
  }

  const cacheKey = (cacheKeyOverride !== undefined) ? cacheKeyOverride : `${model}|${systemPrompt}|${prompt}`;
  if (cacheKey && aiCache.has(cacheKey)) {
    return aiCache.get(cacheKey);
  }

  // Deduplicação de chamadas simultâneas (em voo)
  if (cacheKey && inFlightRequests.has(cacheKey)) {
    console.log(`[IA] ⚡ Reutilizando requisição em voo para a chave: ${cacheKey}`);
    return inFlightRequests.get(cacheKey);
  }

  const execPromessa = (async () => {
    const payload = {
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      temperature: temperature,
      max_tokens: maxTokens
    };

    if (responseFormat) {
      payload.response_format = responseFormat;
    }

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
    } finally {
      if (cacheKey) {
        inFlightRequests.delete(cacheKey);
      }
    }
  })();

  if (cacheKey) {
    inFlightRequests.set(cacheKey, execPromessa);
  }

  return execPromessa;
}

/**
 * Analisa o perfil completo do cliente e gera a oferta clínica estruturada diretamente com GPT-4o-mini.
 * Retorna JSON com { oQueOfertar, porQueOfertar, fasePill, tipoFase }
 */
/**
 * Analisa o perfil completo do cliente e prescreve a oferta perfeita com GPT-4o-mini.
 * Informações fornecidas à IA:
 * 1. Todas as áreas que o cliente JÁ TEM em todos os pacotes (com sessões totais, realizadas e saldo).
 * 2. As áreas que ela está atendendo hoje na maca.
 * 3. As áreas que ela NUNCA FEZ (para sugerir expansão como Meia Perna se ela só tem Axilas/Virilha).
 * 4. Situação de cortesia ou reta final (manutenção preventiva).
 */
export async function analisarOfertaClinicaComIa({
  clienteNome = "Cliente",
  areaHoje = "Depilação a Laser",
  sessaoAtualHoje = 1,
  totalSessoesHoje = 10,
  saldoHoje = null,
  pacotesAtivos = [],               // Array de { area, plano, realizadas, total, saldo, validade }
  pacotesFinalizadosOuVencidos = [], // Array de { area, plano, realizadas, total, saldo, status }
  orcamentosPendentes = [],         // Array de { area, plano, valorFinal, diasCorridos, statusRotulo }
  areasNuncaFeitas = [],            // Array de strings com áreas livres do corpo
  historicoAreas = [],
  sexo = null
}) {
  const primeiroNome = clienteNome.split(" ")[0];

  const systemPrompt = `Você é o Diretor Comercial e Clínico de maior autoridade em clínicas de depilação a laser e estética avançada.
Sua missão é analisar os 4 grupos da cliente e prescrever de 2 a 3 opções de ofertas perfeitas para a aplicadora lançar hoje na maca.

REGRAS CLÍNICAS FUNDAMENTAIS:
1. ATENÇÃO CRÍTICA AO STATUS DE CADA ÁREA (NÃO CONFUNDA ÁREAS EM ANDAMENTO COM ÁREAS CONCLUÍDAS):
   - GRUPO 1 são áreas que a cliente ESTÁ TRATANDO ATUALMENTE (pacote ativo com saldo em andamento, ex: Axilas na 5ª sessão). Ela NÃO concluiu esse tratamento ainda! NUNCA diga que ela "já concluiu" uma área que está listada no Grupo 1 como ativa!
   - GRUPO 2 são áreas que a cliente JÁ FINALIZOU OU VENCERAM NO PASSADO (sessões zeradas ou plano antigo expirado, ex: Virilha Completa). Apenas para estas áreas do Grupo 2 é correto dizer "A cliente já concluiu [Área] no passado".

2. CAMPO "contextoHistorico" (DEVE SER USADO EXCLUSIVAMENTE PARA ÁREAS CONCLUÍDAS/VENCIDAS OU RESGATE):
   - Se a oferta for de MANUTENÇÃO (Área do Grupo 2): preencha "contextoHistorico" com: "Cliente já realizou [Área] no passado — oferecer manutenção periódica".
   - Se a oferta for de RESGATE (Área do Grupo 3): preencha "contextoHistorico" com: "Cliente possui proposta pendente em aberto — fechar na recepção/maca".
   - Se a oferta for de EXPANSÃO (Nova Área do Grupo 4 nunca contratada): DEIXE "contextoHistorico" COMO STRING VAZIA (""). Em áreas nunca feitas, a justificativa vai apenas no "porQueOfertar" destacando o benefício estético daquela região e complementando o tratamento atual da cliente (ex: "Enquanto trata axilas e buço, iniciar pernas ou braços garante o corpo sem pelos").

3. ORÇAMENTOS PENDENTES (Grupo 3 - Propostas em Aberto):
   - Se a cliente possui propostas pendentes em aberto, SEMPRE inclua 1 opção para FECHAR ESSE ORÇAMENTO PENDENTE (ex: "Fechar Proposta Pendente de Meia Perna").
   - A cliente já demonstrou interesse real e o orçamento já está montado. A presença dela na clínica hoje é o momento perfeito para tirar dúvidas e fechar a condição!
   - fasePill: "🔥 Resgate • Nome da Área"
   - tipoFase: "pendente"

4. ÁREAS FINALIZADAS OU VENCIDAS (Grupo 2 - Concluídas / Vencidas):
   - A cliente já concluiu ou teve essas áreas no passado.
   - Ofereça MANUTENÇÃO ANUAL ou RETOQUE PREVENTIVO (Ex: "Plano de Manutenção Anual em Virilha Completa").
   - Explique que previne o retorno de folículos e pelos residuais por oscilações hormonais naturais.
   - NUNCA ofereça pacote do zero (10 sessões) para quem já terminou o tratamento dessa área.
   - fasePill: "💎 Manutenção • Nome da Área"
   - tipoFase: "renovacao"

5. ÁREAS NUNCA CONTRATADAS (Grupo 4 - Expansão):
   - Ofereça PACOTE COMPLETO 10 SESSÕES (Ex: "Pacote Meia Perna 10 Sessões", "Pacote Coxa 10 Sessões").
   - NUNCA ofereça pacote de 10 sessões para áreas que a cliente já finalizou, tem ativas ou já tem orçamento pendente.
   - fasePill: "⚡ Expansão • Nome da Área"
   - tipoFase: "expansao"

6. ÁREAS ATIVAS NO MOMENTO (Grupo 1):
   - Se estiver na Reta Final (saldo <= 2 sessões ou sessão >= 8), ofereça Manutenção Preventiva dessa área.
   - Se for Cortesia (total <= 3), ofereça completar o ciclo (+7 sessões para 10 sessões).
   - Se estiver em andamento (ex: 5ª sessão com saldo abundante), NÃO recomende essa mesma área.

IMPORTANTE PARA O CAMPO "fasePill":
- Coloque APENAS a classificação limpa SEM emojis (o sistema já renderiza o ícone visual na interface). Exemplos:
  - "Resgate • Meia Perna"
  - "Manutenção • Virilha"
  - "Expansão • Coxa"
  - "Cortesia • Ciclo Completo"
- NUNCA inclua emojis no texto de "fasePill" nem no "oQueOfertar" (ex: use "Manutenção Anual em Virilha Completa", NUNCA "💎 Manutenção Anual...").

Responda ESTRITAMENTE em formato JSON puro (sem markdown de código \`\`\`json), com este formato:
{
  "ofertas": [
    {
      "oQueOfertar": "Título atraente da oferta sem emojis",
      "porQueOfertar": "Justificativa comercial e clínica curta (1 a 2 frases)",
      "contextoHistorico": "Preencher apenas se for Manutenção (Grupo 2) ou Resgate (Grupo 3). Deixar string vazia '' para expansão de novas áreas",
      "fasePill": "Resgate • Área | Manutenção • Área | Expansão • Área",
      "tipoFase": "pendente | renovacao | expansao | cortesia"
    }
  ]
}`;

  const formatarLinhaAtiva = (p) => {
    return `- ${p.area || p.plano} (EM ANDAMENTO: ${p.realizadas || 0}/${p.total || 10} sessões feitas • Saldo: ${p.saldo ?? 'N/D'}${p.validade ? ' • Validade: ' + p.validade : ''}${p.ehCortesia ? ' • [CORTESIA]' : ''})`;
  };

  const formatarLinhaFinalizada = (p) => {
    return `- ${p.area || p.plano} (FINALIZADO / VENCIDO NO PASSADO: ${p.status || 'Ciclo concluído'}${p.validade ? ' • Vencimento: ' + p.validade : ''})`;
  };

  const formatarLinhaPendente = (p) => {
    return `- ${p.area || p.plano} (ORÇAMENTO PENDENTE: Status ${p.statusRotulo || 'Pendente'}${p.valorFinal ? ' • Valor: ' + p.valorFinal : ''}${p.diasCorridos !== undefined ? ' • Apresentado há ' + p.diasCorridos + ' dia(s)' : ''})`;
  };

  const prompt = `PERFIL DA CLIENTE:
- Nome: ${primeiroNome} (Gênero: ${sexo || "Feminino"})
- TRATANDO HOJE NA MACA: ${areaHoje} (Sessão ${sessaoAtualHoje} de ${totalSessoesHoje} • Saldo hoje: ${saldoHoje})

GRUPO 1: ÁREAS ATIVAS NO MOMENTO (PACOTES EM ANDAMENTO COM SALDO — NÃO CONCLUÍDOS):
${pacotesAtivos.length > 0 ? pacotesAtivos.map(formatarLinhaAtiva).join("\n") : "- Apenas o agendamento de hoje registrado"}

GRUPO 2: ÁREAS JÁ FINALIZADAS OU VENCIDAS NO PASSADO (Oportunidade de MANUTENÇÃO ANUAL / RETOQUE):
${pacotesFinalizadosOuVencidos.length > 0 ? pacotesFinalizadosOuVencidos.map(formatarLinhaFinalizada).join("\n") : "- Nenhuma área finalizada ou vencida registrada"}

GRUPO 3: ORÇAMENTOS PENDENTES EM ABERTO (A CLIENTE JÁ TEM PROPOSTA MAS AINDA NÃO FECHOU/PAGOU):
${orcamentosPendentes.length > 0 ? orcamentosPendentes.map(formatarLinhaPendente).join("\n") : "- Nenhum orçamento pendente em aberto"}

GRUPO 4: ÁREAS DO CORPO QUE A CLIENTE NUNCA CONTRATOU (Oportunidade de PACOTE COMPLETO 10 SESSÕES):
${areasNuncaFeitas.length > 0 ? areasNuncaFeitas.join(", ") : "Virilha Completa, Meia Perna, Coxa, Glúteos, Linha Alba, Braços"}

Prescreva de 2 a 3 opções de ofertas em JSON agora:`;

  const cacheKey = `ia_of_v8_${clienteNome}_${areaHoje}_${sessaoAtualHoje}_${pacotesAtivos.length}_${pacotesFinalizadosOuVencidos.length}_${orcamentosPendentes.length}_${areasNuncaFeitas.length}`;

  const respostaBruta = await chamarIaOpenRouter({
    systemPrompt,
    prompt,
    temperature: 0.35,
    maxTokens: 550,
    cacheKeyOverride: cacheKey,
    responseFormat: { type: "json_object" }
  });

  try {
    const jsonLimpo = respostaBruta.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(jsonLimpo);

    const sanitizarItem = (item) => {
      if (!item) return item;
      // Remove emojis do início de oQueOfertar e fasePill para evitar duplicação visual com os ícones do card
      const regexEmoji = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\s•–—-]+/u;
      if (item.oQueOfertar) {
        item.oQueOfertar = item.oQueOfertar.replace(regexEmoji, "").trim();
      }
      if (item.fasePill) {
        item.fasePill = item.fasePill.replace(regexEmoji, "").trim();
      }
      return item;
    };

    if (Array.isArray(parsed.ofertas) && parsed.ofertas.length > 0) {
      return parsed.ofertas.map(sanitizarItem);
    }
    if (parsed.oQueOfertar) {
      return [sanitizarItem(parsed)];
    }
    return null;
  } catch (err) {
    console.warn("[IA] Falha ao parsear JSON da oferta:", err, respostaBruta);
    return null;
  }
}

/**
 * Gera um pitch clínico de encantamento e script verbal para a aplicadora falar na maca
 * Estruturado com a tríade de alta performance: O QUE, POR QUE e O COMO.
 */
export async function gerarPitchOfertaIa({
  clienteNome = "Cliente",
  primeiraArea = "Depilação a Laser",
  sessaoAtual = 1,
  totalSessoes = 10,
  fase = "Intermediária",
  tipoFase = "expansao",
  sugestaoOferta = "Nova Região",
  motivoClinico = "",
  historicoAreas = [],
  todosPacotesCliente = [],
  observacoes = ""
}) {
  const primeiroNome = clienteNome.split(" ")[0];

  const systemPrompt = `Você é a maior especialista em vendas consultivas e atendimento humanizado em clínicas de estética e depilação a laser de alta performance.
Seu objetivo é instruir a aplicadora/biomédica com clareza cirúrgica em 3 pilares:
1. O QUE: A prescrição exata da oferta/serviço que faz sentido hoje.
2. POR QUE: O fundamento clínico, comercial e estético que torna essa oferta perfeita para o momento da cliente.
3. O COMO: O script verbal exato, natural e caloroso para falar na maca sem parecer vendedora chata, além de um contorno de objeção elegante.

Regras Clínicas de Negócio:
- CORTESIA (ex: 3 sessões de axilas): Enfatize que a cortesia é para comprovar o conforto e a ausência de dor, mas para o resultado ser 100% definitivo e não nascer mais pelos, é necessário fechar as sessões restantes para completar o ciclo de 10 sessões.
- RETA FINAL / REVENDA (saldo acabando, sessão 8/10 a 10/10): Parabenize pelo sucesso do tratamento e prescreva o Plano de Manutenção Anual/Semestral para garantir que variações hormonais nunca tragam pelos de volta.
- CROSS-SELL / AFINIDADE (ex: tem axilas e virilha): Prescreva a área vizinha/complementar (ex: meia perna) para fechar o corpo livre de lâminas.

Responda em Português do Brasil estritamente no seguinte formato em Markdown:
🎯 **O Que Ofertar:**
(Nome direto do pacote/procedimento sugerido, quantidade de sessões e benefício principal)

🧠 **Por Que Ofertar:**
(Explicação curta em 1 a 2 frases do motivo clínico e comercial com base no histórico dela)

💬 **Como Falar na Maca (Script Verbal):**
(Texto exato entre aspas para a aplicadora falar com extrema simpatia e autoridade na maca)

🛡️ **Se Ela Hesitar (Como Contornar):**
(1 frase simples e empática contornando dúvidas de tempo, dor ou valor)`;

  const prompt = `Contexto Completo da Cliente:
- Nome da Cliente: ${primeiroNome}
- Área(s) Tratada(s) Hoje: ${primeiraArea}
- Progresso do Pacote Atual: Sessão ${sessaoAtual} de ${totalSessoes} (${fase} • Tipo: ${tipoFase})
- Oferta Sugerida pelo Sistema: ${sugestaoOferta}
- Motivo Clínico Detectado: ${motivoClinico || "Área complementar e estratégica"}
- Todos os Pacotes Contratados pela Cliente: ${todosPacotesCliente.length > 0 ? todosPacotesCliente.join(" | ") : "Apenas o agendamento de hoje"}
- Histórico de Áreas Tratadas: ${historicoAreas.length > 0 ? historicoAreas.join(", ") : "Primeiras sessões registradas"}
- Observações da Pele/Sessão: ${observacoes || "Nenhuma intercorrência"}

Gere a análise (O QUE, POR QUE e O COMO) sob medida para esta cliente agora:`;

  return chamarIaOpenRouter({
    systemPrompt,
    prompt,
    temperature: 0.7,
    maxTokens: 400
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
 * Interpreta texto livre ou transcrição de áudio da aplicadora e estrutura
 * os dados do orçamento (áreas, sessões, valores, condições e observação clínica)
 */
export async function estruturarOrcamentoPorIa({
  textoTranscrito = "",
  clienteNome = "Cliente",
  pacotesAtuais = []
}) {
  const systemPrompt = `Você é um assistente de vendas e faturamento de clínicas de estética e depilação a laser de alta performance.
Sua missão é analisar o relato em áudio/texto livre que uma aplicadora falou logo após atender a cliente e extrair os dados de um novo orçamento/venda comercial.

Regras de Extração e Cálculo Financeiro:
1. IDENTIFICAÇÃO DO PLANO/OPORTUNIDADE ("nomePlano"):
   - Deve ser um título COMERCIAL CONCISO e PROFISSIONAL do pacote/serviço ofertado (ex: "Manutenção Anual de Axilas", "Pacote Completo Virilha + Coxa 10SS", "Expansão Meia Perna + Pés").
   - NUNCA coloque no "nomePlano" frases soltas de conversa, nem o nome da cliente, nem o valor da parcela (ex: NÃO coloque "Ela vai ter um pacote de 12 vezes de 89.90"). Sintetize o nome do pacote que representa a oportunidade!
2. Identifique as áreas/procedimentos mencionados (ex: axilas, virilha, perna, buço, barba, coxa, braços, etc.).
3. Identifique a quantidade de sessões (se não especificado, assuma 10 sessões para pacotes completos ou o número que for falado).
4. REGRA FINANCEIRA CRUCIAL (VALOR TOTAL CHEIO PARA O CRM):
   - Se o relato falar parcelas (ex: "12 vezes de 89,90", "12x 89.90", "10 de 150", "6x de 99"), VOCÊ DEVE CALCULAR O VALOR TOTAL CHEIO MULTIPLICANDO A QUANTIDADE DE PARCELAS PELO VALOR DE CADA UMA:
     Exemplo: 12 * 89.90 = 1078.80 (Total: R$ 1.078,80).
   - O Google Speech às vezes transcreve números decimais com ponto (ex: "89.90") ou vírgula. Trate ambos como decimais monetários em Reais.
   - Forneça "valorTotalNumerico" como número float puro (ex: 1078.80).
   - Forneça "valorEstimado" formatado em moeda brasileira (ex: "R$ 1.078,80").
   - Em "condicaoPagamento", informe o parcelamento se houver (ex: "12x de R$ 89,90 sem juros").
   - Se nenhum valor for citado, use valorTotalNumerico: 0 e valorEstimado: "A definir".
5. Elabore um resumo comercial limpo e profissional em "resumoMaca".
6. Crie uma mensagem pronta, carinhosa e formalizada para a aplicadora/consultora mandar no WhatsApp da cliente com os detalhes do que conversaram.

Responda ESTRITAMENTE em formato JSON puro (sem crases ou formatação markdown de código), com a seguinte estrutura:
{
  "nomePlano": "Nome claro e profissional do pacote (ex: Manutenção Anual de Axilas ou Combo Coxa + Braços 10SS)",
  "areas": ["Área 1", "Área 2"],
  "sessoes": 10,
  "tipoNegociacao": "Cortesia para Completo | Reta Final / Manutenção | Expansão de Novas Áreas | Venda Avulsa",
  "valorEstimado": "R$ 1.078,80",
  "valorTotalNumerico": 1078.80,
  "condicaoPagamento": "12x de R$ 89,90",
  "resumoMaca": "1 frase resumindo o interesse da cliente na maca",
  "mensagemWhatsapp": "Texto amigável e pronto para envio no WhatsApp reforçando o combinado na maca com emojis delicados"
}`;

  const prompt = `Cliente: ${clienteNome}
Pacotes já existentes: ${pacotesAtuais.join(", ") || "Nenhum informado"}
Relato da Aplicadora (Voz ou Texto digitado):
"${textoTranscrito}"

Extraia o JSON agora:`;

  const respostaBruta = await chamarIaOpenRouter({
    systemPrompt,
    prompt,
    temperature: 0.3,
    maxTokens: 500
  });

  try {
    const jsonLimpo = respostaBruta.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    return JSON.parse(jsonLimpo);
  } catch (err) {
    console.warn("[IA] Falha ao parsear JSON de orçamento:", err, respostaBruta);

    // Fallback inteligente com extração determinística de áreas e parcelas
    let valorEstimadoFallback = "A definir";
    let valorTotalFallback = 0;
    let condicaoFallback = "A combinar na recepção";
    let nomePlanoFallback = "Proposta de Tratamento a Laser";

    // 1. Extrai parcelamento direto do relato (ex: 12 de 89,90 ou 12x 89.90)
    const matchParcelas = textoTranscrito.match(/(\d{1,2})\s*(?:x|vezes(?:\s*de)?|de)\s*(?:R\$\s*)?(\d+(?:[.,]\d{1,2})?)/i);
    if (matchParcelas) {
      const qtd = parseInt(matchParcelas[1], 10) || 1;
      const unit = parseFloat(matchParcelas[2].replace(",", ".")) || 0;
      valorTotalFallback = Math.round(qtd * unit * 100) / 100;
      const unitFmt = unit.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const totalFmt = valorTotalFallback.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      valorEstimadoFallback = totalFmt;
      condicaoFallback = `${qtd}x de ${unitFmt}`;
    }

    // 2. Extrai áreas citadas
    const areasEncontradas = [];
    const dicionarioAreas = ["virilha completa", "virilha", "coxa", "braço", "braços", "axilas", "axila", "buço", "glúteos", "glúteo", "perna", "meia perna", "costas", "abdômen"];
    const textoMin = textoTranscrito.toLowerCase();
    for (const a of dicionarioAreas) {
      if (textoMin.includes(a)) {
        const capitalizado = a.charAt(0).toUpperCase() + a.slice(1);
        if (!areasEncontradas.some(ja => ja.toLowerCase().includes(a) || a.includes(ja.toLowerCase()))) {
          areasEncontradas.push(capitalizado);
        }
      }
    }

    if (areasEncontradas.length > 0) {
      nomePlanoFallback = `Pacote Completo ${areasEncontradas.join(" + ")}`;
    }

    return {
      nomePlano: nomePlanoFallback,
      areas: areasEncontradas,
      sessoes: 10,
      tipoNegociacao: "Expansão de Novas Áreas",
      valorEstimado: valorEstimadoFallback,
      valorTotalNumerico: valorTotalFallback,
      condicaoPagamento: condicaoFallback,
      resumoMaca: textoTranscrito,
      mensagemWhatsapp: `Olá, ${clienteNome.split(' ')[0]}! Foi ótimo te atender hoje. Conforme combinamos, estamos reservando seu ${nomePlanoFallback}${valorEstimadoFallback !== "A definir" ? " por " + condicaoFallback : ""} para darmos continuidade ao seu tratamento!`
    };
  }
}
