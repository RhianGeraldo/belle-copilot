/**
 * BELLE COPILOT - MOTOR DE CADÊNCIA CLÍNICA & CROSS-SELL
 * Prescreve ofertas inteligentes e scripts verbais para a aplicadora baseados na sessão da cliente.
 *
 * A sugestão de novas áreas vem do cruzamento real do mapa corporal
 * (engines/cross-sell.js), não mais de comparações de texto fixas.
 */

import { analisarOportunidades } from './cross-sell.js';

export function extrairNumeroSessaoArea(nomeArea, historicoLaser = [], saldoServicos = [], app = null) {
  // 1. Prioridade: lbServ nativo do agendamento (ex: "AXILAS (P) - depilação a laser - 15/40")
  if (app && app.lbServ) {
    const cleanArea = (nomeArea || "").toLowerCase();
    const linhas = app.lbServ.split("<br>").map(l => l.trim()).filter(Boolean);
    
    for (const l of linhas) {
      const match = l.match(/(.+?)\s*-\s*(\d+)\/(\d+)/) || l.match(/(\d+)\/(\d+)/);
      if (match) {
        if (match[3]) {
          const areaLine = match[1].toLowerCase();
          if (!nomeArea || areaLine.includes(cleanArea.substring(0, 5)) || cleanArea.includes(areaLine.substring(0, 5))) {
            return {
              sessaoAtual: parseInt(match[2], 10),
              totalSessoes: parseInt(match[3], 10),
              origem: "lbServ"
            };
          }
        } else {
          return {
            sessaoAtual: parseInt(match[1], 10),
            totalSessoes: parseInt(match[2], 10),
            origem: "lbServ"
          };
        }
      }
    }
  }

  // 2. Prioridade: saldovendaplano oficial (gasto, quantidade, saldo_atual)
  if (Array.isArray(saldoServicos) && saldoServicos.length > 0) {
    const clean = (nomeArea || "").toLowerCase();
    const keywords = clean.split(/[\s\-\(\)\/\+]+/).filter(w => w.length >= 3 && !['depilação', 'laser', 'cortesia', 'combo', 'sessões', 'sessao'].includes(w));
    
    const match = saldoServicos.find(s => {
      const sNome = (s.servico || s.nome || "").toLowerCase();
      return keywords.some(k => sNome.includes(k));
    }) || saldoServicos[0];

    if (match) {
      const gasto = parseInt(match.gasto ?? match.realizadas ?? match.qtd_executada ?? 0, 10);
      const qtd = parseInt(match.quantidade ?? match.contratadas ?? match.qtd_contratada ?? 10, 10);
      const saldo = parseInt(match.saldo_atual ?? match.saldo ?? (qtd - gasto), 10);
      return {
        sessaoAtual: Math.max(1, gasto),
        totalSessoes: Math.max(1, qtd),
        saldoRestante: saldo,
        origem: "saldovendaplano"
      };
    }
  }

  // 3. Fallback: Histórico de registros anteriores do prontuário (parametro_laser)
  if (Array.isArray(historicoLaser) && historicoLaser.length > 0) {
    const clean = (nomeArea || "").toLowerCase();
    const registrosArea = historicoLaser.filter(r => {
      const rArea = (r.area || "").toLowerCase();
      return !nomeArea || rArea.includes(clean.substring(0, 5)) || clean.includes(rArea.substring(0, 5));
    });
    const count = registrosArea.length > 0 ? registrosArea.length : historicoLaser.length;
    return {
      sessaoAtual: count + 1,
      totalSessoes: 10,
      origem: "parametro_laser"
    };
  }

  return { sessaoAtual: 1, totalSessoes: 10, origem: "default" };
}

