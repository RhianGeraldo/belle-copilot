/**
 * BELLE COPILOT - VIEW DO PAINEL COMERCIAL (CONSULTORA)
 * Gerencia o funil de oportunidades, aniversariantes, renovações de pacotes e busca de fichas/saldo.
 */

import { state } from '../core/state.js';
import { buscarSaldoVendaPlanoApi } from '../core/api-client.js';

const comercialQtdOportunidades = document.getElementById("comercial-qtd-oportunidades");
const comKpiRetaFinal = document.getElementById("com-kpi-reta-final");
const comKpiAniver = document.getElementById("com-kpi-aniver");
const comKpiCross = document.getElementById("com-kpi-cross");
const comBadgeTotalOpp = document.getElementById("com-badge-total-opp");
const inputBuscaSaldoComercial = document.getElementById("input-busca-saldo-comercial");
const btnBuscarSaldoComercial = document.getElementById("btn-buscar-saldo-comercial");
const loadingSaldoComercial = document.getElementById("loading-saldo-comercial");
const resultadoSaldoComercial = document.getElementById("resultado-saldo-comercial");
const listaOportunidadesComercial = document.getElementById("lista-oportunidades-comercial");

export function renderizarPainelComercial() {
  if (!listaOportunidadesComercial) return;

  const apps = Array.isArray(state.appointmentsData) ? state.appointmentsData.filter(a => !a.isBloqueado && a.status !== "bloqueado") : [];
  
  let retaFinalCount = 0;
  let aniverCount = 0;
  let crossCount = 0;
  let oppCardsHtml = "";

  apps.forEach((app) => {
    const isAniver = !!app.fazAniver;
    if (isAniver) aniverCount++;

    const procs = (app.arrServ && app.arrServ.length > 0) 
      ? app.arrServ.map(s => s.nome).join(", ") 
      : (app.procedimento || "Tratamento a Laser");

    let sFeitas = 0;
    let sTotal = 0;
    let sProgresso = "";
    if (app.lbServ) {
      const match = app.lbServ.match(/(\d+)\/(\d+)/);
      if (match) {
        sFeitas = parseInt(match[1], 10);
        sTotal = parseInt(match[2], 10);
        sProgresso = `Sessão ${sFeitas}/${sTotal}`;
      }
    }

    const pctConcluido = sTotal > 0 ? Math.round((sFeitas / sTotal) * 100) : 0;
    let oppTipo = "⭐ Oportunidade do Dia";
    let oppDesc = `Cliente agendada às <strong>${app.horario}</strong> com ${app.profissional}. Ofertar pacote de novas áreas a laser ou manutenção preventiva.`;
    let badgeColor = "#0284c7";

    if (isAniver) {
      oppTipo = "🎂 Aniversariante Especial";
      oppDesc = `Cliente faz aniversário hoje! Oferecer cortesia VIP de aplicação e voucher de 20% para fechar novo pacote.`;
      badgeColor = "#db2777";
    } else if (sFeitas >= 8 || pctConcluido >= 75) {
      retaFinalCount++;
      oppTipo = `💎 Reta Final (${sProgresso || '8ª+ sessão'})`;
      oppDesc = `Cliente na reta final do pacote (${sProgresso ? `<strong>${sProgresso}</strong>` : `${pctConcluido}% concluído`}). Momento ideal para ofertar o <strong>Plano de Manutenção Anual</strong> antes do término das sessões!`;
      badgeColor = "#b45309";
    } else if (sFeitas <= 3 && sTotal > 0) {
      crossCount++;
      oppTipo = `✨ Início (${sProgresso})`;
      oppDesc = `Cliente no início das sessões (<strong>${sProgresso}</strong>). Ofertar <strong>Clareamento a Laser</strong> ou kit Home Care de hidratação pós-laser.`;
      badgeColor = "#0284c7";
    } else {
      crossCount++;
      oppTipo = `🚀 Cross-sell (${sProgresso || 'Expansão'})`;
      oppDesc = `Cliente adaptada ao laser (${sProgresso ? `<strong>${sProgresso}</strong>` : 'Redução visível'}). Apresentar combo de novas regiões corporais (Virilha, Pernas ou Black Peel facial).`;
      badgeColor = "#16a34a";
    }

    const wppNum = (app.telefone || "").replace(/\D/g, "");
    const wppLink = wppNum ? `https://wa.me/55${wppNum}?text=${encodeURIComponent(`Olá ${app.clienteNome}! Tudo bem? Passando para confirmar seu horário hoje às ${app.horario} na clínica!`)}` : null;

    oppCardsHtml += `
      <div class="com-opp-card" style="border-left-color: ${badgeColor};">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
          <div>
            <strong style="font-size: 13px; color: #0f172a;">👤 ${app.clienteNome}</strong>
            <div style="font-size: 11px; color: #64748b;">⏰ ${app.horario} • 📍 ${app.salaNome}</div>
          </div>
          <span class="badge-count-pill" style="background: ${badgeColor}15; color: ${badgeColor}; font-weight: 800;">
            ${oppTipo}
          </span>
        </div>

        <p style="font-size: 11.5px; color: #334155; margin: 6px 0; line-height: 1.35;">
          ${oppDesc}
        </p>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding-top: 6px; border-top: 1px dashed #e2e8f0;">
          <span style="font-size: 11px; color: #475569;">Áreas: <strong>${procs}</strong></span>
          <div style="display: flex; gap: 6px;">
            ${wppLink ? `<a href="${wppLink}" target="_blank" class="btn-action-mini" style="text-decoration: none; color: #166534; font-size: 11px; background: #f0fdf4; border: 1px solid #bbf7d0;">💬 WhatsApp</a>` : ''}
            <button class="btn-action-mini btn-comercial-consultar-ficha" data-cod-cliente="${app.codCliente || ''}" data-nome-cliente="${app.clienteNome}" data-cod-orc="${app.codOrcamento || ''}" style="font-size: 11px;">🔍 Ver Ficha</button>
          </div>
        </div>
      </div>
    `;
  });

  if (comKpiRetaFinal) comKpiRetaFinal.textContent = retaFinalCount;
  if (comKpiAniver) comKpiAniver.textContent = aniverCount;
  if (comKpiCross) comKpiCross.textContent = crossCount;
  if (comBadgeTotalOpp) comBadgeTotalOpp.textContent = `${apps.length}`;
  if (comercialQtdOportunidades) comercialQtdOportunidades.textContent = `${apps.length} oportunidade${apps.length === 1 ? '' : 's'}`;

  listaOportunidadesComercial.innerHTML = oppCardsHtml || '<div style="font-size: 11px; color: #64748b; padding: 6px;">Nenhum agendamento encontrado para hoje.</div>';
}

