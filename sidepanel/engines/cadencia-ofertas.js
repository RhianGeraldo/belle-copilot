/**
 * BELLE COPILOT - MOTOR DE CADÊNCIA CLÍNICA & CROSS-SELL
 * Prescreve ofertas inteligentes e scripts verbais para a aplicadora baseados na sessão da cliente.
 *
 * A sugestão de novas áreas vem do cruzamento real do mapa corporal
 * (engines/cross-sell.js), não mais de comparações de texto fixas.
 */

import { state } from '../core/state.js';
import { analisarOportunidades } from './cross-sell.js';
import { gerarPitchOfertaIa, analisarOfertaClinicaComIa } from '../core/ai-client.js';
import { abrirModalLancamentoOrcamento } from '../components/modal-lancar-orcamento.js';
import { dataOrcamentoParaDate, diasDesde, formatarReal } from './cadencia-vendas.js';
import { identificarAreas, AREAS_POR_ID } from './catalogo-areas.js';

let ofertasAtuais = [];
let appAtualOfertas = null;
let historicoLaserAtual = [];
let listenerIaInicializado = false;

export function extrairNumeroSessaoArea(nomeArea, historicoLaser = [], saldoServicos = [], app = null) {
  const cleanArea = String(nomeArea || "").toLowerCase().trim();

  // 1. Prioridade: saldovendaplano oficial (gasto, quantidade, saldo_atual por área individual)
  if (Array.isArray(saldoServicos) && saldoServicos.length > 0) {
    const keywords = cleanArea
      .replace(/\b(depilação|depilacao|a|laser|feminina|masculina|sessao|sessões|completa|área|area|corpo|pacote|combo)\b/gi, "")
      .split(/[\s\-\(\)\/\+]+/)
      .filter(w => w.length >= 3);
    
    // Procura match específico da área no saldo
    const match = saldoServicos.find(s => {
      const sNome = String(s.servico || s.nome || s.nom_servico || "").toLowerCase();
      return keywords.some(k => sNome.includes(k));
    });

    if (match) {
      const gasto = parseInt(match.gasto ?? match.realizadas ?? match.qtd_executada ?? 0, 10);
      const qtd = parseInt(match.quantidade ?? match.contratadas ?? match.qtd_contratada ?? 10, 10);
      const saldo = parseInt(match.saldo_atual ?? match.saldo ?? Math.max(0, qtd - gasto), 10);
      return {
        sessaoAtual: Math.max(1, gasto),
        totalSessoes: Math.max(1, qtd),
        saldoRestante: saldo,
        origem: "saldovendaplano"
      };
    }
  }

  // 2. Fallback: lbServ do agendamento (ex: "AXILAS (P) - depilação a laser - 3/10")
  if (app && app.lbServ) {
    const linhas = app.lbServ.split("<br>").map(l => l.trim()).filter(Boolean);
    for (const l of linhas) {
      const match = l.match(/(.+?)\s*-\s*(\d+)\/(\d+)/);
      if (match) {
        const areaLinha = match[1].toLowerCase();
        if (cleanArea.includes(areaLinha.substring(0, 4)) || areaLinha.includes(cleanArea.substring(0, 4))) {
          const fe = parseInt(match[2], 10);
          const to = parseInt(match[3], 10);
          return {
            sessaoAtual: fe,
            totalSessoes: to,
            saldoRestante: Math.max(0, to - fe),
            origem: "lbServ"
          };
        }
      }
    }
  }

  // 3. Fallback: Histórico de registros anteriores do prontuário (parametro_laser)
  if (Array.isArray(historicoLaser) && historicoLaser.length > 0) {
    const registrosArea = historicoLaser.filter(r => {
      const rArea = (r.area || "").toLowerCase();
      return rArea.includes(cleanArea.substring(0, 4)) || cleanArea.includes(rArea.substring(0, 4));
    });
    const count = registrosArea.length;
    return {
      sessaoAtual: count + 1,
      totalSessoes: 10,
      saldoRestante: Math.max(0, 10 - (count + 1)),
      origem: "parametro_laser"
    };
  }

  return { sessaoAtual: 1, totalSessoes: 10, saldoRestante: 9, origem: "default" };
}

/**
 * Classifica a situação comercial/clínica do plano vindo da API do Belle.
 * Retorna: "aprovado" | "pendente" | "vencido" | "cancelado"
 */
export function classificarStatusPlano(p) {
  const rotulo = String(p?.stOrc || p?.statusRotulo || p?.status || "").toLowerCase().trim();
  const dtVal = p?.dtValPlano || p?.dt_validade || p?.validadeAte || "";
  const dtValDate = dataOrcamentoParaDate(dtVal);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dataExpirou = Boolean(dtValDate && dtValDate < hoje);

  // 1. Cancelado / Reprovado / Recusado
  if (/cancel|reprov|recus|estorn|desist/.test(rotulo)) {
    return "cancelado";
  }

  // 2. Vencido (pelo rótulo do sistema, flag ou data de expiração)
  if (/vencid|expirad/.test(rotulo) || dataExpirou || Boolean(p?.vencido)) {
    return "vencido";
  }

  // 3. Pendente / Aguardando pagamento
  if (/pendent|aguard/.test(rotulo)) {
    return "pendente";
  }

  // 4. Aprovado / Ativo / Concluído
  if (/aprovad|ativ|concluid|finaliz/.test(rotulo) || p?.status === "1" || p?.status === 1) {
    return "aprovado";
  }

  return dataExpirou ? "vencido" : "aprovado";
}

