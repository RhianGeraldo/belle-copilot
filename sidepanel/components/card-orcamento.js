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
        <button class="btn-vendas-copiar" data-script="${escaparHtml(o.script)}">📋 Copiar</button>
        <button class="btn-vendas-feito" data-id="${escaparHtml(o.idUnico)}">${contatado ? "✅ Contatada" : "☑️ Marcar feito"}</button>
      </div>
    </div>`;
}