export async function consultarFichaSaldoComercial(termoBusca) {
  if (!termoBusca || !resultadoSaldoComercial) return;
  
  if (loadingSaldoComercial) loadingSaldoComercial.style.display = "flex";
  resultadoSaldoComercial.style.display = "none";
  resultadoSaldoComercial.innerHTML = "";

  try {
    const matchApp = (state.appointmentsData || []).find(a => 
      (a.clienteNome && a.clienteNome.toLowerCase().includes(termoBusca.toLowerCase())) ||
      (a.telefone && a.telefone.includes(termoBusca)) ||
      (a.cpf && a.cpf.includes(termoBusca)) ||
      (a.codCliente && String(a.codCliente) === String(termoBusca))
    );

    let codOrc = matchApp?.codOrcamento || "";
    let codPlano = matchApp?.codPlano || "";
    let idGeinfo = matchApp?.idGeinfo || state.currentIdGeinfo || "";
    let nomeCliente = matchApp?.clienteNome || termoBusca;

    let saldoData = null;
    if (codOrc) {
      saldoData = await buscarSaldoVendaPlanoApi(state.currentToken, codOrc, codPlano, idGeinfo, state.currentCodEstab);
    }

    if (saldoData && Array.isArray(saldoData) && saldoData.length > 0) {
      let saldoHtml = `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px;">
          <div style="font-size: 12px; font-weight: 800; color: #0284c7; margin-bottom: 6px;">
            👤 ${nomeCliente} (Orçamento #${codOrc})
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
      `;
      saldoData.forEach(item => {
        const realizado = parseInt(item.realizadas || item.qtd_executada || 0, 10);
        const contratado = parseInt(item.contratadas || item.qtd_contratada || 10, 10);
        const saldo = parseInt(item.saldo || (contratado - realizado), 10);
        const pct = Math.min(100, Math.round((realizado / Math.max(1, contratado)) * 100));

        saldoHtml += `
          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 8px; font-size: 11px;">
            <div style="display: flex; justify-content: space-between; font-weight: 700;">
              <span>✨ ${item.servico || item.nome}</span>
              <span style="color: #16a34a;">Restam ${saldo} sessões</span>
            </div>
            <div style="width: 100%; height: 4px; background: #e2e8f0; border-radius: 2px; margin: 4px 0; overflow: hidden;">
              <div style="width: ${pct}%; height: 100%; background: #0284c7;"></div>
            </div>
            <div style="display: flex; justify-content: space-between; color: #64748b; font-size: 10px;">
              <span>Sessão ${realizado} de ${contratado}</span>
              <span>${pct}% concluído</span>
            </div>
          </div>
        `;
      });
      saldoHtml += `</div></div>`;
      resultadoSaldoComercial.innerHTML = saldoHtml;
      resultadoSaldoComercial.style.display = "block";
    } else {
      resultadoSaldoComercial.innerHTML = `
        <div style="background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 8px 10px; border-radius: 6px; font-size: 11.5px;">
          Nenhum pacote ativo encontrado para <strong>"${termoBusca}"</strong>.
        </div>
      `;
      resultadoSaldoComercial.style.display = "block";
    }
  } catch (err) {
    console.warn("Erro ao buscar saldo comercial:", err);
    resultadoSaldoComercial.innerHTML = `<div style="font-size: 11px; color: #dc2626;">Erro ao consultar ficha.</div>`;
    resultadoSaldoComercial.style.display = "block";
  } finally {
    if (loadingSaldoComercial) loadingSaldoComercial.style.display = "none";
  }
}

export function inicializarComercialView() {
  btnBuscarSaldoComercial?.addEventListener("click", () => {
    const termo = inputBuscaSaldoComercial?.value.trim();
    if (termo) consultarFichaSaldoComercial(termo);
  });

  inputBuscaSaldoComercial?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const termo = inputBuscaSaldoComercial.value.trim();
      if (termo) consultarFichaSaldoComercial(termo);
    }
  });

  listaOportunidadesComercial?.addEventListener("click", (e) => {
    const btnFicha = e.target.closest(".btn-comercial-consultar-ficha");
    if (btnFicha) {
      const codCli = btnFicha.getAttribute("data-cod-cliente");
      const nomeCli = btnFicha.getAttribute("data-nome-cliente");
      const codOrc = btnFicha.getAttribute("data-cod-orc");
      const termo = codOrc || codCli || nomeCli;
      if (inputBuscaSaldoComercial) inputBuscaSaldoComercial.value = termo;
      if (termo) consultarFichaSaldoComercial(termo);
    }
  });
}
