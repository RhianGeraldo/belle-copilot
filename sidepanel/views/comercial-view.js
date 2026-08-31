/**
 * BELLE COPILOT - VIEW DO PAINEL COMERCIAL (OPORTUNIDADES DO DIA)
 *
 * Cruza a agenda do dia com o saldo real dos planos para dizer à consultora o que
 * ofertar para cada cliente que vem hoje.
 *
 * O saldo vem do `saldovendaplano`, o MESMO endpoint usado na aba de Atendimento.
 * Antes as sessões eram extraídas do texto de `lbServ` com um regex `(\d+)/(\d+)`,
 * que pega o total do pacote inteiro (ex.: 15/40 somando quatro áreas) e mostrava
 * esse número como se fosse a sessão de cada área.
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

// Saldos já buscados nesta sessão, por orçamento. O api-client ainda mantém o próprio
// cache com TTL; este mapa evita repetir a chamada a cada re-render da agenda ao vivo.
const saldosPorOrcamento = new Map();
let buscandoSaldos = false;

function escaparHtml(txt = "") {
  return String(txt).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function chaveSaldo(app) {
  const orc = app?.codOrcamento || "";
  if (!orc) return "";
  return `${orc}_${app?.codPlano || ""}`;
}

/** Normaliza um item do saldovendaplano — mesmos campos usados na aba de Atendimento. */
function normalizarServicoSaldo(s) {
  const realizadas = parseInt(s.gasto ?? s.realizadas ?? s.qtd_executada ?? 0, 10) || 0;
  const contratadas = parseInt(s.quantidade ?? s.contratadas ?? s.qtd_contratada ?? 0, 10) || 0;
  const saldo = parseInt(s.saldo_atual ?? s.saldo ?? (contratadas - realizadas), 10);
  return {
    nome: s.servico || s.nome || s.nom_servico || "Área a Laser",
    cod: s.codServ || s.cod_servico || s.id || "",
    realizadas,
    contratadas,
    saldo: Number.isFinite(saldo) ? saldo : Math.max(0, contratadas - realizadas),
    pct: contratadas > 0 ? Math.min(100, Math.round((realizadas / contratadas) * 100)) : 0
  };
}

/** Progresso agregado do pacote, para classificar a oportunidade. */
function resumirSaldo(servicos) {
  const itens = servicos.map(normalizarServicoSaldo);
  const realizadas = itens.reduce((a, i) => a + i.realizadas, 0);
  const contratadas = itens.reduce((a, i) => a + i.contratadas, 0);
  const saldo = itens.reduce((a, i) => a + i.saldo, 0);
  return {
    itens,
    realizadas,
    contratadas,
    saldo,
    pct: contratadas > 0 ? Math.min(100, Math.round((realizadas / contratadas) * 100)) : 0
  };
}

function htmlBlocoSaldo(resumo) {
  if (!resumo || resumo.itens.length === 0) return "";

  const linhas = resumo.itens.map(i => `
    <div class="com-saldo-item">
      <div class="com-saldo-item-topo">
        <span class="com-saldo-nome">✨ ${escaparHtml(i.nome)}</span>
        <span class="com-saldo-sessao">${i.realizadas}/${i.contratadas}</span>
      </div>
      <div class="com-saldo-barra"><div class="com-saldo-barra-fill" style="width: ${i.pct}%;"></div></div>
      <div class="com-saldo-item-rodape">
        <span>${i.cod ? `Cód: ${escaparHtml(String(i.cod))}` : ""}</span>
        <span class="com-saldo-restam">Restam <strong>${i.saldo}</strong></span>
      </div>
    </div>`).join("");

  return `
    <div class="com-saldo-bloco">
      <div class="com-saldo-cabecalho">
        📊 Saldo do plano — <strong>${resumo.realizadas} de ${resumo.contratadas}</strong> sessões usadas
        <span class="com-saldo-total">${resumo.saldo} restantes</span>
      </div>
      ${linhas}
    </div>`;
}