/**
 * Consolida a visão 360° da cliente em 4 grupos:
 * 1. Pacotes Ativos (Aprovados com saldo positivo e válidos)
 * 2. Pacotes Finalizados / Concluídos / Vencidos (incluindo histórico do prontuário)
 * 3. Orçamentos Pendentes em aberto (propostas comerciais aguardando fechamento)
 * 4. Áreas Livres Nunca Feitas (do catálogo anatômico)
 */
export function consolidarPerfilClinicoCompleto(app, saldoServicos = [], historicoLaser = [], sexo = null) {
  if (!app) {
    return {
      procs: ["Depilação a Laser"],
      primeiraArea: "Depilação a Laser",
      sessaoAtual: 1,
      totalSessoes: 10,
      saldoRestante: 9,
      pacotesAtivos: [],
      pacotesFinalizadosOuVencidos: [],
      orcamentosPendentes: [],
      areasNuncaFeitas: [],
      todasAreasDetectadas: new Set()
    };
  }

  const todosSaldos = [
    ...(Array.isArray(saldoServicos) ? saldoServicos : []),
    ...(Array.isArray(state.todosSaldosCliente) ? state.todosSaldosCliente : [])
  ];
  const todosPacotes = Array.isArray(state.todosPacotesCliente) ? state.todosPacotesCliente : [];

  const procs = (app.arrServ && app.arrServ.length > 0) 
    ? app.arrServ.map(s => s.nome) 
    : [app.procedimento || "Depilação a Laser"];
  const primeiraArea = procs[0] || "Tratamento";

  const { sessaoAtual, totalSessoes, saldoRestante } = extrairNumeroSessaoArea(primeiraArea, historicoLaser, todosSaldos, app);

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const pacotesAtivos = [];
  const pacotesFinalizadosOuVencidos = [];
  const orcamentosPendentes = [];
  const areasAtivasDetectadas = new Set();
  const areasComOrcamentoPendente = new Set();
  const todasAreasDetectadas = new Set();
  const orcsProcessados = new Set();

  const registrarAreaNormalizada = (nome, setDestino) => {
    if (!nome) return;
    const limpo = String(nome).replace(/\(.*?\)/g, "").replace(/\s*-\s*depilação.*$/i, "").trim().toLowerCase();
    if (limpo) setDestino.add(limpo);
    identificarAreas(nome).forEach(id => {
      const aObj = AREAS_POR_ID.get(id);
      if (aObj) {
        setDestino.add(aObj.nome.toLowerCase());
        (aObj.equivalentes || []).forEach(eq => {
          const eqObj = AREAS_POR_ID.get(eq);
          if (eqObj) setDestino.add(eqObj.nome.toLowerCase());
        });
      }
    });
  };

  // 1. Processa saldovendaplano oficial (saldo de execução de serviços contratados)
  todosSaldos.forEach(s => {
    const nomeArea = s.servico || s.nome || s.nom_servico || "";
    if (!nomeArea) return;

    const statusSaldo = classificarStatusPlano(s);
    if (statusSaldo === "cancelado") return;

    const areaLimpa = nomeArea.replace(/\(.*?\)/g, "").replace(/\s*-\s*depilação.*$/i, "").trim();
    const gasto = parseInt(s.gasto ?? s.realizadas ?? s.qtd_executada ?? 0, 10);
    const qtd = parseInt(s.quantidade ?? s.contratadas ?? s.qtd_contratada ?? 10, 10);
    const saldo = parseInt(s.saldo_atual ?? s.saldo ?? Math.max(0, qtd - gasto), 10);
    const codOrc = s.cod_orcamento || s.codOrc;
    if (codOrc) orcsProcessados.add(String(codOrc));

    const dtVal = s.dtValPlano || s.dt_validade || s.dtValidade || "";
    const dtValDate = dataOrcamentoParaDate(dtVal);
    const estaVencido = (statusSaldo === "vencido") || Boolean(dtValDate && dtValDate < hoje);
    const estaFinalizado = saldo <= 0;

    const ehCortesia = qtd <= 3 || (s.nomePlano || "").toLowerCase().includes("cortesia") || nomeArea.toLowerCase().includes("cortesia");

    const item = {
      area: areaLimpa,
      plano: s.nomePlano || s.nome_plano || nomeArea,
      total: qtd,
      realizadas: gasto,
      saldo,
      validade: dtVal || null,
      ehCortesia,
      origem: "saldovendaplano"
    };

    registrarAreaNormalizada(areaLimpa, todasAreasDetectadas);

    if (estaVencido || estaFinalizado) {
      pacotesFinalizadosOuVencidos.push({
        ...item,
        status: estaFinalizado ? `Ciclo concluído (${gasto}/${qtd} sessões feitas)` : `Plano vencido em ${dtVal}`
      });
    } else {
      registrarAreaNormalizada(areaLimpa, areasAtivasDetectadas);
      pacotesAtivos.push(item);
    }
  });

  // 2. Processa vendasplanos (valida status: Aprovado, Pendente e Vencido)
  todosPacotes.forEach(p => {
    if (!p) return;
    const codOrc = String(p.cod_orcamento || "").trim();
    if (codOrc && orcsProcessados.has(codOrc)) return;

    const statusPlano = classificarStatusPlano(p);
    if (statusPlano === "cancelado") return;

    const nomePlano = String(p.nomePlano || p.servico || "Plano").trim();
    const saldoNum = (p.saldo !== undefined && p.saldo !== null && p.saldo !== "") ? parseInt(p.saldo, 10) : 0;
    const dtVal = p.dtValPlano || p.dt_validade || "";
    const dtValDate = dataOrcamentoParaDate(dtVal);
    const estaVencido = (statusPlano === "vencido") || Boolean(dtValDate && dtValDate < hoje);
    const estaFinalizado = saldoNum <= 0;

    const idsIdentificados = identificarAreas(nomePlano);
    const nomesAreasCombo = idsIdentificados.length > 0 
      ? idsIdentificados.map(id => AREAS_POR_ID.get(id)?.nome).filter(Boolean)
      : nomePlano.split(/\s*[\+\/]\s*|\s+e\s+/i).map(s => s.replace(/^\d+[\s\-\*]+/, '').replace(/\(.*?\)/g, "").trim()).filter(s => s.length >= 3);

    nomesAreasCombo.forEach(areaCombo => {
      // CENÁRIO PENDENTE: Orçamento apresentado aguardando fechamento / pagamento
      if (statusPlano === "pendente") {
        orcamentosPendentes.push({
          area: areaCombo,
          plano: nomePlano,
          codOrc: codOrc || p.cod_orcamento,
          valorFinal: p.preco_final || p.valor_final || p.preco || 0,
          dataProposta: p.dtProp || p.data_hora || "",
          diasCorridos: diasDesde(p.dtProp || p.data_hora) ?? 0,
          vendedora: p.nom_vendedor || p.vendedor || "Consultora",
          statusRotulo: p.stOrc || "Pendente"
        });
        registrarAreaNormalizada(areaCombo, areasComOrcamentoPendente);
        return; // Não adiciona aos pacotes ativos nem aos finalizados!
      }

      registrarAreaNormalizada(areaCombo, todasAreasDetectadas);
      const jaEstaAtiva = [...areasAtivasDetectadas].some(a => a.includes(areaCombo.toLowerCase()) || areaCombo.toLowerCase().includes(a));
      const jaEstaFinalizada = pacotesFinalizadosOuVencidos.some(f => f.area.toLowerCase() === areaCombo.toLowerCase());

      if (jaEstaAtiva || jaEstaFinalizada) return;

      const item = {
        area: areaCombo,
        plano: nomePlano,
        total: 10,
        realizadas: Math.max(0, 10 - saldoNum),
        saldo: saldoNum,
        validade: dtVal || null,
        ehCortesia: nomePlano.toLowerCase().includes("cortesia"),
        origem: "vendasplanos"
      };

      if (estaVencido || estaFinalizado) {
        pacotesFinalizadosOuVencidos.push({
          ...item,
          status: estaFinalizado ? "Ciclo concluído (todas as sessões realizadas)" : `Plano vencido em ${dtVal}`
        });
      } else {
        registrarAreaNormalizada(areaCombo, areasAtivasDetectadas);
        pacotesAtivos.push(item);
      }
    });
  });

  // 3. Processa agendamentos de hoje (garante que as áreas da sessão de hoje estejam em pacotesAtivos)
  procs.forEach(pNome => {
    const limpo = pNome.replace(/\(.*?\)/g, "").trim();
    registrarAreaNormalizada(limpo, todasAreasDetectadas);
    registrarAreaNormalizada(limpo, areasAtivasDetectadas);

    const jaAtivo = pacotesAtivos.some(pa => pa.area.toLowerCase() === limpo.toLowerCase() || limpo.toLowerCase().includes(pa.area.toLowerCase()));
    if (!jaAtivo) {
      pacotesAtivos.push({
        area: limpo,
        plano: app.nomePlano || limpo,
        total: totalSessoes,
        realizadas: sessaoAtual,
        saldo: saldoRestante,
        validade: null,
        ehCortesia: totalSessoes <= 3,
        origem: "agendamento"
      });
    }
  });

  // 4. CRUCIAL: Processa historicoLaser (parametro_laser do prontuário)
  // Áreas aplicadas no prontuário que não estão ativas hoje já foram concluídas pela cliente!
  const contagemPorAreaLaser = new Map();
  (Array.isArray(historicoLaser) ? historicoLaser : []).forEach(r => {
    const areaReg = String(r.area || r.nomeArea || r.servico || "").trim();
    if (!areaReg) return;
    const areaLimpa = areaReg.replace(/\(.*?\)/g, "").replace(/\s*-\s*depilação.*$/i, "").trim();
    if (!areaLimpa) return;
    contagemPorAreaLaser.set(areaLimpa, (contagemPorAreaLaser.get(areaLimpa) || 0) + 1);
  });

  contagemPorAreaLaser.forEach((qtdFeita, areaLaser) => {
    registrarAreaNormalizada(areaLaser, todasAreasDetectadas);
    const areaLow = areaLaser.toLowerCase();

    const estaAtiva = pacotesAtivos.some(pa => {
      const paLow = pa.area.toLowerCase();
      return paLow.includes(areaLow.substring(0, 4)) || areaLow.includes(paLow.substring(0, 4));
    });

    const estaFinalizada = pacotesFinalizadosOuVencidos.some(pf => {
      const pfLow = pf.area.toLowerCase();
      return pfLow.includes(areaLow.substring(0, 4)) || areaLow.includes(pfLow.substring(0, 4));
    });

    if (!estaAtiva && !estaFinalizada) {
      pacotesFinalizadosOuVencidos.push({
        area: areaLaser,
        plano: `Histórico no Prontuário (${qtdFeita} sessão${qtdFeita > 1 ? 'ões' : ''})`,
        total: Math.max(10, qtdFeita),
        realizadas: qtdFeita,
        saldo: 0,
        validade: null,
        ehCortesia: false,
        status: `Ciclo concluído anteriormente (${qtdFeita} sessão(ões) no prontuário)`,
        origem: "parametro_laser"
      });
    }
  });

  // 5. Calcula as áreas do corpo que a cliente NUNCA fez
  const catalogoFeminino = [
    "Virilha Completa", "Meia Perna", "Perianal", "Coxa", "Axilas", 
    "Linha Alba", "Glúteos", "Braços", "Buço", "Costas"
  ];
  const catalogoMasculino = [
    "Faixa de Barba", "Barba Completa", "Pescoço", "Nuca", "Costas", 
    "Tórax (Peitoral)", "Abdômen", "Braços", "Ombros"
  ];
  const catalogoBase = (sexo === "masculino") ? catalogoMasculino : catalogoFeminino;

  const areasNuncaFeitas = catalogoBase.filter(areaCat => {
    const catLow = areaCat.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const jaDetectada = [...todasAreasDetectadas].some(a => {
      const aNorm = a.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return aNorm.includes(catLow) || catLow.includes(aNorm.substring(0, 5));
    });
    const temPendente = [...areasComOrcamentoPendente].some(a => {
      const aNorm = a.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return aNorm.includes(catLow) || catLow.includes(aNorm.substring(0, 5));
    });
    return !jaDetectada && !temPendente;
  });

  return {
    procs,
    primeiraArea,
    sessaoAtual,
    totalSessoes,
    saldoRestante,
    pacotesAtivos,
    pacotesFinalizadosOuVencidos,
    orcamentosPendentes,
    areasNuncaFeitas,
    todasAreasDetectadas
  };
}

