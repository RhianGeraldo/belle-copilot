/**
 * BELLE COPILOT - CRUZAMENTO COMERCIAL DE ÁREAS
 *
 * Compara o que a cliente já trata com o mapa completo de regiões e responde:
 * o que faz sentido ofertar HOJE, e por quê.
 *
 * Quatro origens de oportunidade, nessa ordem de prioridade:
 *
 *   1. AFINIDADE      área vizinha da que ela já faz, onde o resultado parcial fica
 *                     visível (faixa de barba sem o mento; meia perna sem a coxa).
 *   2. REGIÃO         região já iniciada e incompleta — falta pouco para fechar.
 *   3. CROSS-SERVIÇO  outro serviço na MESMA área que ela já trata (clareamento na
 *                     axila que ela depila; peeling no rosto que ela já trata).
 *   4. NOVA REGIÃO    região ainda intocada, oferta de expansão.
 */

import { REGIOES, AREAS_POR_ID, AFINIDADES, SERVICOS, mapearCobertura, inferirSexoPorAreas } from './catalogo-areas.js';

const NOME_SERVICO = Object.fromEntries(SERVICOS.map(s => [s.id, s.nome]));

/** Áreas que não devem ser ofertadas por já estarem cobertas ou serem equivalentes. */
function montarBloqueadas(areasCobertas) {
  const bloqueadas = new Set(areasCobertas);
  areasCobertas.forEach(id => {
    (AREAS_POR_ID.get(id)?.equivalentes || []).forEach(eq => bloqueadas.add(eq));
  });
  return bloqueadas;
}

function primeiroNome(nomeCompleto = "") {
  return String(nomeCompleto).trim().split(/\s+/)[0] || "você";
}

function scriptAfinidade(nome, areaOrigem, areaAlvo) {
  return `${primeiroNome(nome)}, como você já trata ${areaOrigem.nome.toLowerCase()}, faz muita diferença incluir ${areaAlvo.nome.toLowerCase()}: fica tudo uniforme, sem aquela marca de onde termina o tratamento. Quer que eu já inclua no seu plano?`;
}

function scriptRegiao(nome, regiaoNome, faltantes) {
  const lista = faltantes.map(a => a.nome).join(", ");
  return `${primeiroNome(nome)}, você já está com a região de ${regiaoNome.toLowerCase()} quase completa! Falta só ${lista.toLowerCase()} para fechar tudo. Fechando junto eu consigo uma condição melhor do que área avulsa.`;
}

function scriptCrossServico(nome, area, servicoId) {
  const a = area.nome.toLowerCase();
  if (servicoId === "clareamento") {
    return `${primeiroNome(nome)}, o laser já está resolvendo os pelos ${a === "axilas" ? "das axilas" : `da região de ${a}`}, mas a manchinha escura não sai só com depilação. Nosso Clareamento trata exatamente isso e potencializa o resultado que você já está tendo.`;
  }
  if (servicoId === "rejuvenescimento") {
    return `${primeiroNome(nome)}, já que você trata ${a}, vale conhecer o Rejuvenescimento a Laser: estimula colágeno e melhora textura e firmeza na mesma região, sem tempo de recuperação.`;
  }
  if (servicoId === "blackpeel") {
    return `${primeiroNome(nome)}, o Black Peel é excelente para ${a}: controla oleosidade, fecha poro e dá efeito porcelana. Muitas clientes fazem junto com a sessão de laser.`;
  }
  return `${primeiroNome(nome)}, o Peeling em ${a} renova a pele e uniformiza o tom, combinando bem com o tratamento que você já faz.`;
}

function scriptNovaRegiao(nome, regiaoNome, areas) {
  return `${primeiroNome(nome)}, você já está adaptada ao laser e vendo resultado. Que tal aproveitar e começar ${regiaoNome.toLowerCase()} (${areas.slice(0, 3).map(a => a.nome).join(", ").toLowerCase()})? Cliente que já tem plano ativo tem condição especial para novas regiões.`;
}