export function renderizarPainelComercial() {
  if (!listaOportunidadesComercial) return;

  const apps = Array.isArray(state.appointmentsData)
    ? state.appointmentsData.filter(a => !a.isBloqueado && a.status !== "bloqueado")
    : [];

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

    const chave = chaveSaldo(app);
    const saldoBruto = chave ? saldosPorOrcamento.get(chave) : null;
    const resumo = Array.isArray(saldoBruto) && saldoBruto.length > 0 ? resumirSaldo(saldoBruto) : null;

    // A classificação usa o saldo real quando ele já chegou. Sem plano vinculado ou
    // enquanto o saldo carrega, a oportunidade fica como genérica do dia.
    const temProgresso = Boolean(resumo && resumo.contratadas > 0);
    const pctConcluido = temProgresso ? resumo.pct : 0;
    const sProgresso = temProgresso ? `${resumo.realizadas}/${resumo.contratadas} sessões` : "";

    let oppTipo = "⭐ Oportunidade do Dia";
    let oppDesc = `Cliente agendada às <strong>${escaparHtml(app.horario)}</strong> com ${escaparHtml(app.profissional)}. Ofertar pacote de novas áreas a laser ou manutenção preventiva.`;
    let badgeColor = "#0284c7";

    if (isAniver) {
      oppTipo = "🎂 Aniversariante Especial";
      oppDesc = "Cliente faz aniversário hoje! Oferecer cortesia VIP de aplicação e voucher de 20% para fechar novo pacote.";
      badgeColor = "#db2777";
    } else if (temProgresso && pctConcluido >= 75) {
      retaFinalCount++;
      oppTipo = `💎 Reta Final (${sProgresso})`;
      oppDesc = `Cliente na reta final do pacote (<strong>${pctConcluido}% concluído</strong>, restam ${resumo.saldo} sessões). Momento ideal para ofertar o <strong>Plano de Manutenção Anual</strong> antes do término!`;
      badgeColor = "#b45309";
    } else if (temProgresso && pctConcluido <= 30) {
      crossCount++;
      oppTipo = `✨ Início (${sProgresso})`;
      oppDesc = `Cliente no início das sessões (<strong>${pctConcluido}% concluído</strong>). Ofertar <strong>Clareamento a Laser</strong> ou kit Home Care de hidratação pós-laser.`;
      badgeColor = "#0284c7";
    } else if (temProgresso) {
      crossCount++;
      oppTipo = `🚀 Cross-sell (${sProgresso})`;
      oppDesc = `Cliente adaptada ao laser (<strong>${pctConcluido}% concluído</strong>). Apresentar combo de novas regiões corporais (Virilha, Pernas ou Black Peel facial).`;
      badgeColor = "#16a34a";
    }

    const blocoSaldo = resumo
      ? htmlBlocoSaldo(resumo)
      : (chave
          ? `<div class="com-saldo-carregando">⏳ Carregando saldo do plano...</div>`
          : `<div class="com-saldo-vazio">Sem plano de sessões vinculado a este agendamento.</div>`);

    oppCardsHtml += `
      <div class="com-opp-card" style="border-left-color: ${badgeColor};">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
          <div>
            <strong style="font-size: 13px; color: #0f172a;">👤 ${escaparHtml(app.clienteNome)}</strong>
            <div style="font-size: 11px; color: #64748b;">⏰ ${escaparHtml(app.horario)} • 📍 ${escaparHtml(app.salaNome)}</div>
          </div>
          <span class="badge-count-pill" style="background: ${badgeColor}15; color: ${badgeColor}; font-weight: 800;">
            ${oppTipo}
          </span>
        </div>

        <p style="font-size: 11.5px; color: #334155; margin: 6px 0; line-height: 1.35;">
          ${oppDesc}
        </p>

        ${blocoSaldo}

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px; padding-top: 6px; border-top: 1px dashed #e2e8f0;">
          <span style="font-size: 11px; color: #475569;">Áreas: <strong>${escaparHtml(procs)}</strong></span>
          <button class="btn-action-mini btn-comercial-consultar-ficha" data-app-id="${escaparHtml(String(app.id))}" style="font-size: 11px;">🔍 Ver Ficha</button>
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

  carregarSaldosDosCards(apps);
}

/**
 * Busca o saldo dos planos que ainda não temos, em paralelo e em lotes pequenos,
 * e re-renderiza uma única vez quando os dados chegam.
 */
async function carregarSaldosDosCards(apps) {
  if (buscandoSaldos) return;

  const pendentes = apps.filter(a => {
    const c = chaveSaldo(a);
    return c && !saldosPorOrcamento.has(c);
  });
  if (pendentes.length === 0) return;

  buscandoSaldos = true;
  let algumChegou = false;

  try {
    const LOTE = 5; // não dispara dezenas de requisições de uma vez
    for (let i = 0; i < pendentes.length; i += LOTE) {
      const lote = pendentes.slice(i, i + LOTE);
      await Promise.all(lote.map(async (app) => {
        const chave = chaveSaldo(app);
        try {
          const saldo = await buscarSaldoVendaPlanoApi(
            state.currentToken, app.codOrcamento, app.codPlano,
            app.idGeinfo || state.currentIdGeinfo, state.currentCodEstab
          );
          // Grava mesmo vindo vazio: evita repetir a consulta a cada re-render.
          saldosPorOrcamento.set(chave, Array.isArray(saldo) ? saldo : []);
          if (Array.isArray(saldo) && saldo.length > 0) algumChegou = true;
        } catch (e) {
          saldosPorOrcamento.set(chave, []);
        }
      }));
    }
  } finally {
    buscandoSaldos = false;
  }

  if (algumChegou) renderizarPainelComercial();
}

/** Ficha detalhada a partir de um agendamento já conhecido. */
export async function consultarFichaPorApp(app) {
  if (!app || !resultadoSaldoComercial) return;

  if (inputBuscaSaldoComercial) inputBuscaSaldoComercial.value = app.clienteNome || "";
  if (loadingSaldoComercial) loadingSaldoComercial.style.display = "flex";
  resultadoSaldoComercial.style.display = "none";
  resultadoSaldoComercial.innerHTML = "";

  try {
    if (!app.codOrcamento) {
      resultadoSaldoComercial.innerHTML = `
        <div class="com-ficha-aviso">
          <strong>${escaparHtml(app.clienteNome || "Cliente")}</strong> não tem plano de sessões vinculado a este agendamento,
          então não há saldo para consultar.
        </div>`;
      resultadoSaldoComercial.style.display = "block";
      return;
    }

    const saldo = await buscarSaldoVendaPlanoApi(
      state.currentToken, app.codOrcamento, app.codPlano,
      app.idGeinfo || state.currentIdGeinfo, state.currentCodEstab
    );

    if (Array.isArray(saldo) && saldo.length > 0) {
      saldosPorOrcamento.set(chaveSaldo(app), saldo);
      const resumo = resumirSaldo(saldo);
      resultadoSaldoComercial.innerHTML = `
        <div class="com-ficha-box">
          <div class="com-ficha-titulo">
            👤 ${escaparHtml(app.clienteNome)}
            <span class="com-ficha-sub">Orçamento ${escaparHtml(String(app.codOrcamento))}${app.nomePlano ? ` • ${escaparHtml(app.nomePlano)}` : ""}</span>
          </div>
          ${htmlBlocoSaldo(resumo)}
        </div>`;
    } else {
      resultadoSaldoComercial.innerHTML = `
        <div class="com-ficha-aviso">
          Nenhum saldo retornado para o orçamento <strong>${escaparHtml(String(app.codOrcamento))}</strong>
          de ${escaparHtml(app.clienteNome || "cliente")}. O plano pode estar encerrado ou sem sessões contratadas.
        </div>`;
    }
    resultadoSaldoComercial.style.display = "block";
  } catch (err) {
    console.warn("[Comercial] Erro ao consultar ficha:", err);
    resultadoSaldoComercial.innerHTML = `<div class="com-ficha-aviso">Erro ao consultar a ficha. Verifique a conexão.</div>`;
    resultadoSaldoComercial.style.display = "block";
  } finally {
    if (loadingSaldoComercial) loadingSaldoComercial.style.display = "none";
  }
}

/** Busca manual: aceita nome, telefone, CPF, código da cliente e código do orçamento. */
export async function consultarFichaSaldoComercial(termoBusca) {
  const termo = String(termoBusca || "").trim();
  if (!termo || !resultadoSaldoComercial) return;

  const alvo = termo.toLowerCase();
  const app = (state.appointmentsData || []).find(a =>
    (a.clienteNome && a.clienteNome.toLowerCase().includes(alvo)) ||
    (a.telefone && a.telefone.includes(termo)) ||
    (a.cpf && a.cpf.includes(termo)) ||
    (a.codCliente && String(a.codCliente) === termo) ||
    // O botão "Ver Ficha" preenchia a busca com o código do orçamento, que não era
    // procurado aqui — daí o "não encontrado" mesmo com o número certo na tela.
    (a.codOrcamento && String(a.codOrcamento) === termo)
  );

  if (!app) {
    resultadoSaldoComercial.innerHTML = `
      <div class="com-ficha-aviso">
        Nenhuma cliente da agenda de hoje corresponde a <strong>"${escaparHtml(termo)}"</strong>.
        A consulta de saldo usa os agendamentos do dia carregados no painel.
      </div>`;
    resultadoSaldoComercial.style.display = "block";
    return;
  }

  await consultarFichaPorApp(app);
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
    if (!btnFicha) return;

    // Vai direto pelo agendamento clicado, sem passar por busca textual.
    const appId = btnFicha.getAttribute("data-app-id");
    const app = (state.appointmentsData || []).find(a => String(a.id) === String(appId));
    if (app) consultarFichaPorApp(app);
  });
}