export function gerarOfertasCadenciaClinica(app, saldoServicos = [], historicoLaser = [], sexo = null) {
  if (!app) return [];

  const ofertas = [];
  const primeiroNome = (app.clienteNome || "Cliente").split(" ")[0];

  const {
    primeiraArea,
    sessaoAtual,
    totalSessoes,
    saldoRestante,
    pacotesAtivos,
    pacotesFinalizadosOuVencidos,
    orcamentosPendentes,
    areasNuncaFeitas
  } = consolidarPerfilClinicoCompleto(app, saldoServicos, historicoLaser, sexo);

  const pctConcluido = Math.min(100, Math.round((sessaoAtual / Math.max(1, totalSessoes)) * 100));

  // =========================================================================
  // CENÁRIO A: CLIENTE DE CORTESIA / PACOTE CURTO (Ex: 3 sessões de Axilas)
  // =========================================================================
  const ehCortesiaPorNome = String(app.nomePlano || "").toLowerCase().includes("cortesia") ||
    pacotesAtivos.some(p => p.ehCortesia);
  const ehCortesiaPorQtd = totalSessoes <= 3 && totalSessoes > 0;

  if (ehCortesiaPorNome || ehCortesiaPorQtd) {
    const sessoesFaltantesCiclo = Math.max(1, 10 - totalSessoes);
    const areaCurta = primeiraArea.split(' - ')[0].replace(/\(.*?\)/g, '').trim();

    ofertas.push({
      sessaoAtual,
      totalSessoes,
      badge: `Cortesia • ${sessaoAtual}/${totalSessoes}`,
      fase: `CORTESIA CLÍNICA (${sessaoAtual}ª SESSÃO DE ${totalSessoes}): COMPLETAR TRATAMENTO DEFINITIVO`,
      fasePill: `🎁 Cortesia • ${sessaoAtual}/${totalSessoes}`,
      tipoFase: "cortesia",
      destaque: "👉 O QUE VOCÊ DEVE OFERTAR HOJE:",
      ofertaPrincipal: `Pacote de +${sessoesFaltantesCiclo} Sessões de ${areaCurta} (Ciclo Completo)`,
      motivo: `Cliente fazendo cortesia de ${totalSessoes} sessões de ${areaCurta}. Para eliminação definitiva dos pelos são necessárias de 8 a 10 sessões. Momento de fechar o ciclo completo de +${sessoesFaltantesCiclo} sessões!`,
      script: `“${primeiroNome}, você já reparou como o laser já afinou os pelinhos de ${areaCurta}? A cortesia de ${totalSessoes} sessões é excelente para você ver como a nossa tecnologia não dói, mas para o resultado ser 100% definitivo e não nascer mais nada, o protocolo completo exige 10 sessões. Nós conseguimos segurar uma condição especial de cliente ativa para você garantir as ${sessoesFaltantesCiclo} sessões restantes hoje!”`,
      secundaria: "Adicionar Meia Perna ou Virilha com desconto de início de tratamento"
    });
    return ofertas;
  }

  // =========================================================================
  // CENÁRIO B: REVENDA & MANUTENÇÃO NA RETA FINAL DO AGENDAMENTO ATUAL
  // =========================================================================
  const saldoEfetivo = (saldoRestante !== undefined && saldoRestante !== null) 
    ? saldoRestante 
    : Math.max(0, totalSessoes - sessaoAtual);

  const pacoteAcabando = (saldoEfetivo <= 2 && totalSessoes >= 5) || (sessaoAtual >= 8 || pctConcluido >= 75);

  if (pacoteAcabando) {
    const areaCurta = primeiraArea.split(' - ')[0].replace(/\(.*?\)/g, '').trim();
    ofertas.push({
      sessaoAtual,
      totalSessoes,
      badge: `Sessão ${sessaoAtual}/${totalSessoes}`,
      fase: `RETA FINAL (${sessaoAtual}ª SESSÃO • RESTAM ${saldoEfetivo}): MANUTENÇÃO & REVENDA`,
      fasePill: `💎 Reta Final • Saldo ${saldoEfetivo}`,
      tipoFase: "renovacao",
      destaque: "👉 O QUE VOCÊ DEVE OFERTAR HOJE:",
      ofertaPrincipal: `Plano de Manutenção Anual / Semestral em ${areaCurta}`,
      motivo: `O pacote de ${areaCurta} está na reta final (${sessaoAtual}ª de ${totalSessoes} sessões, restam ${saldoEfetivo}). Oportunidade perfeita de vender a manutenção preventiva para garantir resultado definitivo vitalício.`,
      script: `“${primeiroNome}, parabéns! Seu resultado em ${areaCurta} está maravilhoso e você já está finalizando o seu pacote! Para manter essa pele impecável para sempre e não deixar nenhum pelinho residual voltar com oscilações hormonais, preparamos o nosso Plano de Manutenção Anual com condição exclusiva de renovação para você!”`,
      secundaria: "Expandir para nova região com benefício de cliente fidelidade"
    });
    return ofertas;
  }

  // =========================================================================
  // CENÁRIO C: RESGATE DE ORÇAMENTO PENDENTE (Se a cliente tiver proposta aberta)
  // =========================================================================
  if (orcamentosPendentes.length > 0) {
    const pendente = orcamentosPendentes[0];
    const valorFmt = formatarReal(pendente.valorFinal);
    ofertas.push({
      sessaoAtual,
      totalSessoes,
      badge: "Orçamento Pendente",
      fase: "FECHAMENTO DE PROPOSTA PENDENTE",
      fasePill: `🔥 Resgate • ${pendente.area}`,
      tipoFase: "pendente",
      destaque: "👉 OPORTUNIDADE DE FECHAMENTO HOJE:",
      ofertaPrincipal: `Fechar Orçamento: ${pendente.plano}`,
      motivo: `A cliente já tem uma proposta em aberto para ${pendente.area}${valorFmt ? ' (' + valorFmt + ')' : ''}${pendente.diasCorridos !== undefined ? ' apresentada há ' + pendente.diasCorridos + ' dia(s)' : ''}. Aproveite a presença dela na clínica para fechar hoje!`,
      script: `“${primeiroNome}, vi aqui no sistema que você já tem uma proposta prontinha para ${pendente.area}! Como você já está aqui na clínica hoje, que tal já formalizarmos para você garantir essa condição e começar na próxima sessão?”`,
      secundaria: ""
    });
  }

  // =========================================================================
  // CENÁRIO D: EQUILÍBRIO INTELIGENTE — MANUTENÇÃO DE ÁREAS FINALIZADAS OU VENCIDAS
  // =========================================================================
  if (pacotesFinalizadosOuVencidos.length > 0) {
    const areaFinalizada = pacotesFinalizadosOuVencidos[0]?.area || "Virilha Completa";
    const statusTxt = pacotesFinalizadosOuVencidos[0]?.status || "Ciclo concluído";
    ofertas.push({
      sessaoAtual,
      totalSessoes,
      badge: statusTxt.toLowerCase().includes("vencid") ? "Plano Vencido" : "Manutenção Preventiva",
      fase: `MANUTENÇÃO DE ÁREAS CONCLUÍDAS`,
      fasePill: `💎 Manutenção • ${areaFinalizada}`,
      tipoFase: "renovacao",
      destaque: "👉 OFERTA DE RETENÇÃO & FIDELIZAÇÃO:",
      ofertaPrincipal: `Plano de Manutenção Anual em ${areaFinalizada}`,
      motivo: `A cliente já concluiu as sessões de ${areaFinalizada} no passado (${statusTxt}). A manutenção preventiva evita o retorno de folículos por oscilações hormonais e mantém o resultado vitalício.`,
      contextoHistorico: `Cliente já realizou ${areaFinalizada} no passado (${statusTxt}) — ofertar manutenção periódica`,
      script: `“${primeiroNome}, parabéns pela sua dedicação! Como você já concluiu ${areaFinalizada} no passado, para garantir que variações hormonais nunca tragam pelos de volta, nosso Plano de Manutenção Anual é ideal com condição especial de cliente ativa para manter sua pele impecável para sempre!”`,
      secundaria: "Expandir para nova região livre de lâminas"
    });
  }

  // =========================================================================
  // CENÁRIO E: EXPANSÃO DE ÁREAS NUNCA CONTRATADAS
  // =========================================================================
  if (areasNuncaFeitas.length > 0 && ofertas.length < 3) {
    const areaExpansao = areasNuncaFeitas[0] || "Meia Perna";
    ofertas.push({
      sessaoAtual,
      totalSessoes,
      badge: `Expansão Corporal`,
      fase: `EXPANSÃO CLÍNICA: CORPO LIVRE DE LÂMINAS`,
      fasePill: `⚡ Expansão • ${areaExpansao}`,
      tipoFase: "expansao",
      destaque: "👉 SEGUNDA OPÇÃO DE OFERTA:",
      ofertaPrincipal: `Depilação a Laser — ${areaExpansao} (10 Sessões)`,
      motivo: `Área de alta procura que a cliente ainda não trata. Perfeita para completar o tratamento corporal e aposentar a gilete de vez.`,
      script: `“${primeiroNome}, já que você está adorando a liberdade do laser nas áreas atuais, que tal aproveitarmos para iniciar ${areaExpansao} hoje com uma condição exclusiva de cliente da casa?”`,
      secundaria: ""
    });
  }

  // =========================================================================
  // CENÁRIO D: CLIENTE EM EXPANSÃO PURA (Sem áreas finalizadas no passado)
  // =========================================================================
  const todosServicosContratados = [
    ...pacotesAtivos.map(p => ({ servico: p.area, nome: p.area }))
  ];

  const analise = analisarOportunidades({
    servicosContratados: todosServicosContratados,
    servicosHoje: app.arrServ || [],
    historicoAreas: historicoLaser,
    clienteNome: app.clienteNome || "",
    sexo,
    limite: 3
  });

  const ehFeminino = (sexo === "feminino" || !sexo);
  const areasCorporaisExcluidasDaFace = new Set(["Mento", "Maxilar", "Laterais da Face"]);

  const oportunidadesCorporais = (analise.oportunidades || []).filter(op => {
    if (ehFeminino && areasCorporaisExcluidasDaFace.has(op.areaNome)) {
      return false;
    }
    return true;
  });

  const principal = oportunidadesCorporais[0] || {
    servicoNome: "Depilação a Laser",
    areaNome: areasNuncaFeitas[0] || "Meia Perna",
    motivo: "Excelente aceitação para clientes que já tratam outras áreas.",
    script: `“${primeiroNome}, que tal aproveitarmos para iniciar ${areasNuncaFeitas[0] || "Meia Perna"} com condição exclusiva de cliente ativa?”`
  };

  const secundaria = oportunidadesCorporais[1] || {
    servicoNome: "Depilação a Laser",
    areaNome: areasNuncaFeitas[1] || "Coxa",
    motivo: "Área de alta procura que complementa perfeitamente o tratamento.",
    script: `“${primeiroNome}, você já pensou em nunca mais se preocupar com lâmina? Conseguimos iniciar ${areasNuncaFeitas[1] || "Coxa"} hoje com condição especial!”`
  };

  ofertas.push({
    sessaoAtual,
    totalSessoes,
    badge: `Sessão ${sessaoAtual}/${totalSessoes}`,
    fase: `EXPANSÃO CLÍNICA (${sessaoAtual}ª SESSÃO • ${pctConcluido}%): COMBOS & NOVAS ÁREAS`,
    fasePill: `⚡ Expansão • ${principal.areaNome}`,
    tipoFase: "expansao",
    destaque: "👉 O QUE VOCÊ DEVE OFERTAR HOJE:",
    ofertaPrincipal: `${principal.servicoNome} — ${principal.areaNome}`,
    motivo: principal.motivo || "Excelente aceitação para clientes que já tratam outras áreas.",
    script: principal.script,
    secundaria: `${secundaria.servicoNome} — ${secundaria.areaNome}`
  });

  if (secundaria && secundaria.areaNome !== principal.areaNome && ofertas.length < 3) {
    ofertas.push({
      sessaoAtual,
      totalSessoes,
      badge: `Opção 2`,
      fase: `EXPANSÃO ALTERNATIVA: MEMBROS INFERIORES`,
      fasePill: `⚡ Expansão • ${secundaria.areaNome}`,
      tipoFase: "expansao",
      destaque: "👉 SEGUNDA OPÇÃO DE OFERTA:",
      ofertaPrincipal: `${secundaria.servicoNome} — ${secundaria.areaNome}`,
      motivo: secundaria.motivo || "Área de alta procura que complementa perfeitamente o tratamento.",
      script: secundaria.script,
      secundaria: ""
    });
  }

  // Deduplicação estrita: não repetir a mesma área em mais de um card
  const areasVistas = new Set();
  const ofertasUnicas = [];
  for (const ofe of ofertas) {
    const areaId = (ofe.fasePill || ofe.ofertaPrincipal || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!areasVistas.has(areaId)) {
      areasVistas.add(areaId);
      ofertasUnicas.push(ofe);
    }
    if (ofertasUnicas.length >= 3) break;
  }

  return ofertasUnicas;
}

