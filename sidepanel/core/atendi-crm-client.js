/**
 * BELLE COPILOT - INTEGRAÇÃO CRM ATENDI (MCP CLIENT)
 * Envia orçamentos e oportunidades criadas na maca diretamente para o Atendi CRM
 */

import { state } from './state.js';

const ATENDI_MCP_ENDPOINT = "https://atendiai.vercel.app/api/mcp";
const ATENDI_MCP_TOKEN = "atendi_mcp_live_b68594087b29c17a3cd6d1a505d9d9d8421fe09a7bde91efeb6ba5c2beb9b244";

// Mapeamento das unidades conhecidas da rede
const MAPEAMENTO_UNIDADES = {
  "aracruz": "5798b389-93f9-48b5-80f9-8fb44233869e",
  "linhares": "707d0c9e-5ba4-44ca-b60d-e5568de46016",
  "mantena": "6718e8d4-b5d1-4488-8b66-9a43b8b015b8",
  "sao mateus": "5d947eb7-dfd2-4c08-a142-cc6af8d0b22c",
  "so-mateus": "5d947eb7-dfd2-4c08-a142-cc6af8d0b22c",
  "serra": "3141d1b4-bf15-439a-8c69-88c6d848cd90"
};

const ID_ETAPA_ORCAMENTO_GERADO = "21a431d4-13ec-42bf-97c7-b9bdb3f2a764";

/**
 * Invoca uma ferramenta exposta no endpoint MCP do Atendi
 */
