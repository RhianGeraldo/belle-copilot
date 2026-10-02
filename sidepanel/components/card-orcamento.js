/**
 * BELLE COPILOT - CARD DE ORÇAMENTO (COMPARTILHADO)
 *
 * Usado nas duas telas que trabalham orçamentos em aberto, para o markup viver num
 * lugar só:
 *   - Agenda ▸ 💰 Oportunidades   (aplicadora, últimos 30 dias)
 *   - Comercial ▸ Vendas & Resgate (consultora, 3 meses encerrando 30 dias atrás)
 */

import { formatarReal } from '../engines/cadencia-vendas.js';

export const COR_FILA = {
  aguardando: "#b45309",
  pendente:   "#0369a1",
  suspenso:   "#6d28d9",
  aprovado:   "#15803d",
  vencendo:   "#b91c1c"
};

export function escaparHtml(txt = "") {
  return String(txt).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function textoIdade(dias) {
  if (dias === 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}

export function formatarTelefoneExibicao(telefone = "") {
  if (!telefone) return "";
  const limpo = String(telefone).replace(/\D/g, "");
  if (limpo.length === 11) {
    return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 7)}-${limpo.slice(7)}`;
  }
  if (limpo.length === 10) {
    return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 6)}-${limpo.slice(6)}`;
  }
  if (limpo.length === 12 && limpo.startsWith("55")) {
    const sem55 = limpo.slice(2);
    return `(${sem55.slice(0, 2)}) ${sem55.slice(2, 6)}-${sem55.slice(6)}`;
  }
  if (limpo.length === 13 && limpo.startsWith("55")) {
    const sem55 = limpo.slice(2);
    return `(${sem55.slice(0, 2)}) ${sem55.slice(2, 7)}-${sem55.slice(7)}`;
  }
  return String(telefone).trim();
}

/**
 * Identificação e contato da cliente com botão rápido para copiar o telefone.
 */
export function htmlIdentificacao(o) {
  const partes = [];
  if (o.codCliente) {
    partes.push(`<span class="ident-item ident-cod">🆔 ${escaparHtml(String(o.codCliente))}</span>`);
  }
  if (o.telefone) {
    const telFormatado = formatarTelefoneExibicao(o.telefone);
    partes.push(`
      <button type="button" class="btn-copiar-tel" data-tel="${escaparHtml(o.telefone)}" data-tel-formatado="${escaparHtml(telFormatado)}" title="Clique para copiar o telefone (${escaparHtml(telFormatado)})">
        📱 ${escaparHtml(telFormatado)} <span class="copiar-tel-icon">📋</span>
      </button>
    `);
  }
  if (partes.length === 0) return "";
  return `<div class="vendas-card-identificacao">${partes.join("")}</div>`;
}

function seloEtapa(etapa) {
  if (!etapa) return "";
  if (etapa.atrasado) {
    return `<span class="vendas-etapa-tag vendas-etapa-atrasada">⏰ ${escaparHtml(etapa.titulo)} • atrasado</span>`;
  }
  if (etapa.futura) {
    return `<span class="vendas-etapa-tag vendas-etapa-futura">🕒 próximo toque em D+${etapa.dia}</span>`;
  }
  return `<span class="vendas-etapa-tag">📣 Toque ${etapa.indice + 1}/${etapa.total} • ${escaparHtml(etapa.titulo)}</span>`;
}

/**
 * @param {Object} o          orçamento já preparado por prepararOrcamentos()
 * @param {Object} opcoes
 * @param {Boolean} opcoes.contatado
 * @param {Boolean} opcoes.vemHoje  cliente está na agenda de hoje — maior chance de fechar
 */
export function htmlCardOrcamento(o, { contatado = false, vemHoje = false } = {}) {
  const cor = vemHoje ? "#15803d" : (COR_FILA[o.fila] || "#475569");
  const etapa = o.etapa;

  return `
    <div class="vendas-card ${contatado ? "vendas-card-feito" : ""} ${vemHoje ? "vendas-card-hoje" : ""}"
         style="border-left-color: ${cor};" data-id="${escaparHtml(o.idUnico)}">
      <div class="vendas-card-topo">
        <div class="vendas-card-cli">
          <strong class="vendas-card-nome">👤 ${escaparHtml(o.clienteNome)}</strong>
          ${htmlIdentificacao(o)}
          <span class="vendas-card-meta">
            Orçamento ${escaparHtml(String(o.codOrcamento))} • apresentado ${textoIdade(o.diasCorridos)}
            ${o.vendedora ? ` • 🧑‍💼 ${escaparHtml(o.vendedora)}` : ""}
          </span>
        </div>
        <span class="vendas-card-valor">${formatarReal(o.valorFinal)}</span>
      </div>

      ${vemHoje ? `<div class="vendas-selo-hoje">📅 Está na agenda de hoje${o.horarioHoje ? ` às ${escaparHtml(o.horarioHoje)}` : ""} — fale com ela na cadeira</div>` : ""}

      <div class="vendas-card-plano">
        💎 ${escaparHtml(o.nomePlano)}
        ${o.descontoPct > 0 ? `<span class="vendas-desc-tag">−${o.descontoPct}%</span>` : ""}
        ${o.temLink ? `<span class="vendas-link-tag" title="${escaparHtml(o.formaPagamento)}">🔗 link gerado</span>` : ""}
        ${o.vencido ? `<span class="vendas-venc-tag">⚠️ vencido</span>` : ""}
      </div>

      ${seloEtapa(etapa)}
      ${etapa && !etapa.futura ? `<div class="vendas-card-foco">🎯 ${escaparHtml(etapa.foco)}</div>` : ""}

      <div class="vendas-card-script">${escaparHtml(o.script)}</div>

      <div class="vendas-card-acoes">
        <button class="btn-vendas-copiar" data-script="${escaparHtml(o.script)}" title="Copiar script padrão da cadência">📋 Copiar</button>
        <button class="btn-vendas-ia" data-id="${escaparHtml(o.idUnico)}" title="Gerar mensagem sob medida com Inteligência Artificial">✨ Mensagem IA</button>
        <button class="btn-vendas-feito" data-id="${escaparHtml(o.idUnico)}">${contatado ? "✅ Contatada" : "☑️ Marcar feito"}</button>
      </div>
    </div>`;
}