function formatarMarkdownSimples(texto = "") {
  return String(texto)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

async function gerarPitchParaOferta(idx) {
  const o = ofertasAtuais[idx];
  const app = appAtualOfertas;
  if (!o || !app) return;

  const box = document.getElementById(`atend-pitch-ia-box-${idx}`);
  const loading = document.getElementById(`pitch-ia-loading-${idx}`);
  const resultado = document.getElementById(`pitch-ia-resultado-${idx}`);
  const actions = document.getElementById(`pitch-ia-actions-${idx}`);

  if (box) box.style.display = "block";
  if (loading) loading.style.display = "flex";
  if (resultado) resultado.style.display = "none";
  if (actions) actions.style.display = "none";

  try {
    const procs = (app.arrServ && app.arrServ.length > 0) ? app.arrServ.map(s => s.nome) : [app.procedimento || "Depilação a Laser"];
    const historicoNomes = (historicoLaserAtual || []).map(h => h.area || h.nomeArea).filter(Boolean);

    // Mapeia todos os pacotes que o cliente possui para a IA entender o contexto 360°
    const nomesTodosPacotes = (state.todosPacotesCliente || []).map(p => {
      const saldoStr = (p.saldo !== undefined && p.saldo !== null && p.saldo !== "") ? ` (Saldo: ${p.saldo})` : "";
      return `${p.nomePlano || p.servico || "Plano"}${saldoStr}`;
    }).filter(Boolean);

    const pitchTexto = await gerarPitchOfertaIa({
      clienteNome: app.clienteNome || "Cliente",
      primeiraArea: procs.join(", "),
      sessaoAtual: o.sessaoAtual || 1,
      totalSessoes: o.totalSessoes || 10,
      fase: o.fase || "Intermediária",
      tipoFase: o.tipoFase || "expansao",
      sugestaoOferta: o.ofertaPrincipal,
      motivoClinico: o.motivo,
      historicoAreas: [...new Set(historicoNomes)],
      todosPacotesCliente: nomesTodosPacotes,
      observacoes: app.observacao || ""
    });

    if (resultado) {
      resultado.innerHTML = formatarMarkdownSimples(pitchTexto);
      resultado.style.display = "block";
    }
    if (actions) actions.style.display = "flex";
  } catch (err) {
    if (resultado) {
      resultado.innerHTML = `<span style="color: #b91c1c;">Erro ao gerar pitch com IA: ${err.message}. Use o script padrão acima.</span>`;
      resultado.style.display = "block";
    }
  } finally {
    if (loading) loading.style.display = "none";
  }
}

let timerDebounceIa = null;
let ultimoIdClienteIa = null;

const cacheOfertasIaPorCliente = new Map();

function obterIdAtendimento(a) {
  if (!a) return "";
  return String(a.codConsulta || a.id || a.codAgendamento || a.codCliente || "");
}

export async function atualizarOfertasSugeridasAtendimento(app, saldoServicos = [], historicoLaser = [], sexo = null) {
  const atendCardOfertas = document.getElementById("atend-card-ofertas");
  const atendQtdOfertas = document.getElementById("atend-qtd-ofertas");
  const atendListaOfertas = document.getElementById("atend-lista-ofertas");

  if (!atendCardOfertas || !atendListaOfertas) return;

  const codClienteKey = String(app?.codCliente || obterIdAtendimento(app));
  appAtualOfertas = app;
  historicoLaserAtual = historicoLaser;

  const perfilBase = consolidarPerfilClinicoCompleto(app, saldoServicos, historicoLaser, sexo);
  const cachePerfilKey = `${codClienteKey}_atv${perfilBase.pacotesAtivos.length}_fin${perfilBase.pacotesFinalizadosOuVencidos.length}_his${(historicoLaser || []).length}`;

  // 1. Se já temos as recomendações da IA em cache para este cliente com estes dados completos, renderiza imediatamente!
  if (codClienteKey && cacheOfertasIaPorCliente.has(cachePerfilKey)) {
    const cached = cacheOfertasIaPorCliente.get(cachePerfilKey);
    ofertasAtuais = cached;
    atendCardOfertas.style.display = "block";
    if (atendQtdOfertas) {
      atendQtdOfertas.textContent = `✨ ${cached.length} opções (IA)`;
    }
    renderizarCards(cached, false);
    return;
  }

  // 2. Fallback inicial gerado instantaneamente (já com lógica de manutenção para áreas finalizadas)
  const ofertasFallback = gerarOfertasCadenciaClinica(app, saldoServicos, historicoLaser, sexo);
  ofertasAtuais = ofertasFallback;

  if (!ofertasFallback || ofertasFallback.length === 0) {
    atendCardOfertas.style.display = "none";
    return;
  }

  atendCardOfertas.style.display = "block";
  if (atendQtdOfertas) {
    atendQtdOfertas.textContent = `✨ IA Copilot`;
  }

  function renderizarCards(lista, isLoading = false) {
    if (isLoading) {
      atendListaOfertas.innerHTML = `
        <div class="oferta-enxuta-card" style="border-left: 3px solid #8b5cf6;">
          <div class="oferta-enxuta-top">
            <div class="oferta-enxuta-title-row">
              <span class="oferta-enxuta-icon">✨</span>
              <strong class="oferta-enxuta-titulo">IA Copilot analisando áreas da cliente...</strong>
            </div>
            <span class="oferta-enxuta-pill tag-cross-destaque">Cruzando Pacotes</span>
          </div>
          <div class="oferta-enxuta-motivo" style="color: #64748b; font-style: italic;">
            Consultando histórico de planos ativos, áreas já finalizadas e áreas nunca feitas para prescrever a melhor oferta...
          </div>
        </div>
      `;
      return;
    }

    let html = "";
    lista.forEach((o, idx) => {
      let tagClasse = "tag-cadencia-destaque";
      let iconLg = "✨";
      if (o.tipoFase === "cortesia" || o.fase?.includes("CORTESIA")) {
        tagClasse = "tag-cortesia-destaque";
        iconLg = "🎁";
      } else if (o.tipoFase === "pendente" || o.fase?.includes("PENDENTE") || o.fase?.includes("RESGATE") || o.fasePill?.includes("Resgate")) {
        tagClasse = "tag-oportunidade-destaque";
        iconLg = "🔥";
      } else if (o.tipoFase === "expansao" || o.fase?.includes("EXPANSÃO")) {
        tagClasse = "tag-cross-destaque";
        iconLg = "⚡";
      } else if (o.tipoFase === "renovacao" || o.fase?.includes("MANUTENÇÃO") || o.fase?.includes("RETA FINAL")) {
        tagClasse = "tag-fidelizacao-destaque";
        iconLg = "💎";
      }

      const regexEmoji = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\s•–—-]+/u;
      const tituloLimpo = String(o.ofertaPrincipal || "").replace(regexEmoji, "").trim();
      const pillLimpa = String(o.fasePill || o.badge || "").replace(regexEmoji, "").trim();
      const contextoHistorico = o.contextoHistorico || "";

      html += `
        <div class="oferta-enxuta-card" data-oferta-idx="${idx}" data-tipo-fase="${o.tipoFase || 'expansao'}">
          <div class="oferta-enxuta-top">
            <div class="oferta-enxuta-title-row">
              <span class="oferta-enxuta-icon">${iconLg}</span>
              <strong class="oferta-enxuta-titulo" title="${tituloLimpo}">${tituloLimpo}</strong>
            </div>
            <span class="oferta-enxuta-pill ${tagClasse}">${pillLimpa}</span>
          </div>

          ${contextoHistorico ? `
            <div class="oferta-enxuta-contexto">
              <span>📋</span>
              <strong>${contextoHistorico}</strong>
            </div>
          ` : ''}

          ${o.motivo ? `<div class="oferta-enxuta-motivo">${o.motivo}</div>` : ''}
        </div>
      `;
    });
    atendListaOfertas.innerHTML = html;
  }

  // Mostra loading suave enquanto a IA processa
  renderizarCards([], true);

  if (!listenerIaInicializado) {
    listenerIaInicializado = true;

    // Botão consolidado no rodapé do card de oportunidades
    const btnConsolidado = document.getElementById("btn-lancar-orcamento-consolidado");
    btnConsolidado?.addEventListener("click", () => {
      abrirModalLancamentoOrcamento({
        sugestaoInicial: "",
        ofertas: ofertasAtuais
      });
    });

    // Se a aplicadora clicar diretamente em algum card da lista, também pode abrir o modal já selecionando aquela opção
    atendListaOfertas.addEventListener("click", (e) => {
      const card = e.target.closest(".oferta-enxuta-card");
      if (card) {
        const idx = parseInt(card.getAttribute("data-oferta-idx"), 10);
        const o = ofertasAtuais[idx];
        const sugestaoInicial = o ? (o.ofertaPrincipal || "") : "";
        abrirModalLancamentoOrcamento({
          sugestaoInicial,
          ofertas: ofertasAtuais
        });
      }
    });
  }

  // 2. Debounce de 350ms para chamar a IA apenas UMA vez após todas as consultas assíncronas terminarem
  if (timerDebounceIa) {
    clearTimeout(timerDebounceIa);
  }

  const idAppMomento = obterIdAtendimento(app);

  timerDebounceIa = setTimeout(async () => {
    try {
      // Se trocou de cliente durante o debounce, não executa para o anterior
      if (obterIdAtendimento(appAtualOfertas) !== idAppMomento) return;

      const perfil = consolidarPerfilClinicoCompleto(app, saldoServicos, historicoLaser, sexo);
      const {
        procs,
        sessaoAtual,
        totalSessoes,
        saldoRestante,
        pacotesAtivos,
        pacotesFinalizadosOuVencidos,
        orcamentosPendentes,
        areasNuncaFeitas
      } = perfil;

      const historicoNomes = (historicoLaser || []).map(h => h.area || h.nomeArea || h.servico).filter(Boolean);

      console.log(`[Ofertas] 🤖 Solicitando análise 360° ao GPT-4o-mini para: ${app.clienteNome || "Cliente"}:`, {
        pacotesAtivos: pacotesAtivos.map(t => `${t.area} (${t.realizadas}/${t.total} • saldo: ${t.saldo})`),
        pacotesFinalizadosOuVencidos: pacotesFinalizadosOuVencidos.map(t => `${t.area} (${t.status || t.plano})`),
        orcamentosPendentes: (orcamentosPendentes || []).map(t => `${t.area} (${t.plano} • R$ ${t.valorFinal})`),
        areasLivresNuncaFeitas: areasNuncaFeitas
      });

      const resultadoIa = await analisarOfertaClinicaComIa({
        clienteNome: app.clienteNome || "Cliente",
        areaHoje: procs.join(", "),
        sessaoAtualHoje: sessaoAtual,
        totalSessoesHoje: totalSessoes,
        saldoHoje: saldoRestante,
        pacotesAtivos,
        pacotesFinalizadosOuVencidos,
        orcamentosPendentes,
        areasNuncaFeitas,
        historicoAreas: [...new Set(historicoNomes)],
        sexo
      });

      if (obterIdAtendimento(appAtualOfertas) !== idAppMomento) return;

      if (Array.isArray(resultadoIa) && resultadoIa.length > 0) {
        ofertasAtuais = resultadoIa.map((item, idx) => ({
          sessaoAtual,
          totalSessoes,
          badge: item.fasePill || `Opção ${idx + 1}`,
          fasePill: item.fasePill || `⚡ Sugestão ${idx + 1}`,
          tipoFase: item.tipoFase || "expansao",
          ofertaPrincipal: item.oQueOfertar,
          motivo: item.porQueOfertar,
          contextoHistorico: item.contextoHistorico || "",
          geradoPorIa: true
        }));

        const cachePerfilKeyAtual = `${codClienteKey}_atv${pacotesAtivos.length}_fin${pacotesFinalizadosOuVencidos.length}_pen${orcamentosPendentes.length}_his${historicoNomes.length}`;
        if (codClienteKey) {
          cacheOfertasIaPorCliente.set(cachePerfilKeyAtual, ofertasAtuais);
        }

        renderizarCards(ofertasAtuais, false);
        if (atendQtdOfertas) {
          atendQtdOfertas.textContent = `✨ ${ofertasAtuais.length} opções (IA)`;
        }
      } else if (resultadoIa && resultadoIa.oQueOfertar) {
        ofertasAtuais = [{
          sessaoAtual,
          totalSessoes,
          badge: resultadoIa.fasePill || "✨ Sugestão",
          fasePill: resultadoIa.fasePill || "✨ Sugestão IA",
          tipoFase: resultadoIa.tipoFase || "expansao",
          ofertaPrincipal: resultadoIa.oQueOfertar,
          motivo: resultadoIa.porQueOfertar,
          contextoHistorico: resultadoIa.contextoHistorico || "",
          geradoPorIa: true
        }];

        const cachePerfilKeyAtual = `${codClienteKey}_atv${pacotesAtivos.length}_fin${pacotesFinalizadosOuVencidos.length}_pen${orcamentosPendentes.length}_his${historicoNomes.length}`;
        if (codClienteKey) {
          cacheOfertasIaPorCliente.set(cachePerfilKeyAtual, ofertasAtuais);
        }

        renderizarCards(ofertasAtuais, false);
        if (atendQtdOfertas) {
          atendQtdOfertas.textContent = `✨ GPT-4o mini`;
        }
      } else {
        // Se a IA retornou vazio, exibe o fallback
        renderizarCards(ofertasFallback, false);
      }
    } catch (err) {
      console.warn("[Ofertas] Falha na análise direta por IA:", err);
      // Fallback em caso de erro
      renderizarCards(ofertasFallback, false);
    }
  }, 350);
}


