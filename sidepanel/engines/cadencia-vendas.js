/**
 * BELLE COPILOT - MOTOR DE CADÊNCIA COMERCIAL (RESGATE DE ORÇAMENTOS)
 *
 * Classifica os orçamentos do `vendasplanos` em filas de trabalho e diz, para cada um,
 * qual toque de follow-up está vencendo hoje e o que falar.
 *
 * A separação entre as duas filas é a regra central do funil:
 *   🔥 AGUARDANDO  — link de pagamento já gerado. A cliente disse sim e falta pagar.
 *                    Janela curta: cada dia derruba a chance. Toques em D+0, D+1, D+3.
 *   💬 PENDENTE    — orçamento apresentado e não fechado. Reconquista, argumento novo
 *                    a cada toque: D+1, D+3, D+7, D+15, D+30.
 *   ⏸️ SUSPENSO    — pausado, revisita periódica.
 */

/** "1.917,60" -> 1917.6 */
export function valorParaNumero(txt) {
  if (typeof txt === "number") return txt;
  if (!txt) return 0;
  const limpo = String(txt).replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(limpo);
  return Number.isFinite(n) ? n : 0;
}

export function formatarReal(valor) {
  return (Number(valor) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "29/08/2026" ou "2026-08-29" -> Date local (meia-noite) */
export function dataOrcamentoParaDate(txt) {
  if (!txt) return null;
  const br = String(txt).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
  const iso = String(txt).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  return null;
}

/** Dias inteiros entre a proposta e hoje. */
export function diasDesde(dataTxt) {
  const d = dataOrcamentoParaDate(dataTxt);
  if (!d) return null;
  const hoje = new Date();
  const a = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.max(0, Math.round((a - b) / 86400000));
}

/**
 * Fila do orçamento. Vai pelo rótulo `stOrc` (texto), não pelo código numérico:
 * o código varia entre versões, o rótulo é o que a operadora vê na tela do Belle.
 */
export function classificarFila(registro) {
  const rotulo = String(registro?.stOrc || "").toLowerCase().trim();

  if (rotulo.includes("aprovad")) return "aprovado";
  if (rotulo.includes("aguard")) return "aguardando";
  if (rotulo.includes("pendent")) return "pendente";
  if (rotulo.includes("suspens")) return "suspenso";
  if (rotulo.includes("cancel") || rotulo.includes("reprov") || rotulo.includes("recus")) return "perdido";
  return "outros";
}

/** O link de pagamento aparece na forma de pagamento (ex.: "005- *LINK* - PAGO LIVRE"). */
export function possuiLinkPagamento(registro) {
  return /link/i.test(String(registro?.labelFormasPag || ""));
}

const CADENCIAS = {
  aguardando: [
    { dia: 0,  titulo: "Lembrete do link",        foco: "A cliente acabou de receber o link. Um toque no mesmo dia é o que mais converte." },
    { dia: 1,  titulo: "Link expirando",          foco: "Avisar que o link tem prazo e oferecer renovar na hora." },
    { dia: 3,  titulo: "Trocar forma de pagamento", foco: "Se não pagou em 3 dias, o problema costuma ser a forma de pagamento, não o preço." }
  ],
  pendente: [
    { dia: 1,  titulo: "Tirar a dúvida",          foco: "Recuperar a conversa enquanto o atendimento ainda está fresco na memória." },
    { dia: 3,  titulo: "Condição especial",       foco: "Trazer um motivo novo para reabrir a decisão." },
    { dia: 7,  titulo: "Prova social + urgência", foco: "Resultado de outras clientes e agenda apertando." },
    { dia: 15, titulo: "Última chamada",          foco: "Deixar claro que a condição do orçamento não fica de pé para sempre." },
    { dia: 30, titulo: "Reativação",              foco: "Recomeçar do zero, sem cobrança, oferecendo reavaliação." }
  ],
  suspenso: [
    { dia: 7,  titulo: "Revisita",                foco: "Entender o que travou e se já dá para retomar." },
    { dia: 30, titulo: "Reativação",              foco: "Nova tentativa com condição atualizada." }
  ]
};

/**
 * Etapa da cadência em que o orçamento está hoje.
 * `atrasado` = passou do último toque previsto sem fechar.
 */
export function etapaDaCadencia(fila, diasCorridos) {
  const etapas = CADENCIAS[fila];
  if (!etapas || diasCorridos === null || diasCorridos === undefined) return null;

  let atual = null;
  let indice = -1;
  etapas.forEach((e, i) => {
    if (diasCorridos >= e.dia) { atual = e; indice = i; }
  });

  if (!atual) return { ...etapas[0], indice: 0, total: etapas.length, futura: true, atrasado: false };

  return {
    ...atual,
    indice,
    total: etapas.length,
    futura: false,
    atrasado: indice === etapas.length - 1 && diasCorridos > atual.dia + 7
  };
}

/** Script pronto para a consultora, já com nome, plano e valor. */
export function gerarScriptVenda(item) {
  const primeiroNome = (item.clienteNome || "Cliente").trim().split(/\s+/)[0];
  const plano = (item.nomePlano || "seu tratamento").replace(/^\d+\s*-\s*/, "").trim();
  const valor = formatarReal(item.valorFinal);
  const etapa = item.etapa?.titulo || "";

  if (item.fila === "aguardando") {
    if (etapa === "Lembrete do link") {
      return `Oi ${primeiroNome}! Aqui é da Estética e Laser 💙 Acabei de te enviar o link do seu ${plano} (${valor}). Assim que você concluir, já deixo suas sessões liberadas na agenda! Qualquer dúvida no pagamento me chama que eu te ajudo por aqui.`;
    }
    if (etapa === "Link expirando") {
      return `${primeiroNome}, tudo bem? Passando só para avisar que o link do seu ${plano} tem prazo e está para vencer. Quer que eu gere um novo agora? Leva 1 minutinho e aí já garantimos sua condição de ${valor}.`;
    }
    return `${primeiroNome}, vi que o link ainda não foi concluído. Se a forma de pagamento estiver atrapalhando, a gente resolve: dá para parcelar no cartão, fazer no PIX ou dividir em duas entradas. Me diz qual funciona melhor para você que eu ajusto o seu ${plano}.`;
  }

  if (item.fila === "pendente") {
    if (etapa === "Tirar a dúvida") {
      return `Oi ${primeiroNome}! Foi um prazer te atender 💙 Fiquei pensando aqui no seu ${plano} — ficou alguma dúvida sobre as sessões ou sobre como funciona o tratamento? Me pergunta à vontade, sem compromisso nenhum.`;
    }
    if (etapa === "Condição especial") {
      return `${primeiroNome}, consegui uma condição especial para o seu ${plano}: fica ${valor}. Consigo segurar essa condição para você por poucos dias — quer que eu já deixe reservado?`;
    }
    if (etapa === "Prova social + urgência") {
      return `${primeiroNome}, nossas clientes que começaram o ${plano} já estão vendo redução bem visível dos pelos 😍 Nossa agenda de laser está fechando rápido para as próximas semanas. Quer que eu reserve seu primeiro horário enquanto ainda tem vaga boa?`;
    }
    if (etapa === "Última chamada") {
      return `${primeiroNome}, seu orçamento do ${plano} está chegando ao fim da validade e essa condição de ${valor} não fica disponível depois. Ainda dá tempo de garantir — quer que eu finalize para você hoje?`;
    }
    return `Oi ${primeiroNome}! Faz um tempinho que a gente conversou sobre o ${plano} 💙 Estamos com condições novas neste mês. Quer que eu faça uma reavaliação gratuita e monte um plano do seu jeito, sem compromisso?`;
  }

  return `Oi ${primeiroNome}! Seu plano ${plano} está pausado por aqui. Aconteceu alguma coisa que travou o andamento? Me conta que eu vejo a melhor forma de retomar 💙`;
}

/** Telefone -> número no formato do wa.me (55 + DDD + número). */
export function numeroWhatsapp(telefone = "") {
  const digitos = String(telefone).replace(/\D/g, "");
  if (!digitos) return "";
  if (digitos.startsWith("55") && digitos.length >= 12) return digitos;
  return `55${digitos}`;
}

/**
 * Normaliza os registros do vendasplanos no formato usado pela view,
 * já com fila, idade, etapa da cadência e script.
 */
export function prepararOrcamentos(registros = []) {
  return (Array.isArray(registros) ? registros : []).map(r => {
    const fila = classificarFila(r);
    const dias = diasDesde(r.dtProp || r.dt_inclusao);
    const item = {
      codOrcamento: r.cod_orcamento,
      codCliente: r.cod_paciente,
      clienteNome: (r.nom_paciente || "Cliente").trim(),
      telefone: r.celular || "",
      email: r.email || "",
      nomePlano: r.nomePlano || "Plano",
      tipoPlano: (r.lbTipo || "").trim(),
      valorCheio: valorParaNumero(r.preco),
      valorFinal: valorParaNumero(r.preco_final),
      descontoPct: valorParaNumero(r.desconto),
      formaPagamento: r.labelFormasPag || "",
      temLink: possuiLinkPagamento(r),
      vendedora: (r.nom_usuario || r.nom_vendedor || "").trim(),
      codUsuario: String(r.cod_usuario || r.codUsuario || r.cod_vendedor || r.codVendedor || "").trim(),
      loginUsuario: String(r.login || r.usuario || "").trim(),
      dataProposta: r.dtProp || "",
      validadeAte: r.dtValPlano || "",
      vencido: Boolean(r.vencido),
      saldoSessoes: r.saldo === null || r.saldo === undefined ? null : Number(r.saldo),
      statusRotulo: r.stOrc || "",
      origem: r.origem || "",
      fila,
      diasCorridos: dias,
      idUnico: `orc_${r.cod_orcamento}`
    };

    item.etapa = etapaDaCadencia(fila, dias);
    item.script = gerarScriptVenda(item);
    return item;
  });
}

/** KPIs do funil a partir dos orçamentos já preparados. */
export function calcularKpisVendas(itens = []) {
  const porFila = (f) => itens.filter(i => i.fila === f);
  const soma = (lista) => lista.reduce((acc, i) => acc + (i.valorFinal || 0), 0);

  const aprovados = porFila("aprovado");
  const aguardando = porFila("aguardando");
  const pendentes = porFila("pendente");
  const suspensos = porFila("suspenso");

  const decididos = itens.filter(i => i.fila !== "outros").length;
  const faturamento = soma(aprovados);
  const emAberto = soma(aguardando) + soma(pendentes) + soma(suspensos);

  const comDesconto = itens.filter(i => i.descontoPct > 0);
  const descontoMedio = comDesconto.length
    ? comDesconto.reduce((a, i) => a + i.descontoPct, 0) / comDesconto.length
    : 0;

  return {
    totalOrcamentos: itens.length,
    faturamentoAprovado: faturamento,
    valorEmAberto: emAberto,
    ticketMedio: aprovados.length ? faturamento / aprovados.length : 0,
    taxaConversao: decididos ? Math.round((aprovados.length / decididos) * 100) : 0,
    descontoMedio: Math.round(descontoMedio),
    qtdAprovado: aprovados.length,
    qtdAguardando: aguardando.length,
    qtdPendente: pendentes.length,
    qtdSuspenso: suspensos.length,
    cortesias: itens.filter(i => i.valorFinal === 0).length
  };
}

/** Ranking por consultora: quanto apresentou, quanto fechou e em quanto converteu. */
export function rankingPorVendedora(itens = []) {
  const mapa = new Map();

  itens.forEach(i => {
    const nome = i.vendedora || "Sem consultora";
    if (!mapa.has(nome)) {
      mapa.set(nome, { vendedora: nome, total: 0, aprovados: 0, valorAprovado: 0, valorEmAberto: 0 });
    }
    const r = mapa.get(nome);
    r.total++;
    if (i.fila === "aprovado") {
      r.aprovados++;
      r.valorAprovado += i.valorFinal;
    } else if (i.fila === "aguardando" || i.fila === "pendente") {
      r.valorEmAberto += i.valorFinal;
    }
  });

  return [...mapa.values()]
    .map(r => ({ ...r, conversao: r.total ? Math.round((r.aprovados / r.total) * 100) : 0 }))
    .sort((a, b) => b.valorAprovado - a.valorAprovado);
}

/* =========================================================
   PLANOS VENCENDO COM SALDO
   A cliente já pagou e ainda tem sessão para usar. Se o plano vencer assim,
   ela perde o que comprou e a clínica perde a recompra — é o resgate de maior
   retorno e menor esforço do funil, e ainda ocupa cadeira na agenda.
   ATENÇÃO À JANELA: um plano de validade 24 meses que vence agora foi vendido
   há dois anos, então essa fila precisa varrer bem mais para trás que o resgate
   de orçamento (que olha a data da proposta).
   ========================================================= */

/** Dias até a data informada. Negativo = já venceu. */
export function diasAte(dataTxt) {
  const d = dataOrcamentoParaDate(dataTxt);
  if (!d) return null;
  const hoje = new Date();
  const a = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((b - a) / 86400000);
}

export function urgenciaVencimento(diasRestantes) {
  if (diasRestantes === null) return null;
  if (diasRestantes < 0)  return { nivel: "vencido",  rotulo: "Já vencido",        cor: "#b91c1c", ordem: 0 };
  if (diasRestantes <= 15) return { nivel: "critico",  rotulo: "Vence em 15 dias",  cor: "#b91c1c", ordem: 1 };
  if (diasRestantes <= 30) return { nivel: "alerta",   rotulo: "Vence em 30 dias",  cor: "#b45309", ordem: 2 };
  if (diasRestantes <= 60) return { nivel: "atencao",  rotulo: "Vence em 60 dias",  cor: "#a16207", ordem: 3 };
  return { nivel: "tranquilo", rotulo: "Vence em 90 dias", cor: "#0369a1", ordem: 4 };
}

export function gerarScriptVencimento(item) {
  const primeiroNome = (item.clienteNome || "Cliente").trim().split(/\s+/)[0];
  const plano = (item.nomePlano || "seu pacote").replace(/^\d+\s*-\s*/, "").trim();
  const sessoes = item.saldoSessoes;
  const txtSessoes = sessoes === 1 ? "1 sessão" : `${sessoes} sessões`;

  if (item.diasParaVencer < 0) {
    return `Oi ${primeiroNome}! 💙 Vi aqui no seu cadastro que ficaram ${txtSessoes} do seu ${plano} sem uso, e a validade do pacote encerrou em ${item.validadeAte}. Antes de arquivar, queria muito falar com você: consegue vir usar? Vou verificar com a gerência a possibilidade de liberar essas sessões para você. Me responde aqui que eu corro atrás 🙏`;
  }

  if (item.diasParaVencer <= 15) {
    return `${primeiroNome}, atenção! ⏰ Você ainda tem ${txtSessoes} do seu ${plano} e o pacote vence em ${item.validadeAte} — faltam ${item.diasParaVencer} dia(s). Não quero que você perca o que já pagou! Me diz os melhores dias e horários que eu encaixo você na agenda ainda esta semana 💙`;
  }

  if (item.diasParaVencer <= 30) {
    return `Oi ${primeiroNome}! 💙 Passando para lembrar que restam ${txtSessoes} do seu ${plano}, e a validade vai até ${item.validadeAte}. Dá tempo tranquilo de concluir, mas nossa agenda enche no fim do mês. Quer que eu já deixe seus horários reservados?`;
  }

  return `Oi ${primeiroNome}! Tudo bem? 💙 Você ainda tem ${txtSessoes} para usar do seu ${plano} (validade até ${item.validadeAte}). Vamos aproveitar e já deixar programado? Me fala sua preferência de dia e horário que eu organizo tudo para você.`;
}

/**
 * Monta a fila de planos pagos com sessão sobrando e validade próxima.
 * `horizonteDias` = quantos dias à frente entram no alerta.
 * `incluirVencidos` traz também os que já passaram da validade (recuperáveis por cortesia).
 */
export function prepararPlanosVencendo(registros = [], horizonteDias = 90, incluirVencidos = true) {
  const itens = [];

  (Array.isArray(registros) ? registros : []).forEach(r => {
    // Só plano pago: orçamento não aprovado não tem sessão a perder.
    if (classificarFila(r) !== "aprovado") return;

    const saldo = r.saldo === null || r.saldo === undefined || r.saldo === "" ? 0 : Number(r.saldo);
    if (!Number.isFinite(saldo) || saldo <= 0) return;

    const dias = diasAte(r.dtValPlano);
    if (dias === null) return;
    if (dias > horizonteDias) return;
    if (dias < 0 && !incluirVencidos) return;

    const item = {
      codOrcamento: r.cod_orcamento,
      codCliente: r.cod_paciente,
      clienteNome: (r.nom_paciente || "Cliente").trim(),
      telefone: r.celular || "",
      nomePlano: r.nomePlano || "Plano",
      valorFinal: valorParaNumero(r.preco_final),
      vendedora: (r.nom_usuario || r.nom_vendedor || "").trim(),
      codUsuario: String(r.cod_usuario || r.codUsuario || r.cod_vendedor || r.codVendedor || "").trim(),
      loginUsuario: String(r.login || r.usuario || "").trim(),
      dataProposta: r.dtProp || "",
      validadeAte: r.dtValPlano || "",
      validadeMeses: r.validade || null,
      saldoSessoes: saldo,
      diasParaVencer: dias,
      urgencia: urgenciaVencimento(dias),
      fila: "vencendo",
      idUnico: `venc_${r.cod_orcamento}`
    };

    // Valor aproximado em risco: o que a cliente pagou, rateado pelas sessões não usadas.
    // `saldo` é o que resta; sem o total de sessões vendidas, usamos o valor do plano
    // como teto e sinalizamos que é estimativa.
    item.valorEmRisco = item.valorFinal;
    item.script = gerarScriptVencimento(item);
    itens.push(item);
  });

  // Mais urgente primeiro; empatou, quem tem mais sessão a perder.
  return itens.sort((a, b) => {
    const ua = a.urgencia?.ordem ?? 9;
    const ub = b.urgencia?.ordem ?? 9;
    if (ua !== ub) return ua - ub;
    if (a.diasParaVencer !== b.diasParaVencer) return a.diasParaVencer - b.diasParaVencer;
    return b.saldoSessoes - a.saldoSessoes;
  });
}

export function calcularKpisVencimento(itens = []) {
  const vencidos = itens.filter(i => i.diasParaVencer < 0);
  const criticos = itens.filter(i => i.diasParaVencer >= 0 && i.diasParaVencer <= 15);
  return {
    clientes: new Set(itens.map(i => i.codCliente)).size,
    planos: itens.length,
    sessoesEmRisco: itens.reduce((a, i) => a + (i.saldoSessoes || 0), 0),
    valorEmRisco: itens.reduce((a, i) => a + (i.valorEmRisco || 0), 0),
    qtdVencidos: vencidos.length,
    qtdCriticos: criticos.length
  };
}

/**
 * Verifica se um orçamento ou plano pertence à consultora / usuária informada.
 * Compara por código numérico de usuário/vendedor, login ou nome da consultora.
 */
export function registroPertenceAoUsuario(item, { userData, userName, codUsuario } = {}) {
  if (!item) return false;

  const userCod = String(userData?.cod_usuario || codUsuario || "").trim().toLowerCase();
  const userLogin = String(userData?.login || "").trim().toLowerCase();
  const userNome = String(userData?.nom_usuario || userData?.nomeUsuario || userName || "").trim();

  // 1. Match por código numérico de usuário / vendedor (ex: "82700")
  const itemCod = String(item.codUsuario || item.cod_usuario || item.codVendedor || item.cod_vendedor || "").trim().toLowerCase();
  if (userCod && itemCod && userCod === itemCod) {
    return true;
  }

  // 2. Match por login (ex: "barbara.martins")
  const itemLogin = String(item.loginUsuario || item.login || item.usuario || "").trim().toLowerCase();
  if (userLogin && itemLogin && userLogin === itemLogin) {
    return true;
  }

  // 3. Match por nome da consultora
  const vendedoraNome = String(item.vendedora || item.nom_usuario || item.nomVendedor || item.nom_vendedor || "").trim();
  if (!vendedoraNome) {
    return false;
  }

  const normalizar = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const normVend = normalizar(vendedoraNome);
  const normUser = normalizar(userNome);

  if (normVend && normUser && normVend === normUser) {
    return true;
  }

  // Se um nome contém o outro (ex: "BARBARA MARTINS" vs "BARBARA MARTINS DE ALMEIDA")
  if (normUser.length >= 4 && normVend.length >= 4) {
    if (normVend.includes(normUser) || normUser.includes(normVend)) {
      return true;
    }

    const tokensVend = normVend.split(" ").filter(p => p.length > 2);
    const tokensUser = normUser.split(" ").filter(p => p.length > 2);
    if (tokensVend.length >= 2 && tokensUser.length >= 2) {
      if (tokensVend[0] === tokensUser[0] && tokensVend[tokensVend.length - 1] === tokensUser[tokensUser.length - 1]) {
        return true;
      }
    }
  }

  // Se o login for derivado do nome (ex: "barbara.martins")
  if (userLogin && userLogin.length >= 3) {
    const tokens = userLogin.split(/[\._\-]/).filter(t => t.length > 2);
    if (tokens.length > 0 && tokens.every(tok => normVend.includes(tok))) {
      return true;
    }
  }

  return false;
}