/**
 * @param {Object} p
 * @param {Array} p.servicosContratados  itens do saldovendaplano (o que ela comprou)
 * @param {Array} p.servicosHoje         arrServ do agendamento de hoje
 * @param {Array} p.historicoAreas       registros de parametro_laser (área já aplicada)
 * @param {String} p.clienteNome
 * @param {String} p.sexo                "feminino" | "masculino" | null (cadastro do Belle)
 * @param {Number} p.limite              máximo de oportunidades devolvidas
 */
export function analisarOportunidades({
  servicosContratados = [],
  servicosHoje = [],
  historicoAreas = [],
  clienteNome = "",
  sexo = null,
  limite = 6
} = {}) {
  const nomesHistorico = (historicoAreas || []).map(r => r?.area || r?.observacao || "").filter(Boolean);
  const cobertura = mapearCobertura([...servicosContratados, ...servicosHoje, ...nomesHistorico]);

  const areasCobertas = [...cobertura.areas.keys()];
  const bloqueadas = montarBloqueadas(areasCobertas);

  // Sexo: o cadastro manda; sem ele, deduz pelas áreas exclusivas que o cliente já
  // trata. Sem nenhuma das duas pistas, `null` — e aí NADA é filtrado, para não
  // esconder oferta legítima por um palpite.
  const sexoEfetivo = sexo || inferirSexoPorAreas(areasCobertas);
  const sexoInferido = !sexo && Boolean(sexoEfetivo);

  const conflitaComSexo = (areaId) => {
    if (!sexoEfetivo) return false;
    const g = AREAS_POR_ID.get(areaId)?.genero;
    return Boolean(g) && g !== sexoEfetivo;
  };
  const oportunidades = [];
  const jaSugerida = new Set();

  const adicionar = (op) => {
    const chave = `${op.areaId || op.regiaoId}_${op.servicoId}`;
    if (jaSugerida.has(chave)) return;
    jaSugerida.add(chave);
    oportunidades.push(op);
  };

  /* 1. AFINIDADE — a vizinha que falta */
  areasCobertas.forEach(origemId => {
    const origem = AREAS_POR_ID.get(origemId);
    if (!origem) return;

    AFINIDADES.filter(a => a.de === origemId).forEach(regra => {
      regra.para.forEach(alvoId => {
        if (bloqueadas.has(alvoId)) return;
        if (conflitaComSexo(alvoId)) return;
        const alvo = AREAS_POR_ID.get(alvoId);
        if (!alvo) return;

        adicionar({
          tipo: "afinidade",
          prioridade: 60 + regra.peso * 10,
          areaId: alvoId,
          areaNome: alvo.nome,
          regiaoNome: alvo.regiaoNome,
          servicoId: "depilacao",
          servicoNome: NOME_SERVICO.depilacao,
          origemNome: origem.nome,
          motivo: regra.motivo,
          script: scriptAfinidade(clienteNome, origem, alvo)
        });
      });
    });
  });

  /* 2. REGIÃO INICIADA E INCOMPLETA */
  const porRegiao = REGIOES.map(regiao => {
    const total = regiao.areas.length;
    const cobertas = regiao.areas.filter(a => cobertura.areas.has(a.id));
    const faltantes = regiao.areas.filter(a => !bloqueadas.has(a.id) && !conflitaComSexo(a.id));
    return { regiao, total, cobertas, faltantes, pct: Math.round((cobertas.length / total) * 100) };
  });

  porRegiao
    .filter(r => r.cobertas.length > 0 && r.faltantes.length > 0)
    .sort((a, b) => b.pct - a.pct)
    .forEach(r => {
      adicionar({
        tipo: "completar-regiao",
        // Quanto mais perto de fechar, mais fácil a venda.
        prioridade: 40 + Math.round(r.pct / 5),
        regiaoId: r.regiao.id,
        regiaoNome: r.regiao.nome,
        areaNome: r.faltantes.map(a => a.nome).join(" + "),
        servicoId: "depilacao",
        servicoNome: NOME_SERVICO.depilacao,
        motivo: `Região ${r.regiao.nome} está ${r.pct}% completa: ${r.cobertas.length} de ${r.total} áreas.`,
        script: scriptRegiao(clienteNome, r.regiao.nome, r.faltantes),
        faltantes: r.faltantes.map(a => a.nome)
      });
    });

  /* 3. CROSS-SERVIÇO na área que ela já trata */
  cobertura.areas.forEach((servicosDaArea, areaId) => {
    const area = AREAS_POR_ID.get(areaId);
    if (!area) return;

    const candidatos = [];
    if (area.tags.includes("hipercromia")) candidatos.push("clareamento");
    if (area.tags.includes("oleosidade")) candidatos.push("blackpeel");
    if (area.tags.includes("facial")) candidatos.push("rejuvenescimento", "peeling");

    candidatos.forEach(servicoId => {
      if (servicosDaArea.has(servicoId)) return; // já compra esse serviço nessa área

      adicionar({
        tipo: "cross-servico",
        // Clareamento em área que ela já depila é a conversão mais alta do grupo.
        prioridade: servicoId === "clareamento" ? 55 : 30,
        areaId,
        areaNome: area.nome,
        regiaoNome: area.regiaoNome,
        servicoId,
        servicoNome: NOME_SERVICO[servicoId],
        motivo: servicoId === "clareamento"
          ? `${area.nome} é área de hipercromia e a cliente já trata pelos ali — a mancha não sai só com depilação.`
          : `${area.nome} já está em tratamento: dá para somar ${NOME_SERVICO[servicoId]} na mesma sessão.`,
        script: scriptCrossServico(clienteNome, area, servicoId)
      });
    });
  });

  /* 4. NOVA REGIÃO — só quando já existe relacionamento */
  if (areasCobertas.length >= 2) {
    porRegiao
      .filter(r => r.cobertas.length === 0 && r.faltantes.length > 0)
      .slice(0, 2)
      .forEach(r => {
        adicionar({
          tipo: "nova-regiao",
          prioridade: 20,
          regiaoId: r.regiao.id,
          regiaoNome: r.regiao.nome,
          areaNome: r.faltantes.slice(0, 3).map(a => a.nome).join(", "),
          servicoId: "depilacao",
          servicoNome: NOME_SERVICO.depilacao,
          motivo: `Região ${r.regiao.nome} ainda não foi iniciada.`,
          script: scriptNovaRegiao(clienteNome, r.regiao.nome, r.faltantes)
        });
      });
  }

  oportunidades.sort((a, b) => b.prioridade - a.prioridade);

  /*
   * Diversidade da lista final. Só por prioridade, as afinidades (todas de depilação)
   * ocupavam as seis vagas e o cross-serviço — que é a oferta de maior conversão,
   * porque acontece na área que a cliente JÁ trata — nunca aparecia na tela.
   */
  const TETO_POR_TIPO = { afinidade: 3, "cross-servico": 2, "completar-regiao": 1, "nova-regiao": 1 };
  const usados = {};
  const selecionadas = [];

  oportunidades.forEach(op => {
    if (selecionadas.length >= limite) return;
    const teto = TETO_POR_TIPO[op.tipo] ?? limite;
    if ((usados[op.tipo] || 0) >= teto) return;
    usados[op.tipo] = (usados[op.tipo] || 0) + 1;
    selecionadas.push(op);
  });

  // Sobrou vaga (cliente com pouca cobertura): completa por prioridade.
  if (selecionadas.length < limite) {
    oportunidades.forEach(op => {
      if (selecionadas.length >= limite) return;
      if (!selecionadas.includes(op)) selecionadas.push(op);
    });
  }

  return {
    areasCobertas,
    sexo: sexoEfetivo,
    sexoInferido,
    servicosCobertos: [...cobertura.servicos],
    porRegiao: porRegiao.map(r => ({
      regiao: r.regiao.nome,
      total: r.total,
      cobertas: r.cobertas.map(a => a.nome),
      faltantes: r.faltantes.map(a => a.nome),
      pct: r.pct
    })),
    oportunidades: selecionadas,
    totalOportunidades: oportunidades.length
  };
}