export function gerarOfertasCadenciaClinica(app, saldoServicos = [], historicoLaser = []) {
  if (!app) return [];

  const ofertas = [];
  const procs = (app.arrServ && app.arrServ.length > 0) 
    ? app.arrServ.map(s => s.nome) 
    : [app.procedimento || "Depilação a Laser"];

  const primeiraArea = procs[0] || "Tratamento";
  const { sessaoAtual, totalSessoes } = extrairNumeroSessaoArea(primeiraArea, historicoLaser, saldoServicos, app);

  const pctConcluido = Math.min(100, Math.round((sessaoAtual / Math.max(1, totalSessoes)) * 100));
  const primeiroNome = (app.clienteNome || "Cliente").split(" ")[0];

  // 1. Cadência por Fase da Sessão
  if (sessaoAtual <= 3 || pctConcluido <= 30) {
    // Fase Inicial: Clareamento e Cuidados Pós-Laser
    ofertas.push({
      badge: `Sessão ${sessaoAtual}/${totalSessoes}`,
      fase: `FASE INICIAL (${sessaoAtual}ª SESSÃO • ${pctConcluido}%): CLAREAMENTO & CONFORTO`,
      destaque: "👉 O QUE VOCÊ DEVE OFERTAR HOJE:",
      ofertaPrincipal: "Clareamento a Laser / Home Care de Hidratação",
      motivo: "Cliente no início do tratamento. A pele responde melhor com hidratação profunda e já é o momento ideal para associar o clareamento nas áreas com hipercromia (axilas/virilha).",
      script: `“${primeiroNome}, como você está nas primeiras sessões de ${primeiraArea.split(' - ')[0]}, para potencializar o resultado e deixar a pele lisinha e sem manchinhas, nós indicamos associar o nosso Protocolo de Clareamento a Laser!”`,
      secundaria: "🤍 Clareamento Íntimo ou Axilar a Laser: Uniformiza o tom da pele desde as primeiras sessões."
    });
  } else if (sessaoAtual >= 8 || pctConcluido >= 75) {
    // Reta Final: Fidelização e Manutenção Preventiva
    ofertas.push({
      badge: `Sessão ${sessaoAtual}/${totalSessoes}`,
      fase: `RETA FINAL (${sessaoAtual}ª SESSÃO • ${pctConcluido}%): MANUTENÇÃO & RENOVAÇÃO`,
      destaque: "👉 O QUE VOCÊ DEVE OFERTAR HOJE:",
      ofertaPrincipal: "Plano de Manutenção Anual a Laser / Nova Região",
      motivo: `Cliente na reta final do pacote (${sessaoAtual}ª de ${totalSessoes} sessões). É a hora exata de fechar a manutenção preventiva semestral antes que o pacote termine, garantindo resultado vitalício.`,
      script: `“${primeiroNome}, parabéns! Você já está na ${sessaoAtual}ª sessão, na reta final do seu pacote! Para manter essa pele impecável para sempre e não deixar nenhum pelinho voltar, nós preparamos uma condição exclusiva no Plano de Manutenção Anual!”`,
      secundaria: "✨ Iniciar Nova Região a Laser: Desconto especial de cliente fiel para novas áreas corporais."
    });
  } else {
    // Fase Intermediária: expansão guiada pelo mapa de áreas da cliente.
    // A análise sabe o que ela já trata e devolve a vizinha que falta, a região
    // quase completa e o outro serviço aplicável na área que ela já faz.
    const analise = analisarOportunidades({
      servicosContratados: saldoServicos,
      servicosHoje: app.arrServ || [],
      historicoAreas: historicoLaser,
      clienteNome: app.clienteNome || "",
      limite: 3
    });

    const principal = analise.oportunidades[0];
    const secundaria = analise.oportunidades[1];

    let sugestaoCross = principal
      ? `${principal.servicoNome} — ${principal.areaNome}`
      : "Novas áreas a laser";
    let scriptCross = principal
      ? principal.script
      : `“${primeiroNome}, já que você está amando o resultado do laser, que tal aproveitarmos para iniciar uma nova região com condição de cliente ativa?”`;
    const motivoCross = principal
      ? principal.motivo
      : "Cliente já vê redução significativa de pelos e confia na eficácia do laser.";
    const alternativa = secundaria
      ? `➕ ${secundaria.servicoNome} — ${secundaria.areaNome}: ${secundaria.motivo}`
      : "🖤 Black Peel a Laser: peeling de carbono para efeito porcelana e controle de oleosidade.";

    ofertas.push({
      badge: `Sessão ${sessaoAtual}/${totalSessoes}`,
      fase: `FASE INTERMEDIÁRIA (${sessaoAtual}ª SESSÃO • ${pctConcluido}%): EXPANSÃO DE ÁREAS`,
      destaque: "👉 O QUE VOCÊ DEVE OFERTAR HOJE:",
      ofertaPrincipal: sugestaoCross,
      motivo: motivoCross,
      script: scriptCross,
      secundaria: alternativa
    });
  }

  return ofertas;
}

export function atualizarOfertasSugeridasAtendimento(app, saldoServicos = [], historicoLaser = []) {
  const atendCardOfertas = document.getElementById("atend-card-ofertas");
  const atendQtdOfertas = document.getElementById("atend-qtd-ofertas");
  const atendListaOfertas = document.getElementById("atend-lista-ofertas");

  if (!atendCardOfertas || !atendListaOfertas) return;

  const ofertas = gerarOfertasCadenciaClinica(app, saldoServicos, historicoLaser);
  if (!ofertas || ofertas.length === 0) {
    atendCardOfertas.style.display = "none";
    return;
  }

  atendCardOfertas.style.display = "block";
  if (atendQtdOfertas) {
    atendQtdOfertas.textContent = `${ofertas.length} prescrição`;
  }

  let html = "";
  ofertas.forEach(o => {
    let tagClasse = "tag-cadencia-destaque";
    let iconLg = "🌟";
    if (o.fase.includes("EXPANSÃO") || o.fase.includes("INTERMEDIÁRIA")) {
      tagClasse = "tag-cross-destaque";
      iconLg = "⚡";
    } else if (o.fase.includes("MANUTENÇÃO") || o.fase.includes("RETA FINAL")) {
      tagClasse = "tag-fidelizacao-destaque";
      iconLg = "💎";
    } else if (o.fase.includes("INICIAL") || o.fase.includes("CLAREAMENTO")) {
      tagClasse = "tag-cadencia-destaque";
      iconLg = "🤍";
    }

    html += `
      <div class="oferta-direta-box">
        <div class="oferta-direta-badge-row">
          <span class="oferta-sessao-tag">📊 ${o.badge}</span>
          <span class="oferta-tipo-tag ${tagClasse}">⭐ ${o.fase}</span>
        </div>
        
        <div class="oferta-acao-principal">
          <div class="oferta-icon-lg">${iconLg}</div>
          <div class="oferta-acao-info">
            <span class="oferta-acao-label">${o.destaque}</span>
            <strong class="oferta-acao-titulo">${o.ofertaPrincipal}</strong>
          </div>
        </div>

        <div class="oferta-motivo-box">
          <strong>💡 Por que ofertar agora:</strong> ${o.motivo}
        </div>

        <div class="oferta-script-box">
          <strong>🗣️ Script Verbal para a Aplicadora falar com a cliente:</strong>
          <p class="oferta-script-texto">${o.script}</p>
        </div>

        ${o.secundaria ? `
          <div class="oferta-alternativa-item">
            <span>➕ <strong>Alternativa secundária:</strong> ${o.secundaria}</span>
          </div>
        ` : ''}
      </div>
    `;
  });

  atendListaOfertas.innerHTML = html;
}