export async function chamarFerramentaAtendiMcp(toolName, args = {}) {
  const payload = {
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: toolName,
      arguments: args
    },
    id: Date.now()
  };

  const res = await fetch(ATENDI_MCP_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${ATENDI_MCP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Erro HTTP ${res.status} ao chamar Atendi MCP: ${txt}`);
  }

  const json = await res.json();
  if (json.error) {
    throw new Error(`Erro MCP Atendi: ${json.error.message || JSON.stringify(json.error)}`);
  }

  const contentText = json.result?.content?.[0]?.text;
  if (contentText) {
    try {
      return JSON.parse(contentText);
    } catch (e) {
      return contentText;
    }
  }

  return json.result;
}

const NOMES_OFICIAIS_UNIDADES = {
  "5798b389-93f9-48b5-80f9-8fb44233869e": "Aracruz",
  "707d0c9e-5ba4-44ca-b60d-e5568de46016": "Linhares",
  "6718e8d4-b5d1-4488-8b66-9a43b8b015b8": "Mantena",
  "5d947eb7-dfd2-4c08-a142-cc6af8d0b22c": "São Mateus",
  "3141d1b4-bf15-439a-8c69-88c6d848cd90": "Serra"
};

/**
 * Resolve o UUID e o Nome da unidade no Atendi com base na unidade ativa do Belle
 */
function resolverUnidadeAtendi() {
  const fontesNome = [
    state.currentUnidadeDados?.nome,
    state.currentClinicaNome,
    state.currentEstabelecimentos?.find(e => String(e.cod) === String(state.currentCodEstab))?.nome
  ].filter(Boolean).map(s => String(s).toLowerCase());

  // Procura casamentos nas fontes de nomes
  for (const nome of fontesNome) {
    for (const [chave, uuid] of Object.entries(MAPEAMENTO_UNIDADES)) {
      if (nome.includes(chave)) {
        return {
          uuid,
          nome: NOMES_OFICIAIS_UNIDADES[uuid] || "Aracruz"
        };
      }
    }
  }

  // Mapeamento por código da filial do Belle se houver
  const codNum = String(state.currentCodEstab || state.unidadeAbaBelle || "").trim();
  if (codNum === "1") return { uuid: MAPEAMENTO_UNIDADES["aracruz"], nome: "Aracruz" };
  if (codNum === "3") return { uuid: MAPEAMENTO_UNIDADES["linhares"], nome: "Linhares" };
  if (codNum === "4") return { uuid: MAPEAMENTO_UNIDADES["sao mateus"], nome: "São Mateus" };
  if (codNum === "5") return { uuid: MAPEAMENTO_UNIDADES["serra"], nome: "Serra" };
  if (codNum === "6") return { uuid: MAPEAMENTO_UNIDADES["mantena"], nome: "Mantena" };

  // Fallback padrão: Aracruz
  const defaultUuid = "5798b389-93f9-48b5-80f9-8fb44233869e";
  return {
    uuid: defaultUuid,
    nome: NOMES_OFICIAIS_UNIDADES[defaultUuid] || "Aracruz"
  };
}

/**
 * Cria ou localiza o contato no Atendi e cria a oportunidade no funil de Vendas
 */
export async function registrarOportunidadeNoAtendiCrm({
  clienteNome = "Cliente",
  telefone = "",
  nomePlano = "Orçamento Laser",
  valorEstimado = 0,
  condicaoPagamento = "",
  areasMencionadas = [],
  sessoes = 0,
  resumoMaca = "",
  relatoTexto = "",
  aplicadoraNome = ""
}) {
  const { uuid: unidadeId, nome: unidadeNomeOficial } = resolverUnidadeAtendi();
  const telLimpo = String(telefone || "").replace(/\D/g, "");
  
  // Nome da profissional / aplicadora logada
  const nomeAplicadoraFinal = (aplicadoraNome || state.currentUserName || "Aplicadora").trim();

  let telFormatado = telLimpo;
  if (telLimpo.length >= 10 && telLimpo.length <= 11) {
    telFormatado = `55${telLimpo}`;
  }

  let contatoId = null;

  // 1. Tenta consultar contato existente por telefone
  if (telFormatado) {
    try {
      const respContato = await chamarFerramentaAtendiMcp("consultar_contato", { telefone: telFormatado });
      if (respContato?.contato?.id) {
        contatoId = respContato.contato.id;
      }
    } catch (e) {
      console.log("[Atendi CRM] Contato não localizado por telefone, criando novo...");
    }
  }

  // 2. Se não encontrou, cria novo contato
  if (!contatoId) {
    try {
      const dadosNovo = await chamarFerramentaAtendiMcp("criar_contato", {
        nome: clienteNome,
        telefone: telFormatado || "5500000000000",
        unidade_id: unidadeId,
        origem: "Belle Copilot",
        detalhes_origem: `Atendimento a laser na cabine por ${nomeAplicadoraFinal}`,
        observacoes: `👤 Cliente: ${clienteNome} | 👩‍⚕️ Aplicadora: ${nomeAplicadoraFinal} | Relato da Cabine: ${resumoMaca || relatoTexto}`
      });
      contatoId = dadosNovo?.contato?.id || dadosNovo?.id;
    } catch (errCriar) {
      console.warn("[Atendi CRM] Erro ao criar contato no Atendi:", errCriar);
    }
  }

  if (!contatoId) {
    throw new Error("Não foi possível vincular o contato no Atendi CRM.");
  }

  // 3. Cria a Oportunidade na etapa 'Orçamento Gerado' com VALOR TOTAL CHEIO
  let valorNumerico = 0;
  if (typeof valorEstimado === "number" && !isNaN(valorEstimado)) {
    valorNumerico = valorEstimado;
  } else if (typeof valorEstimado === "string") {
    const strVal = valorEstimado.trim();
    // Verifica se veio algo como "12x 89,90" ou "12 vezes de 89.90"
    const matchParcelas = strVal.match(/(\d{1,2})\s*(?:x|vezes(?:\s*de)?)\s*(?:R\$\s*)?(\d+(?:[.,]\d{1,2})?)/i);
    if (matchParcelas) {
      const qtd = parseInt(matchParcelas[1], 10) || 1;
      const valorUnit = parseFloat(matchParcelas[2].replace(",", ".")) || 0;
      valorNumerico = Math.round(qtd * valorUnit * 100) / 100;
    } else {
      // Formato brasileiro "1.078,80" ou americano "1078.80"
      let limpo = strVal.replace(/[^\d,\.]/g, "");
      if (limpo.includes(",") && limpo.includes(".")) {
        // Ex: 1.078,80 -> remove ponto de milhar e troca vírgula por ponto
        limpo = limpo.replace(/\./g, "").replace(",", ".");
      } else if (limpo.includes(",")) {
        limpo = limpo.replace(",", ".");
      }
      valorNumerico = parseFloat(limpo) || 0;
    }
  }

  // Fallback: se o relato ou resumo tiver padrão "12 vezes de 89,90" e o valorNumerico for baixo (ex: só o 89.90)
  if (relatoTexto || resumoMaca) {
    const textoAnalise = `${relatoTexto || ""} ${resumoMaca || ""}`;
    const matchRelatoParcela = textoAnalise.match(/(\d{1,2})\s*(?:x|vezes(?:\s*de)?)\s*(?:R\$\s*)?(\d+(?:[.,]\d{1,2})?)/i);
    if (matchRelatoParcela) {
      const qtd = parseInt(matchRelatoParcela[1], 10) || 1;
      const valorUnit = parseFloat(matchRelatoParcela[2].replace(",", ".")) || 0;
      const totalCalculado = Math.round(qtd * valorUnit * 100) / 100;
      // Se o valor extraído for apenas o valor da parcela individual, multiplica para valor total cheio
      if (totalCalculado > 0 && (valorNumerico === 0 || Math.abs(valorNumerico - valorUnit) < 0.05)) {
        valorNumerico = totalCalculado;
      }
    }
  }

  let nomeBaseOportunidade = String(nomePlano || "Orçamento").trim();
  // Remove se já vier prefixado com Cabine para não duplicar
  nomeBaseOportunidade = nomeBaseOportunidade.replace(/^cabine\s*[-–—:]\s*/i, "").trim();

  const primeiroNome = clienteNome ? clienteNome.split(" ")[0].trim() : "Cliente";
  const tituloOportunidade = `Cabine - ${nomeBaseOportunidade} — ${primeiroNome}`;

  // Monta observação estruturada rica e profissional para a oportunidade
  const partesObs = [];
  partesObs.push(`📍 Oportunidade gerada na Cabine (Belle Copilot)`);
  partesObs.push(`• Cliente: ${clienteNome}`);
  partesObs.push(`• Aplicadora: ${nomeAplicadoraFinal}`);
  partesObs.push(`• Plano / Procedimento: ${nomeBaseOportunidade}`);
  if (valorNumerico > 0) {
    const valorFmt = valorNumerico.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const condicaoFmt = condicaoPagamento ? ` (${condicaoPagamento})` : "";
    partesObs.push(`• Valor Previsto: ${valorFmt}${condicaoFmt}`);
  }
  if (areasMencionadas && areasMencionadas.length > 0) {
    partesObs.push(`• Áreas Identificadas: ${Array.isArray(areasMencionadas) ? areasMencionadas.join(", ") : areasMencionadas}`);
  }
  if (sessoes && sessoes > 0) {
    partesObs.push(`• Sessões: ${sessoes} sessões`);
  }
  const relatoObservacao = resumoMaca || relatoTexto || "";
  if (relatoObservacao) {
    partesObs.push(`• Conversa na Cabine: "${relatoObservacao}"`);
  }
  const observacoesOportunidade = partesObs.join("\n");

  const oportunidadeResp = await chamarFerramentaAtendiMcp("criar_oportunidade", {
    contato_id: contatoId,
    unidade_id: unidadeId,
    etapa_id: ID_ETAPA_ORCAMENTO_GERADO,
    titulo: tituloOportunidade,
    valor: valorNumerico,
    observacoes: observacoesOportunidade
  });

  // 4. Salva também o relato da cabine como anotação interna no histórico do contato
  if (contatoId && relatoObservacao) {
    try {
      await chamarFerramentaAtendiMcp("adicionar_nota_contato", {
        contato_id: contatoId,
        nota: `📍 Conversa na Cabine (Belle Copilot):\n• Aplicadora: ${nomeAplicadoraFinal}\n• Plano: ${nomeBaseOportunidade}\n• Valor: ${valorNumerico > 0 ? valorNumerico.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "A definir"}\n• Relato da Aplicadora: "${relatoObservacao}"`
      });
    } catch (eNota) {
      console.warn("[Atendi CRM] Nota no contato não registrada:", eNota);
    }
  }

  return {
    sucesso: true,
    contatoId,
    oportunidadeId: oportunidadeResp?.oportunidade?.id || oportunidadeResp?.id,
    titulo: tituloOportunidade,
    valorNumerico,
    valorFormatado: valorNumerico > 0 
      ? valorNumerico.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : "A definir",
    funilNome: "Vendas",
    etapaNome: "Orçamento Gerado",
    unidadeNome: unidadeNomeOficial || "Linhares",
    aplicadoraNome: nomeAplicadoraFinal
  };
}
