/**
 * BELLE COPILOT - CONSULTA DE FICHA / SALDO (MÓDULO COMERCIAL)
 *
 * O módulo Comercial tem uma aba só: Vendas & Resgate. O antigo painel de
 * "Oportunidades do Dia" saiu daqui — orçamento quente é trabalho da aplicadora,
 * na aba 💰 Oportunidades do módulo Agenda.
 *
 * O que restou é a consulta de ficha: dado um nome, telefone, CPF, código da cliente
 * ou do orçamento, mostra o saldo real do plano vindo do `saldovendaplano` — o mesmo
 * endpoint da aba de Atendimento.
 */

import { state } from '../core/state.js';
import { buscarSaldoVendaPlanoApi } from '../core/api-client.js';

const inputBuscaSaldoComercial = document.getElementById("input-busca-saldo-comercial");
const btnBuscarSaldoComercial = document.getElementById("btn-buscar-saldo-comercial");
const loadingSaldoComercial = document.getElementById("loading-saldo-comercial");
const resultadoSaldoComercial = document.getElementById("resultado-saldo-comercial");

const saldosPorOrcamento = new Map();

function escaparHtml(txt = "") {
  return String(txt).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function chaveSaldo(app) {
  const orc = app?.codOrcamento || "";
  return orc ? `${orc}_${app?.codPlano || ""}` : "";
}

/** Campos do saldovendaplano — os mesmos usados na aba de Atendimento. */
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

function resumirSaldo(servicos) {
  const itens = servicos.map(normalizarServicoSaldo);
  const realizadas = itens.reduce((a, i) => a + i.realizadas, 0);
  const contratadas = itens.reduce((a, i) => a + i.contratadas, 0);
  return {
    itens,
    realizadas,
    contratadas,
    saldo: itens.reduce((a, i) => a + i.saldo, 0),
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

/** Ficha a partir de um agendamento já conhecido. */
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
      resultadoSaldoComercial.innerHTML = `
        <div class="com-ficha-box">
          <div class="com-ficha-titulo">
            👤 ${escaparHtml(app.clienteNome)}
            <span class="com-ficha-sub">Orçamento ${escaparHtml(String(app.codOrcamento))}${app.nomePlano ? ` • ${escaparHtml(app.nomePlano)}` : ""}</span>
          </div>
          ${htmlBlocoSaldo(resumirSaldo(saldo))}
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

/** Busca manual: nome, telefone, CPF, código da cliente ou código do orçamento. */
export async function consultarFichaSaldoComercial(termoBusca) {
  const termo = String(termoBusca || "").trim();
  if (!termo || !resultadoSaldoComercial) return;

  const alvo = termo.toLowerCase();
  const app = (state.appointmentsData || []).find(a =>
    (a.clienteNome && a.clienteNome.toLowerCase().includes(alvo)) ||
    (a.telefone && a.telefone.includes(termo)) ||
    (a.cpf && a.cpf.includes(termo)) ||
    (a.codCliente && String(a.codCliente) === termo) ||
    (a.codOrcamento && String(a.codOrcamento) === termo)
  );

  if (!app) {
    resultadoSaldoComercial.innerHTML = `
      <div class="com-ficha-aviso">
        Nenhuma cliente da agenda de hoje corresponde a <strong>${escaparHtml(termo)}</strong>.
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
}
