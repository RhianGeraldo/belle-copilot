/**
 * BELLE COPILOT - VIEW DE ATENDIMENTO CLÍNICO (APLICADORA / LASER)
 * Gerencia a ficha clínica da cliente, histórico de parâmetros, formulários com steppers e fluxo de finalização.
 */

import { state, limparCachesAtendimento, clientesPacotesCache, clientesSaldosCache } from '../core/state.js';
import { 
  buscarGetServicosApi, 
  buscarParametrosLaserApi, 
  buscarVendasPlanosClienteApi,
  buscarSaldoVendaPlanoApi, 
  salvarParametrosLaserEmLoteApi, 
  atualizarServicosAgendamentoApi,
  finalizarAtendimentoApi,
  normalizarNomeAreaParaMatch 
} from '../core/api-client.js';
import { atualizarOfertasSugeridasAtendimento } from '../engines/cadencia-ofertas.js';
import { buscarDadosClienteApi } from '../core/api-client.js';
import { lerPerfilCliente, gravarPerfilCliente } from '../core/cache-persistente.js';
import { normalizarSexo } from '../engines/catalogo-areas.js';
import { 
  extrairParametrosAnterioresDaArea, 
  extrairSubzonasHistorico,
  coletarParametrosDosFormularios, 
  verificarEvolucaoParametros,
  verificarParametrosObrigatorios,
  isRegistroDeHoje,
  normalizarDataParaIso 
} from '../engines/laser-safety.js';
import { abrirModalTravaEvolucao } from '../components/modal-trava.js';
import { abrirModalProximoAgendamento } from '../components/modal-proximo.js';
import { registrarSaldoCapturado, ehAgendamentoAvaliacao } from './agenda-view.js';

const atendimentoPlaceholder = document.getElementById("atendimento-placeholder");
const atendimentoContent = document.getElementById("atendimento-content");
const atendHorario = document.getElementById("atend-horario");
const atendStatusBadge = document.getElementById("atend-status-badge");
const atendNomeCliente = document.getElementById("atend-nome-cliente");
const atendCodPaciente = document.getElementById("atend-cod-paciente");
const atendCpf = document.getElementById("atend-cpf");
const atendTelefone = document.getElementById("atend-telefone");
const atendSala = document.getElementById("atend-sala");
const atendProfissional = document.getElementById("atend-profissional");
const atendCodConsulta = document.getElementById("atend-cod-consulta");
const atendTagsBox = document.getElementById("atend-tags-box");
const atendCardPacote = document.getElementById("atend-card-pacote");
const atendMultiAppBox = document.getElementById("atend-multi-app-box");
const atendMultiQtd = document.getElementById("atend-multi-qtd");
const atendMultiButtons = document.getElementById("atend-multi-buttons");
const atendNomePlano = document.getElementById("atend-nome-plano");
const atendCodOrcamento = document.getElementById("atend-cod-orcamento");
const atendQtdServicos = document.getElementById("atend-qtd-servicos");
const atendListaServicos = document.getElementById("atend-lista-servicos");
const atendCardParametros = document.getElementById("atend-card-parametros");
const atendLaserDataBadge = document.getElementById("atend-laser-data-badge");
const loadingLaserParams = document.getElementById("loading-laser-params");
const atendListaLaserParams = document.getElementById("atend-lista-laser-params");
const atendQtdAreasRegistro = document.getElementById("atend-qtd-areas-registro");
const atendListaFormsLaser = document.getElementById("atend-lista-forms-laser");
const btnSalvarParametrosLaser = document.getElementById("btn-salvar-parametros-laser");
const atendStatusSalvarLaser = document.getElementById("atend-status-salvar-laser");
const btnAtendFinalizar = document.getElementById("btn-atend-finalizar");
const btnAtendVoltar = document.getElementById("btn-atend-voltar");

let callbackAtivarAba = null;
let callbackRecarregarAgenda = null;
let parametrosJaSalvosNesteAtendimento = false;
let finalizacaoEmAndamento = false;

export { normalizarDataParaIso, isRegistroDeHoje };

export function obterDataHojeIso() {
  const d = new Date();
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  const localHoje = `${ano}-${mes}-${dia}`;
  const agendaIso = normalizarDataParaIso(state.currentDataAgenda);
  return agendaIso || localHoje;
}

export function verificarSeParametrosForamSalvos(app = null) {
  if (parametrosJaSalvosNesteAtendimento) return true;

  const appAlvo = app || state.selectedAppointment;
  const registros = state.ultimosRegistrosLaserCliente || [];
  const registrosHoje = registros.filter(r => isRegistroDeHoje(r, appAlvo));

  return registrosHoje.length > 0;
}

export function checarEAtualizarUIParametrosSalvos(app = null) {
  const appAlvo = app || state.selectedAppointment;
  const jaSalvo = verificarSeParametrosForamSalvos(appAlvo);
  if (btnSalvarParametrosLaser) {
    btnSalvarParametrosLaser.style.display = "none";
  }
  if (jaSalvo) {
    parametrosJaSalvosNesteAtendimento = true;
    if (atendStatusSalvarLaser) {
      atendStatusSalvarLaser.style.display = "block";
      atendStatusSalvarLaser.className = "param-save-status status-success";
      const regsHoje = (state.ultimosRegistrosLaserCliente || []).filter(r => isRegistroDeHoje(r, appAlvo));
      atendStatusSalvarLaser.textContent = regsHoje.length > 0
        ? `✓ Parâmetros de laser já registrados hoje no prontuário (${regsHoje.length} registro(s)).`
        : "✓ Parâmetros de laser já registrados hoje no prontuário.";
    }
  } else {
    if (atendStatusSalvarLaser) {
      atendStatusSalvarLaser.style.display = "none";
      atendStatusSalvarLaser.textContent = "";
    }
  }
  return jaSalvo;
}

/**
 * Sexo da cliente, para não sugerir área de outro gênero.
 * Uma requisição por cliente, guardada por 30 dias — sexo não muda. Só é feita aqui,
 * na ficha aberta; nas listas do Comercial a dedução por áreas resolve sem custo.
 */
async function obterSexoCliente(codCliente) {
  if (!codCliente) return null;

  const unidade = state.currentCodEstab || "";
  try {
    const emCache = await lerPerfilCliente(unidade, codCliente);
    if (emCache && emCache.sexo !== undefined) return emCache.sexo;
  } catch (e) {}

  const dados = await buscarDadosClienteApi(state.currentToken, codCliente);
  const sexo = normalizarSexo(dados?.sexo);

  try {
    await gravarPerfilCliente(unidade, codCliente, {
      sexo,
      nome: dados?.nome || "",
      nascimento: dados?.dat_nas || "",
      idade: dados?.idade ?? null
    });
  } catch (e) {}

  return sexo;
}

/** Recalcula o card de ofertas já com o sexo da cliente resolvido. */
async function atualizarOfertasComSexo(app, saldoServicos, historicoLaser) {
  if (!app) return;
  // Se o sexo já estiver em cache, usa direto; senão busca antes para não duplicar chamadas à IA
  let sexo = null;
  try {
    sexo = await obterSexoCliente(app.codCliente);
  } catch (e) {}

  if (state.selectedAppointment?.codCliente === app.codCliente) {
    atualizarOfertasSugeridasAtendimento(app, saldoServicos, historicoLaser, sexo);
  }
}

function formatarDataPtBr(dataIso) {
  if (!dataIso) return "";
  const parts = dataIso.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dataIso;
}

export function renderizarMultiplosAgendamentosHoje(appAtual) {
  if (atendMultiAppBox) {
    atendMultiAppBox.style.display = "none";
  }
}

/**
 * Localiza o saldo correspondente de um serviço agendado hoje dentro do array retornado por saldovendaplano.
 */
function encontrarSaldoDoServico(servicoAgendado, listaSaldo) {
  if (!Array.isArray(listaSaldo) || listaSaldo.length === 0) return null;

  const codHoje = String(servicoAgendado.cod_servico || servicoAgendado.codServ || "").trim();
  const nomeHoje = String(servicoAgendado.nome || servicoAgendado.nom_servico || servicoAgendado.procedimento || "").toLowerCase().trim();

  // 1. Match por código do serviço se ambos tiverem
  if (codHoje) {
    const matchCod = listaSaldo.find(s => {
      const sCod = String(s.codServ || s.cod_servico || s.id || "").trim();
      return sCod && sCod === codHoje;
    });
    if (matchCod) return matchCod;
  }

  // 2. Match por igualdade de nome ou inclusão direta
  const matchNome = listaSaldo.find(s => {
    const sNome = String(s.servico || s.nome || s.nom_servico || "").toLowerCase().trim();
    if (!sNome) return false;
    return sNome === nomeHoje || nomeHoje.includes(sNome) || sNome.includes(nomeHoje);
  });
  if (matchNome) return matchNome;

  // 3. Match por palavras-chave anatômicas (ex: axilas, virilha, perna, buço, barba, costas)
  const palavrasHoje = nomeHoje
    .replace(/\b(depilação|depilacao|a|laser|feminina|masculina|sessao|sessões|completa|área|area|corpo|pacote)\b/gi, "")
    .trim()
    .split(/[\s\-\(\)\/\+]+/)
    .filter(p => p.length >= 3);

  if (palavrasHoje.length > 0) {
    const matchPalavras = listaSaldo.find(s => {
      const sNome = String(s.servico || s.nome || s.nom_servico || "").toLowerCase();
      return palavrasHoje.some(palavra => sNome.includes(palavra));
    });
    if (matchPalavras) return matchPalavras;
  }

  return null;
}

function gerarCardServicoHtml({ cod, nome, realizadas, contratadas, pct, temSaldo }) {
  const codLimpo = (cod && String(cod).trim() && !String(cod).toLowerCase().startsWith("área"))
    ? String(cod).replace(/^cód:\s*/i, "").trim()
    : "";
  const nomeLimpo = nome || "Procedimento";
  const displayTitle = codLimpo ? `${codLimpo} - ${nomeLimpo}` : nomeLimpo;

  const qtdContratadas = Number(contratadas) || 0;
  const qtdRealizadas = Number(realizadas) || 0;

  let progressoHtml = "";
  if (temSaldo && qtdContratadas > 0) {
    if (qtdContratadas <= 15) {
      let larguraFill = 0;
      if (qtdContratadas === 1) {
        larguraFill = qtdRealizadas >= 1 ? 100 : 0;
      } else if (qtdRealizadas >= qtdContratadas) {
        larguraFill = 100;
      } else if (qtdRealizadas > 0) {
        larguraFill = Math.round(((qtdRealizadas - 1) / (qtdContratadas - 1)) * 100);
      }

      let dotsItems = "";
      for (let i = 1; i <= qtdContratadas; i++) {
        const isDone = i <= qtdRealizadas;
        const isCurrent = i === qtdRealizadas;
        const dotClass = isDone ? (isCurrent ? "stepper-dot dot-done dot-current" : "stepper-dot dot-done") : "stepper-dot dot-empty";
        const dotTitle = isDone ? (isCurrent ? `Sessão ${i} (Hoje)` : `Sessão ${i} (Concluída)`) : `Sessão ${i} (Pendente)`;
        dotsItems += `<span class="${dotClass}" title="${dotTitle}"></span>`;
      }

      progressoHtml = `
        <div class="atend-session-stepper" title="${qtdRealizadas} de ${qtdContratadas} sessões realizadas (${pct}%)">
          <div class="atend-stepper-track">
            <div class="atend-stepper-fill" style="width: ${larguraFill}%;"></div>
          </div>
          <div class="atend-stepper-dots">
            ${dotsItems}
          </div>
        </div>
      `;
    } else {
      progressoHtml = `
        <div class="atend-session-bar-wrap" title="${qtdRealizadas} de ${qtdContratadas} sessões (${pct}%)">
          <div class="atend-session-bar-fill" style="width: ${pct}%;"></div>
        </div>
      `;
    }
  }

  return `
    <div class="atend-service-card">
      <div class="atend-service-header">
        <div class="atend-service-title" title="${displayTitle}">
          ${codLimpo ? `<span class="atend-service-cod">${codLimpo}</span><span class="atend-service-sep"> - </span>` : ''}<span class="atend-service-name">${nomeLimpo}</span>
        </div>
        ${temSaldo && qtdContratadas > 0 ? `
          <span class="atend-service-progress">Sessão ${qtdRealizadas}/${qtdContratadas}</span>
        ` : ''}
      </div>
      ${progressoHtml}
    </div>
  `;
}

export function renderizarServicosComSaldo(servicosSaldo) {
  if (!atendListaServicos) return;

  state.lastSaldoServicosCache = Array.isArray(servicosSaldo) ? servicosSaldo : [];

  // REGRA CLÍNICA: Exibe ESTRITAMENTE as áreas agendadas para a consulta de hoje.
  // Nunca deve exibir todas as áreas do plano/pacote da cliente (pois ela pode já ter terminado alguma ou não estar agendada hoje).
  const servicosHoje = (Array.isArray(state.currentServicosAgendadosHoje) && state.currentServicosAgendadosHoje.length > 0)
    ? state.currentServicosAgendadosHoje
    : ((state.selectedAppointment?.arrServ && state.selectedAppointment.arrServ.length > 0)
        ? state.selectedAppointment.arrServ
        : (state.selectedAppointment?.procedimento ? [{ nome: state.selectedAppointment.procedimento, cod_servico: state.selectedAppointment.codTipo }] : []));

  if (servicosHoje.length === 0) {
    atendListaServicos.innerHTML = '<div style="font-size: 12px; color: #64748b; padding: 8px;">Nenhum procedimento agendado para hoje.</div>';
    if (atendQtdServicos) atendQtdServicos.textContent = "0 áreas";
    return;
  }

  if (atendQtdServicos) {
    atendQtdServicos.textContent = `${servicosHoje.length} área${servicosHoje.length === 1 ? '' : 's'}`;
  }

  let html = "";
  servicosHoje.forEach((sHoje, idx) => {
    const sNome = sHoje.nome || sHoje.nom_servico || sHoje.procedimento || `Área #${idx + 1}`;

    // Procura o saldo correspondente desta área no pacote retornado pela API
    const saldoItem = encontrarSaldoDoServico(sHoje, servicosSaldo);
    const sCod = sHoje.cod_servico || sHoje.codServ || (saldoItem ? (saldoItem.cod_servico || saldoItem.codServ) : "");

    let realizadas = 0;
    let contratadas = 0;
    let pct = 0;
    let temSaldoInfo = false;

    if (saldoItem) {
      realizadas = parseInt(saldoItem.gasto || saldoItem.realizadas || saldoItem.qtd_executada || 0, 10);
      contratadas = parseInt(saldoItem.quantidade || saldoItem.contratadas || saldoItem.qtd_contratada || 10, 10);
      pct = Math.min(100, Math.round((realizadas / Math.max(1, contratadas)) * 100));
      temSaldoInfo = true;
    } else {
      // Fallback para lbServ se houver (ex: "AXILAS - 5/10")
      if (state.selectedAppointment?.lbServ) {
        const linhas = state.selectedAppointment.lbServ.split("<br>").map(l => l.trim()).filter(Boolean);
        for (const l of linhas) {
          const match = l.match(/(.+?)\s*-\s*(\d+)\/(\d+)/);
          if (match && (sNome.toLowerCase().includes(match[1].toLowerCase().trim()) || match[1].toLowerCase().includes(sNome.toLowerCase().substring(0, 8)))) {
            realizadas = parseInt(match[2], 10) || 0;
            contratadas = parseInt(match[3], 10) || 0;
            pct = Math.min(100, Math.round((realizadas / Math.max(1, contratadas)) * 100));
            temSaldoInfo = true;
            break;
          }
        }
      }
    }

    html += gerarCardServicoHtml({
      cod: sCod,
      nome: sNome,
      realizadas,
      contratadas,
      pct,
      temSaldo: temSaldoInfo
    });
  });

  atendListaServicos.innerHTML = html;

  // Atualiza também os formulários de registro de parâmetros estritamente se ainda não houver nenhum na tela
  const jaTemForms = atendListaFormsLaser && atendListaFormsLaser.querySelectorAll(".atend-param-form-card").length > 0;
  if (!jaTemForms) {
    renderizarFormulariosParametrosLaser(servicosHoje, state.ultimosRegistrosLaserCliente);
  }

  if (state.selectedAppointment) {
    atualizarOfertasComSexo(state.selectedAppointment, servicosSaldo, state.ultimosRegistrosLaserCliente);
  }
}

export function alternarToggleParametros(forcarEstado = null) {
  const card = document.getElementById("atend-card-parametros");
  const header = document.getElementById("atend-toggle-parametros");
  if (!card) return;

  const deveFechar = forcarEstado !== null ? !forcarEstado : !card.classList.contains("is-collapsed");

  if (deveFechar) {
    card.classList.add("is-collapsed");
    header?.setAttribute("aria-expanded", "false");
    header?.setAttribute("title", "Clique para abrir o histórico de parâmetros");
  } else {
    card.classList.remove("is-collapsed");
    header?.setAttribute("aria-expanded", "true");
    header?.setAttribute("title", "Clique para fechar o histórico de parâmetros");
  }
}

function gerarCardLaserHtml(r, exibirData = false) {
  const partsDataHora = (r.data_hora || "").split(" ");
  const dataIso = partsDataHora[0] || "";
  const hora = partsDataHora[1]?.substring(0, 5) || "";
  const dataPt = dataIso ? formatarDataPtBr(dataIso) : "";

  let tagsHtml = "";
  if (r.fototipo) tagsHtml += `<span class="laser-tag laser-tag-fototipo">Fototipo: ${r.fototipo}</span>`;
  if (r.modo_aplicacao) tagsHtml += `<span class="laser-tag laser-tag-modo">Modo: ${r.modo_aplicacao}</span>`;
  if (r.energia) tagsHtml += `<span class="laser-tag">Energia: ${r.energia}</span>`;
  if (r.frequencia) tagsHtml += `<span class="laser-tag">Freq: ${r.frequencia}</span>`;
  if (r.largura_pulso) tagsHtml += `<span class="laser-tag">Pulso: ${r.largura_pulso}</span>`;
  if (r.qtd_disparos) tagsHtml += `<span class="laser-tag">Disparos: ${r.qtd_disparos}</span>`;

  return `
    <div class="atend-laser-card">
      <div class="atend-laser-header">
        <span class="atend-laser-area">⚡ ${r.area || 'Área Geral'}</span>
        <div class="atend-laser-time-wrap">
          ${exibirData && dataPt ? `<span class="atend-laser-date">📅 ${dataPt}</span>` : ''}
          ${hora ? `<span class="atend-laser-time">⏰ ${hora}</span>` : ''}
        </div>
      </div>
      ${r.profissional ? `<div class="atend-laser-prof">👩‍⚕️ Aplicado por: <strong>${r.profissional}</strong></div>` : ''}
      ${tagsHtml ? `<div class="atend-laser-tags">${tagsHtml}</div>` : ''}
      ${r.observacao ? `<div class="atend-laser-obs">${r.observacao}</div>` : '<div style="font-size:11px; color:#94a3b8; font-style:italic;">Sem observações adicionais.</div>'}
    </div>
  `;
}

export function renderizarParametrosLaser(registros) {
  if (!atendListaLaserParams) return;
  if (loadingLaserParams) loadingLaserParams.style.display = "none";

  state.ultimosRegistrosLaserCliente = Array.isArray(registros) ? registros : [];

  // Atualiza imediatamente o status e botão de parâmetros salvos hoje
  checarEAtualizarUIParametrosSalvos(state.selectedAppointment);

  if (!Array.isArray(registros) || registros.length === 0) {
    if (atendLaserDataBadge) atendLaserDataBadge.textContent = "Sem registros";
    atendListaLaserParams.innerHTML = '<div style="font-size: 11px; color: #64748b; padding: 6px;">Nenhum parâmetro de laser anterior registrado para esta cliente.</div>';
    renderizarFormulariosParametrosLaser(state.currentListaServicosRegistro, []);
    return;
  }

  const hojeIso = obterDataHojeIso();
  const primeiraDataHora = registros[0].data_hora || registros[0].data;
  const diaRecente = primeiraDataHora ? primeiraDataHora.split(" ")[0] : "";
  const diaRecenteIso = normalizarDataParaIso(diaRecente);
  const registrosUltimoDia = diaRecenteIso ? registros.filter(r => {
    const dIso = normalizarDataParaIso(r.data_hora || r.data);
    return dIso && dIso === diaRecenteIso;
  }) : [registros[0]];

  if (atendLaserDataBadge && diaRecente) {
    const rotuloData = (diaRecenteIso === hojeIso) ? `Hoje (${formatarDataPtBr(diaRecente)})` : formatarDataPtBr(diaRecente);
    atendLaserDataBadge.textContent = `Última Sessão: ${rotuloData}`;
  }

  let cardsHtml = "";
  registrosUltimoDia.forEach(r => {
    cardsHtml += gerarCardLaserHtml(r, false);
  });

  // Se houver registros de outras sessões anteriores no prontuário, permite expandi-los
  const idsJaExibidos = new Set(registrosUltimoDia.map(r => r.id));
  const registrosOutrasSessoes = registros.filter(r => !idsJaExibidos.has(r.id));

  if (registrosOutrasSessoes.length > 0) {
    cardsHtml += `
      <div class="sessoes-anteriores-wrapper" style="margin-top: 10px;">
        <button type="button" class="btn-toggle-anteriores" id="btn-toggle-laser-anteriores">
          <span>📜 Ver sessões anteriores (${registrosOutrasSessoes.length})</span>
          <span class="chevron-anteriores">▾</span>
        </button>
        <div id="container-laser-anteriores" class="sessoes-anteriores-container" style="display: none;">
          ${registrosOutrasSessoes.map(r => gerarCardLaserHtml(r, true)).join("")}
        </div>
      </div>
    `;
  }

  atendListaLaserParams.innerHTML = cardsHtml;

  // Listener para o botão de expansão de sessões anteriores
  const btnAnteriores = document.getElementById("btn-toggle-laser-anteriores");
  const containerAnteriores = document.getElementById("container-laser-anteriores");
  if (btnAnteriores && containerAnteriores) {
    btnAnteriores.addEventListener("click", (e) => {
      e.stopPropagation();
      const estaOculto = containerAnteriores.style.display === "none";
      containerAnteriores.style.display = estaOculto ? "flex" : "none";
      const chevron = btnAnteriores.querySelector(".chevron-anteriores");
      if (chevron) {
        chevron.style.transform = estaOculto ? "rotate(180deg)" : "rotate(0deg)";
      }
    });
  }

  renderizarFormulariosParametrosLaser(state.currentListaServicosRegistro, state.ultimosRegistrosLaserCliente);

  if (state.selectedAppointment) {
    atualizarOfertasComSexo(state.selectedAppointment, state.lastSaldoServicosCache, state.ultimosRegistrosLaserCliente);
  }
}

export function gerarHtmlSubzonaItem(sub, subIdx, totalSubzonas, sNome) {
  const isMulti = totalSubzonas > 1;
  const rotulo = sub.rotulo || (subIdx === 0 ? "Geral" : `Sub-Zona ${subIdx + 1}`);
  const energiaValor = (sub.energiaValor !== undefined && sub.energiaValor !== null && sub.energiaValor !== "") ? sub.energiaValor : (sub.temEnergiaAnterior ? sub.energiaAnterior : "");
  const temEnergiaAnterior = sub.temEnergiaAnterior;
  const freqNum = sub.freqNum || 0.8;
  const disparosNum = sub.disparosNum || (subIdx > 0 ? 150 : 200);

  const fVal = String(sub.fototipo || "IV").toUpperCase();
  const mVal = String(sub.modo || "HR").toUpperCase();
  const fClean = (fVal.match(/^(I|II|III|IV|V|VI)\b/i) || [])[1] || (fVal.includes("I") ? fVal : "IV");
  const isHR = !mVal.includes("SHR");

  return `
    <div class="param-subzona-item" 
         data-sub-idx="${subIdx}"
         data-orig-fototipo="${sub.origFototipo || sub.fototipo || 'IV'}"
         data-orig-modo="${sub.origModo || sub.modo || 'HR'}"
         data-orig-energia="${sub.origEnergia || 0}"
         data-orig-frequencia="${freqNum}"
         data-orig-disparos="${disparosNum}">

      ${isMulti ? `
        <div class="subzona-header">
          <div class="subzona-title-wrap">
            <span class="subzona-badge-tag">Zona ${subIdx + 1}</span>
            <input type="text" class="subzona-rotulo-input" value="${rotulo}" placeholder="Nome (ex: Lábios, Geral)">
          </div>
          ${subIdx > 0 ? `
            <button type="button" class="btn-remove-subzona" title="Remover esta sub-zona">
              🗑️ Excluir
            </button>
          ` : ''}
        </div>
      ` : ''}

      <!-- LINHA 2: ENERGIA (DESTAQUE PRINCIPAL) -->
      <div class="param-energia-row">
        <div class="param-energia-anterior">
          <span class="param-anterior-label">Anterior:</span>
          <span class="param-anterior-val">${temEnergiaAnterior ? `<strong>${sub.energiaAnterior}J</strong>` : '<em style="color:#94a3b8;">1ª vez</em>'}</span>
        </div>

        <div class="param-energia-hoje">
          <span class="param-hoje-label">Hoje:</span>
          <div class="param-stepper-wrap param-stepper-compact">
            <button type="button" class="btn-param-step btn-step-minus" data-delta="-1" title="Diminuir 1J">−</button>
            <div class="param-input-with-unit">
              <input type="number" step="1" min="0" max="100" class="param-input param-energia" value="${energiaValor}" placeholder="J" ${!temEnergiaAnterior ? 'data-sem-historico="1"' : ''}>
              <span class="param-unit-tag">J</span>
            </div>
            <button type="button" class="btn-param-step btn-step-plus" data-delta="1" title="Aumentar 1J">+</button>
          </div>
        </div>
      </div>

      <!-- LINHA 3: PARÂMETROS TÉCNICOS (FOTOTIPO, MODO, FREQUÊNCIA, DISPAROS) -->
      <div class="param-tech-row">
        <!-- Fototipo -->
        <div class="param-tech-item">
          <label class="param-tech-lbl">Fototipo</label>
          <select class="param-tech-select param-fototipo" title="Fototipo da pele">
            <option value="I" ${fClean === 'I' ? 'selected' : ''}>I • Muito clara</option>
            <option value="II" ${fClean === 'II' ? 'selected' : ''}>II • Clara</option>
            <option value="III" ${fClean === 'III' ? 'selected' : ''}>III • Morena clara</option>
            <option value="IV" ${fClean === 'IV' ? 'selected' : ''}>IV • Morena</option>
            <option value="V" ${fClean === 'V' ? 'selected' : ''}>V • Morena escura</option>
            <option value="VI" ${fClean === 'VI' ? 'selected' : ''}>VI • Negra</option>
          </select>
        </div>

        <!-- Modo -->
        <div class="param-tech-item">
          <label class="param-tech-lbl">Modo</label>
          <select class="param-tech-select param-modo" title="Modo de disparo">
            <option value="HR" ${isHR ? 'selected' : ''}>HR (Pontual)</option>
            <option value="SHR" ${!isHR ? 'selected' : ''}>SHR (Varredura)</option>
          </select>
        </div>

        <!-- Frequência -->
        <div class="param-tech-item">
          <label class="param-tech-lbl">Freq</label>
          <div class="param-stepper-wrap param-stepper-mini" title="Frequência em Hz">
            <button type="button" class="btn-param-step" data-delta="-0.1" title="Diminuir 0.1Hz">−</button>
            <div class="param-input-with-unit">
              <input type="number" step="0.1" min="0.1" max="10" class="param-input param-frequencia" value="${freqNum}">
              <span class="param-unit-tag">Hz</span>
            </div>
            <button type="button" class="btn-param-step" data-delta="0.1" title="Aumentar 0.1Hz">+</button>
          </div>
        </div>

        <!-- Disparos -->
        <div class="param-tech-item">
          <label class="param-tech-lbl">Disparos</label>
          <div class="param-stepper-wrap param-stepper-mini" title="Quantidade de disparos">
            <button type="button" class="btn-param-step" data-delta="-50" title="Diminuir 50 disparos">−</button>
            <div class="param-input-with-unit">
              <input type="number" step="10" min="0" max="9999" class="param-input param-disparos" value="${disparosNum}">
            </div>
            <button type="button" class="btn-param-step" data-delta="50" title="Aumentar 50 disparos">+</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

let cacheFormularioAtendimento = new Map();
let idConsultaCacheFormulario = null;

export function salvarEstadoFormularioEmCache() {
  const capturados = capturarValoresAtuaisDoFormulario();
  if (capturados && capturados.size > 0) {
    cacheFormularioAtendimento = capturados;
  }
}

export function limparCacheFormularioLaser() {
  cacheFormularioAtendimento = new Map();
  idConsultaCacheFormulario = null;
  if (atendListaFormsLaser) atendListaFormsLaser.innerHTML = "";
}

/**
 * Lê os valores atualmente digitados nos inputs do DOM para não perder o que a aplicadora digitou
 * caso ocorra uma re-renderização assíncrona (ex: chegada do saldo ou do histórico anterior).
 */
export function capturarValoresAtuaisDoFormulario() {
  if (!atendListaFormsLaser) return cacheFormularioAtendimento || new Map();
  const cards = atendListaFormsLaser.querySelectorAll(".atend-param-form-card");
  if (!cards || cards.length === 0) return cacheFormularioAtendimento || new Map();

  const mapa = new Map();
  cards.forEach(card => {
    const sCod = card.getAttribute("data-cod-serv") || "";
    const sNome = card.getAttribute("data-area-nome") || "";
    const codAgendamento = card.getAttribute("data-cod-agendamento") || "";
    const status = card.getAttribute("data-status") || "realizada";
    const isOpen = card.classList.contains("param-card-open");
    const removerChk = card.querySelector(".chk-remover-agendamento");
    const removerDoAgendamento = removerChk ? removerChk.checked : true;
    const skipObs = card.querySelector(".param-skip-obs")?.value || "";
    const obsGeral = card.querySelector(".param-section-realizada .param-obs")?.value || "";

    const subzonas = [];
    card.querySelectorAll(".param-subzona-item").forEach(subItem => {
      const rotulo = subItem.querySelector(".subzona-rotulo-input")?.value?.trim() || "";
      const energia = subItem.querySelector(".param-energia")?.value || "";
      const fototipo = subItem.querySelector(".param-fototipo")?.value || "";
      const modo = subItem.querySelector(".param-modo")?.value || "";
      const frequencia = subItem.querySelector(".param-frequencia")?.value || "";
      const disparos = subItem.querySelector(".param-disparos")?.value || "";
      const obs = subItem.querySelector(".param-obs")?.value || "";
      subzonas.push({ rotulo, energia, fototipo, modo, frequencia, disparos, obs });
    });

    const chave = `${sCod}_${normalizarNomeAreaParaMatch(sNome)}`;
    mapa.set(chave, {
      codAgendamento,
      status,
      isOpen,
      removerDoAgendamento,
      skipObs,
      obsGeral,
      subzonas
    });
  });

  cacheFormularioAtendimento = mapa;
  return mapa;
}

/**
 * Identifica com precisão a qual agendamento do dia um determinado serviço pertence,
 * garantindo que, quando múltiplos agendamentos do mesmo cliente forem unificados na visualização,
 * os parâmetros sejam gravados estritamente no agendamento correto no Belle.
 */
export function resolverCodAgendamentoParaServico(nomeArea, codServ = "", itemServ = null) {
  if (itemServ?.codAgendamento) return String(itemServ.codAgendamento);

  const app = state.selectedAppointment;
  const codCli = app?.codCliente;
  const nomeCli = (app?.clienteNome || "").toLowerCase().trim();

  const agendamentos = (state.appointmentsData || []).filter(a => {
    if (a.isBloqueado || a.status === "bloqueado") return false;
    if (codCli && a.codCliente) return String(a.codCliente) === String(codCli);
    if (nomeCli && a.clienteNome) return a.clienteNome.toLowerCase().trim() === nomeCli;
    return false;
  });

  if (agendamentos.length === 0) {
    return String(app?.codConsulta || app?.id || "");
  }

  const sNomeLower = String(nomeArea || "").toLowerCase().trim();
  const sCodStr = String(codServ || "").trim();

  // 1. Procura no arrServ de cada agendamento
  for (const ag of agendamentos) {
    if (Array.isArray(ag.arrServ) && ag.arrServ.length > 0) {
      const match = ag.arrServ.find(item => {
        if (sCodStr && (String(item.cod_servico) === sCodStr || String(item.codServ) === sCodStr)) return true;
        const itemNome = String(item.nome || item.servico || "").toLowerCase().trim();
        return itemNome && (itemNome.includes(sNomeLower) || sNomeLower.includes(itemNome));
      });
      if (match) return String(ag.codConsulta || ag.id);
    }
  }

  // 2. Procura no lbServ de cada agendamento
  for (const ag of agendamentos) {
    if (ag.lbServ) {
      const lbLower = String(ag.lbServ).toLowerCase();
      if (lbLower.includes(sNomeLower) || (sNomeLower.length >= 4 && lbLower.includes(sNomeLower.substring(0, 4)))) {
        return String(ag.codConsulta || ag.id);
      }
    }
  }

  // 3. Procura no procedimento ou nomePlano
  for (const ag of agendamentos) {
    const proc = String(ag.procedimento || ag.nomePlano || "").toLowerCase();
    if (proc && (proc.includes(sNomeLower) || sNomeLower.includes(proc))) {
      return String(ag.codConsulta || ag.id);
    }
  }

  return String(app?.codConsulta || app?.id || "");
}

export function renderizarFormulariosParametrosLaser(listaServicos, historicoRegistros) {
  if (!atendListaFormsLaser) return;

  // 1. Captura os valores digitados na tela para nunca perder energia ou configurações
  const valoresCapturados = capturarValoresAtuaisDoFormulario();
  
  // REGRA CLÍNICA: Exibe ESTRITAMENTE as áreas agendadas para a consulta de hoje.
  // Nunca deve mostrar todas as áreas do plano contratado da cliente.
  let servicosParaExibir = [];
  if (Array.isArray(state.currentServicosAgendadosHoje) && state.currentServicosAgendadosHoje.length > 0) {
    servicosParaExibir = [...state.currentServicosAgendadosHoje];
  } else if (Array.isArray(listaServicos) && listaServicos.length > 0) {
    servicosParaExibir = [...listaServicos];
  } else if (state.selectedAppointment?.arrServ && state.selectedAppointment.arrServ.length > 0) {
    servicosParaExibir = [...state.selectedAppointment.arrServ];
  } else if (state.selectedAppointment?.procedimento) {
    servicosParaExibir = [{
      nome: state.selectedAppointment.procedimento,
      cod_servico: state.selectedAppointment.codTipo || ""
    }];
  }

  state.currentListaServicosRegistro = servicosParaExibir;

  const historico = (Array.isArray(historicoRegistros) && historicoRegistros.length > 0) 
    ? historicoRegistros 
    : state.ultimosRegistrosLaserCliente;

  if (atendQtdAreasRegistro) {
    atendQtdAreasRegistro.textContent = `${state.currentListaServicosRegistro.length} área${state.currentListaServicosRegistro.length === 1 ? '' : 's'}`;
  }

  if (state.currentListaServicosRegistro.length === 0) {
    atendListaFormsLaser.innerHTML = '<div style="font-size: 11px; color: #64748b; padding: 6px;">Nenhuma área encontrada para registrar parâmetros.</div>';
    return;
  }

  // Identifica se há múltiplos agendamentos do mesmo cliente hoje
  const codCliRef = state.selectedAppointment?.codCliente;
  const nomeCliRef = (state.selectedAppointment?.clienteNome || "").toLowerCase().trim();
  const agsHoje = (state.appointmentsData || []).filter(a => {
    if (a.isBloqueado || a.status === "bloqueado") return false;
    if (codCliRef && a.codCliente) return String(a.codCliente) === String(codCliRef);
    if (nomeCliRef && a.clienteNome) return a.clienteNome.toLowerCase().trim() === nomeCliRef;
    return false;
  });
  const temMultiplosAgs = agsHoje.length > 1;

  let formsHtml = "";
  state.currentListaServicosRegistro.forEach((s, idx) => {
    const sCod = s.codServ || s.cod_servico || (55556400 + idx);
    const sNome = s.nome || `Área #${idx + 1}`;
    const areaFormatada = `${sCod} - ${sNome}`;
    const sNomeExibicao = sNome.replace(/^\d+\s*-\s*/, '').trim() || sNome;
    const chave = `${sCod}_${normalizarNomeAreaParaMatch(sNome)}`;
    const capturado = valoresCapturados.get(chave);

    // Identifica o agendamento de origem exato desta área
    const codAgendamentoFinal = s.codAgendamento || capturado?.codAgendamento || resolverCodAgendamentoParaServico(sNome, sCod, s);
    const agOrigem = agsHoje.find(a => String(a.codConsulta || a.id) === String(codAgendamentoFinal));
    const horaOrigem = agOrigem?.horario || s.agendamentoHorario || "";

    // Puxa automaticamente as sub-zonas anteriores da cliente se houver histórico dividido
    let subzonas = extrairSubzonasHistorico(sNome, historico, sCod, state.currentPerfilCliente);
    if (capturado && Array.isArray(capturado.subzonas) && capturado.subzonas.length > 0) {
      subzonas = capturado.subzonas.map((subCap, sIdx) => {
        const histSub = subzonas[sIdx] || subzonas[0] || {};
        return {
          rotulo: subCap.rotulo || histSub.rotulo || (sIdx === 0 ? "Geral" : `Sub-Zona ${sIdx + 1}`),
          energiaValor: (subCap.energia !== "" && subCap.energia !== undefined) ? subCap.energia : (histSub.energiaValor || ""),
          temEnergiaAnterior: histSub.temEnergiaAnterior || false,
          energiaAnterior: histSub.energiaAnterior || "",
          origFototipo: histSub.origFototipo || subCap.fototipo || "IV",
          origModo: histSub.origModo || subCap.modo || "HR",
          origEnergia: histSub.origEnergia || 0,
          fototipo: subCap.fototipo || histSub.fototipo || "IV",
          modo: subCap.modo || histSub.modo || "HR",
          freqNum: subCap.frequencia || histSub.freqNum || 0.8,
          disparosNum: subCap.disparos || histSub.disparosNum || (sIdx > 0 ? 150 : 200),
          obs: subCap.obs !== undefined ? subCap.obs : (histSub.obs || "")
        };
      });
    }

    const subzonasHtml = subzonas.map((sub, sIdx) => gerarHtmlSubzonaItem(sub, sIdx, subzonas.length, sNome)).join("");

    const jaGravadaNaoRealizada = subzonas.some(s => s.isNaoRealizadaHoje);
    const isRealizada = capturado 
      ? capturado.status === "realizada" 
      : (jaGravadaNaoRealizada ? false : true);
    const status = isRealizada ? "realizada" : "nao_realizada";
    const isOpen = capturado ? Boolean(capturado.isOpen) : (idx === 0);
    const removerDoAgendamento = capturado ? capturado.removerDoAgendamento : true;
    const skipObs = capturado ? (capturado.skipObs || "") : (jaGravadaNaoRealizada ? (subzonas[0]?.obs || "") : "");
    const obsGeral = capturado ? (capturado.obsGeral || "") : "";

    const codLimpo = (sCod && String(sCod).trim() && !String(sCod).toLowerCase().startsWith("área"))
      ? String(sCod).replace(/^cód:\s*/i, "").trim()
      : "";

    const areaJaGravadaHoje = subzonas.some(s => s.jaSalvoHoje);
    let badgeStatusHojeHtml = "";
    if (jaGravadaNaoRealizada) {
      badgeStatusHojeHtml = `<span class="badge-gravado-hoje badge-gravado-nao-feita" title="Área já registrada no prontuário hoje como Não Realizada">✕ Não Feita Hoje</span>`;
    } else if (areaJaGravadaHoje) {
      badgeStatusHojeHtml = `<span class="badge-gravado-hoje" title="Parâmetros desta área já foram gravados hoje no prontuário do Belle">✓ Gravado Hoje</span>`;
    }

    formsHtml += `
      <div class="atend-param-form-card ${!isRealizada ? 'param-card-skipped' : ''}" 
           data-idx="${idx}"
           data-cod-serv="${sCod}" 
           data-cod-agendamento="${codAgendamentoFinal}"
           data-area-nome="${sNome}"
           data-area-formatada="${areaFormatada}"
           data-status="${status}">
        
        <!-- LINHA 1: TÍTULO DA ÁREA + TOGGLE DE STATUS COMPACTO -->
        <div class="param-card-top-row">
          <div class="param-card-title-wrap" title="${areaFormatada} (Vinculado ao agendamento #${codAgendamentoFinal})">
            ${codLimpo ? `<span class="param-card-cod">${codLimpo}</span><span class="param-card-sep"> - </span>` : ''}<span class="param-card-name">${sNomeExibicao}</span>
            ${temMultiplosAgs && horaOrigem ? `<span class="param-card-hora-tag" title="Vinculado ao agendamento das ${horaOrigem} (#${codAgendamentoFinal})">⏰ ${horaOrigem}</span>` : ''}
            ${badgeStatusHojeHtml}
          </div>
          <div class="param-status-toggle-clean">
            <button type="button" class="btn-toggle-status status-realizada ${isRealizada ? 'active' : ''}" data-status="realizada" title="Área feita hoje">
              ✓ Feito
            </button>
            <button type="button" class="btn-toggle-status status-nao-realizada ${!isRealizada ? 'active' : ''}" data-status="nao_realizada" title="Área não feita hoje">
              ✕ Não Feito
            </button>
          </div>
        </div>

        <!-- SEÇÃO QUANDO REALIZADA (ENXUTA: ENERGIA + OBSERVAÇÃO) -->
        <div class="param-section-realizada" style="display: ${isRealizada ? 'block' : 'none'};">
          <div class="param-subzonas-container">
            ${subzonasHtml}
          </div>

          <div class="param-obs-row">
            <input type="text" class="param-input param-obs" placeholder="💬 Observação (opcional, ex: Boa tolerância)..." value="${obsGeral}">
          </div>
        </div>

        <!-- SEÇÃO QUANDO NÃO REALIZADA -->
        <div class="param-section-nao-realizada" style="display: ${!isRealizada ? 'block' : 'none'};">
          <div class="param-skip-box">
            <label class="param-skip-chk-label">
              <input type="checkbox" class="chk-remover-agendamento" ${removerDoAgendamento ? 'checked' : ''}>
              <span>Remover do agendamento (preserva saldo no Belle)</span>
            </label>
            <input type="text" class="param-input param-skip-obs" placeholder="Motivo (ex: Sensibilidade / Sol recente / Menstruada)..." value="${skipObs}">
          </div>
        </div>
      </div>
    `;
  });

  atendListaFormsLaser.innerHTML = formsHtml;
}

export async function salvarParametrosLaserDireto(parametros) {
  if (!btnSalvarParametrosLaser) return { success: false, error: "Formulário indisponível" };

  // Trava de segurança: impede duplicar gravações no mesmo dia
  if (verificarSeParametrosForamSalvos()) {
    console.log("[Atendimento] ℹ️ Parâmetros já constam como gravados hoje no prontuário. Salvamento ignorado para evitar duplicidade.");
    if (btnSalvarParametrosLaser) {
      btnSalvarParametrosLaser.style.display = "none";
    }
    if (atendStatusSalvarLaser) {
      atendStatusSalvarLaser.style.display = "block";
      atendStatusSalvarLaser.className = "param-save-status status-success";
      atendStatusSalvarLaser.textContent = "✓ Os parâmetros de laser desta consulta já foram gravados hoje no prontuário.";
    }
    return { success: true, jaSalvo: true };
  }

  // Bloqueio clínico: área realizada sem energia definida não vai para o prontuário.
  const { possuiPendencia, areasSemEnergia } = verificarParametrosObrigatorios(parametros);
  if (possuiPendencia) {
    const nomes = areasSemEnergia.map(a => a.nomeArea || a.area).join(", ");
    if (atendStatusSalvarLaser) {
      atendStatusSalvarLaser.style.display = "block";
      atendStatusSalvarLaser.className = "param-save-status status-error";
      atendStatusSalvarLaser.textContent = `Informe a energia (J) aplicada hoje em: ${nomes}.`;
    }
    document.querySelectorAll('.param-energia[data-sem-historico="1"]').forEach(inp => {
      if (!(parseFloat(inp.value) > 0)) {
        inp.classList.add("param-input-erro");
        const card = inp.closest(".atend-param-form-card");
        if (card) {
          alternarCardArea(card, true);
          inp.focus();
        }
      }
    });
    return { success: false, bloqueado: true, error: `Energia não informada em: ${nomes}` };
  }

  document.querySelectorAll(".param-energia.param-input-erro").forEach(inp => inp.classList.remove("param-input-erro"));

  if (btnSalvarParametrosLaser) {
    btnSalvarParametrosLaser.style.display = "none";
  }

  if (atendStatusSalvarLaser) {
    atendStatusSalvarLaser.style.display = "block";
    atendStatusSalvarLaser.className = "param-save-status status-saving";
    atendStatusSalvarLaser.textContent = "Salvando parâmetros na ficha da cliente...";
  }

  const res = await salvarParametrosLaserEmLoteApi(parametros);

  if (res.success) {
    const qtdRealizadas = parametros.filter(p => p.isRealizada !== false).length;
    const qtdNaoRealizadas = parametros.filter(p => p.isRealizada === false).length;

    let msgSucesso = `Sucesso: ${qtdRealizadas} parâmetro(s) registrado(s) com sucesso no prontuário!`;
    if (qtdNaoRealizadas > 0) {
      msgSucesso += ` (${qtdNaoRealizadas} área(s) não realizada(s) registrada(s))`;
    }

    if (btnSalvarParametrosLaser) {
      btnSalvarParametrosLaser.style.display = "none";
    }
    parametrosJaSalvosNesteAtendimento = true;
    if (atendStatusSalvarLaser) {
      atendStatusSalvarLaser.className = "param-save-status status-success";
      atendStatusSalvarLaser.textContent = msgSucesso;
    }

    // Mantém no cache em memória o status exato (realizada / não realizada) de cada área
    parametros.forEach(p => {
      const sCod = p.codServ || "";
      const sNome = p.nomeArea || p.area || "";
      const chave = `${sCod}_${normalizarNomeAreaParaMatch(sNome)}`;
      const existente = cacheFormularioAtendimento.get(chave) || {};
      cacheFormularioAtendimento.set(chave, {
        ...existente,
        status: p.isRealizada === false ? "nao_realizada" : "realizada",
        skipObs: p.obs || existente.skipObs || "",
        removerDoAgendamento: p.removerDoAgendamento !== false
      });
    });

    // Persiste no cache da cliente a configuração de subzonas
    if (state.selectedAppointment?.codCliente) {
      const subzonasPorServico = {};
      document.querySelectorAll(".atend-param-form-card").forEach(card => {
        const codServ = card.getAttribute("data-cod-serv");
        const subItems = card.querySelectorAll(".param-subzona-item");
        if (codServ && subItems.length > 1) {
          subzonasPorServico[codServ] = Array.from(subItems).map((item, i) => ({
            rotulo: item.querySelector(".subzona-rotulo-input")?.value?.trim() || (i === 0 ? "Geral" : `Sub-Zona ${i + 1}`),
            fototipo: item.querySelector(".param-fototipo")?.value || "IV",
            modo: item.querySelector(".param-modo")?.value || "HR",
            energiaAnterior: item.querySelector(".param-energia")?.value || "",
            freq: item.querySelector(".param-frequencia")?.value || "0,8",
            disparos: item.querySelector(".param-disparos")?.value || "150"
          }));
        }
      });

      if (Object.keys(subzonasPorServico).length > 0) {
        lerPerfilCliente(state.currentCodEstab, state.selectedAppointment.codCliente).then(perfilExistente => {
          const perfilAtualizado = {
            ...(perfilExistente || {}),
            subzonas: { ...(perfilExistente?.subzonas || {}), ...subzonasPorServico }
          };
          gravarPerfilCliente(state.currentCodEstab, state.selectedAppointment.codCliente, perfilAtualizado);
        }).catch(() => {});
      }
    }

    if (state.selectedAppointment?.codCliente) {
      buscarParametrosLaserApi(state.currentToken, state.selectedAppointment.codCliente, state.currentCodEstab)
        .then(registros => renderizarParametrosLaser(registros))
        .catch(() => {});
    }

    setTimeout(() => {
      if (atendStatusSalvarLaser) {
        atendStatusSalvarLaser.textContent = "✓ Parâmetros gravados hoje no prontuário do Belle.";
      }
    }, 4000);
  } else {
    if (btnSalvarParametrosLaser) {
      btnSalvarParametrosLaser.style.display = "none";
    }
    if (atendStatusSalvarLaser) {
      atendStatusSalvarLaser.style.display = "block";
      atendStatusSalvarLaser.className = "param-save-status status-error";
      // Gravação parcial precisa ficar explícita: parte do prontuário não foi registrada.
      atendStatusSalvarLaser.textContent = res.parcial
        ? `Gravação incompleta: ${res.salvos} de ${res.total} área(s) salvas. Não gravadas: ${(res.falhas || []).map(f => f.area).join(", ")}. Tente novamente.`
        : `Erro ao salvar: ${res.error || 'Falha na requisição'}. Tente novamente.`;
    }
  }

  return res;
}

export async function executarFluxoFinalizacaoAtendimento(app) {
  if (!app) return;

  if (finalizacaoEmAndamento) {
    console.warn("[Atendimento] Finalização já em andamento, ignorando clique duplo.");
    return;
  }

  const statusStr = String(app.status || "").toLowerCase();
  const statusFmtStr = String(app.statusFormatado || "").toLowerCase();
  const stsStr = String(app.sts || "").toLowerCase();
  const isJaFinalizado = statusStr === "finalizado" || statusStr === "atendido" ||
                         statusFmtStr === "atendido" || stsStr === "atendido";
  if (isJaFinalizado) {
    alert("Este atendimento já foi finalizado no Belle.");
    return;
  }

  finalizacaoEmAndamento = true;

  const isAval = app.isAvaliacao ?? ehAgendamentoAvaliacao(app);

  // Se for AVALIAÇÃO: não há parâmetros técnicos de laser nem evolução a validar
  if (isAval) {
    if (btnAtendFinalizar) {
      btnAtendFinalizar.disabled = true;
      btnAtendFinalizar.textContent = "⏳ Concluindo avaliação...";
    }

    const codConsulta = app.codConsulta || app.id;
    const sucesso = await finalizarAtendimentoApi(state.currentToken, codConsulta, state.currentCodEstab);

    if (sucesso) {
      finalizacaoEmAndamento = false;
      app.status = "finalizado";
      app.statusFormatado = "Atendido";
      if (atendStatusBadge) {
        atendStatusBadge.className = "app-badge badge-finalizado";
        atendStatusBadge.textContent = "Atendido";
      }

      if (btnAtendFinalizar) {
        btnAtendFinalizar.disabled = true;
        btnAtendFinalizar.textContent = "✅ Atendimento Já Finalizado";
        btnAtendFinalizar.style.background = "#64748b";
        btnAtendFinalizar.style.borderColor = "#475569";
        btnAtendFinalizar.style.cursor = "not-allowed";
        btnAtendFinalizar.title = "Este atendimento já foi finalizado no Belle.";
      }

      limparCachesAtendimento();

      if (typeof callbackRecarregarAgenda === "function") {
        callbackRecarregarAgenda();
      }

      // Sugere agendar primeira sessão ou pacote
      abrirModalProximoAgendamento(app, []);
    } else {
      finalizacaoEmAndamento = false;
      if (btnAtendFinalizar) {
        btnAtendFinalizar.disabled = false;
        btnAtendFinalizar.textContent = "✅ Concluir Avaliação";
      }
      alert("Não foi possível concluir a avaliação no Belle. Verifique a conexão e tente novamente.");
    }
    return;
  }

  // ATENDIMENTO DE LASER:
  // 1. Coleta os formulários preenchidos e identifica áreas realizadas vs não realizadas
  const parametrosJaSalvos = verificarSeParametrosForamSalvos();
  const parametrosFormularios = coletarParametrosDosFormularios();
  const areasRealizadas = parametrosFormularios.filter(p => p.isRealizada !== false);
  const areasNaoRealizadas = parametrosFormularios.filter(p => p.isRealizada === false);
  const areasParaRemover = areasNaoRealizadas.filter(p => p.removerDoAgendamento !== false);

  // 2. Trava de segurança: Se TODAS as áreas forem marcadas como não realizadas, não finaliza como Atendido
  if (parametrosFormularios.length > 0 && areasRealizadas.length === 0 && areasParaRemover.length > 0) {
    finalizacaoEmAndamento = false;
    if (!parametrosJaSalvos) {
      const confirmarSalvar = confirm(
        "Todas as áreas desta consulta foram marcadas como 'Não Realizada'.\n\n" +
        "Deseja gravar a justificativa de não realização no prontuário da cliente agora?\n\n" +
        "(O agendamento NÃO será finalizado como 'Atendido' para preservar integralmente o saldo de sessões da cliente no Belle)."
      );
      if (confirmarSalvar) {
        await salvarParametrosLaserDireto(parametrosFormularios);
      }
    } else {
      alert(
        "Todas as áreas foram marcadas como 'Não Realizada'.\n\n" +
        "Os motivos da não realização já foram gravados no prontuário da cliente.\n\n" +
        "Para não debitar sessões do plano da cliente, o agendamento NÃO será finalizado como 'Atendido'."
      );
    }
    return;
  }

  // Função central: Edita no Belle para retirar serviços não realizados, vincular atendente e finalizar
  const executarEdicaoEFinalizacao = async () => {
    if (btnAtendFinalizar) {
      btnAtendFinalizar.disabled = true;
      btnAtendFinalizar.textContent = "⏳ Atualizando agendamento...";
    }

    const codCli = app.codCliente;
    const nomeCli = (app.clienteNome || "").toLowerCase().trim();

    // Identifica todos os agendamentos do mesmo cliente hoje que devem ser finalizados juntos
    const agendamentosParaFinalizar = (state.appointmentsData || []).filter(a => {
      if (a.isBloqueado || a.status === "bloqueado" || a.status === "finalizado") return false;
      if (codCli && a.codCliente) {
        return String(a.codCliente) === String(codCli);
      }
      if (nomeCli && a.clienteNome) {
        return a.clienteNome.toLowerCase().trim() === nomeCli;
      }
      return false;
    });

    const listaAlvo = (agendamentosParaFinalizar.length > 0) ? agendamentosParaFinalizar : [app];

    console.log(`[Atendimento] 📝 Finalizando ${listaAlvo.length} agendamento(s) do cliente simultaneamente...`);

    let falhasFinalizacao = 0;
    for (let i = 0; i < listaAlvo.length; i++) {
      const ag = listaAlvo[i];
      const codAgStr = String(ag.codConsulta || ag.id);
      const horaAg = ag.horario ? ` (${ag.horario})` : "";

      if (btnAtendFinalizar) {
        btnAtendFinalizar.textContent = listaAlvo.length > 1 
          ? `⏳ Finalizando ${i + 1} de ${listaAlvo.length}${horaAg}...`
          : "⏳ Editando e finalizando no Belle...";
      }

      // Filtra estritamente as áreas deste agendamento
      const areasParaRemoverDesteAg = areasParaRemover.filter(p => {
        if (p.codAgendamento) return String(p.codAgendamento) === codAgStr;
        return listaAlvo.length === 1;
      });
      const areasRealizadasDesteAg = areasRealizadas.filter(p => {
        if (p.codAgendamento) return String(p.codAgendamento) === codAgStr;
        return listaAlvo.length === 1;
      });

      console.log(`[Atendimento] 🔄 [${i + 1}/${listaAlvo.length}] Editando agendamento #${codAgStr}${horaAg}...`);
      const resEdicao = await atualizarServicosAgendamentoApi(
        state.currentToken,
        ag,
        {
          areasParaRemover: areasParaRemoverDesteAg,
          areasRealizadas: areasRealizadasDesteAg
        },
        state.currentCodEstab
      );

      if (!resEdicao || !resEdicao.success) {
        console.warn(`[Atendimento] ❌ Falha ao atualizar agendamento #${codAgStr} no Belle:`, resEdicao?.error);
        falhasFinalizacao++;
        alert(`Não foi possível salvar a edição do agendamento #${codAgStr}${horaAg} no Belle:\n\n${resEdicao?.error || 'Erro desconhecido'}\n\nA finalização foi interrompida para proteger a integridade da sua agenda.`);
        continue;
      }

      console.log(`[Atendimento] 🏁 [${i + 1}/${listaAlvo.length}] Finalizando agendamento #${codAgStr}${horaAg}...`);
      const codConsultaAg = ag.codConsulta || ag.id;
      const sucesso = await finalizarAtendimentoApi(state.currentToken, codConsultaAg, state.currentCodEstab);
      if (sucesso) {
        ag.status = "finalizado";
        ag.statusFormatado = "Atendido";
      } else {
        falhasFinalizacao++;
      }
    }

    if (falhasFinalizacao === 0) {
      finalizacaoEmAndamento = false;
      app.status = "finalizado";
      app.statusFormatado = "Atendido";
      if (atendStatusBadge) {
        atendStatusBadge.className = "app-badge badge-finalizado";
        atendStatusBadge.textContent = "Atendido";
      }

      if (btnAtendFinalizar) {
        btnAtendFinalizar.disabled = true;
        btnAtendFinalizar.textContent = "✅ Atendimento Já Finalizado";
        btnAtendFinalizar.style.background = "#64748b";
        btnAtendFinalizar.style.borderColor = "#475569";
        btnAtendFinalizar.style.cursor = "not-allowed";
        btnAtendFinalizar.title = "Este atendimento já foi finalizado no Belle.";
      }

      limparCachesAtendimento();
      limparCacheFormularioLaser();
      parametrosJaSalvosNesteAtendimento = false;

      // Como todos os pacotes deste cliente já foram finalizados simultaneamente,
      // busca diretamente a próxima cliente da fila ou agenda
      const horaAtual = app.horario || "00:00";
      const proximaClienteFila = (state.appointmentsData || []).find(a => {
        if (String(a.id) === String(app.id) || String(a.codConsulta) === String(app.codConsulta)) return false;
        if (a.isBloqueado || a.status === "bloqueado" || a.status === "finalizado" || a.status === "falta") return false;
        
        const mesmoCli = (codCli && a.codCliente && String(a.codCliente) === String(codCli)) ||
                         (nomeCli && a.clienteNome && a.clienteNome.toLowerCase().trim() === nomeCli);
        if (mesmoCli) return false;

        return a.status === "aguardando";
      }) || (state.appointmentsData || []).find(a => {
        if (String(a.id) === String(app.id) || String(a.codConsulta) === String(app.codConsulta)) return false;
        if (a.isBloqueado || a.status === "bloqueado" || a.status === "finalizado" || a.status === "falta") return false;
        
        const mesmoCli = (codCli && a.codCliente && String(a.codCliente) === String(codCli)) ||
                         (nomeCli && a.clienteNome && a.clienteNome.toLowerCase().trim() === nomeCli);
        if (mesmoCli) return false;

        return a.horario >= horaAtual;
      });

      if (proximaClienteFila) {
        abrirAtendimento(proximaClienteFila);
      } else {
        if (typeof callbackAtivarAba === "function") callbackAtivarAba("tab-agenda");
      }
      if (typeof callbackRecarregarAgenda === "function") callbackRecarregarAgenda();
    } else {
      finalizacaoEmAndamento = false;
      if (btnAtendFinalizar) {
        btnAtendFinalizar.disabled = false;
        btnAtendFinalizar.textContent = "✅ Finalizar Atendimento";
        btnAtendFinalizar.style.background = "#16a34a";
        btnAtendFinalizar.style.borderColor = "#15803d";
        btnAtendFinalizar.style.cursor = "";
      }
      alert("Não foi possível finalizar todos os agendamentos no Belle. Verifique a conexão e tente novamente.");
    }
  };

  // CASO A: Parâmetros já foram salvos anteriormente nesta consulta ou hoje
  if (parametrosJaSalvos) {
    console.log("[Atendimento] ✅ Parâmetros já constam como gravados hoje. Executando apenas a edição para vincular atendente e finalizando...");
    await executarEdicaoEFinalizacao();
    return;
  }

  // CASO B: Parâmetros ainda NÃO foram salvos
  console.log("[Atendimento] ⚠️ Parâmetros ainda não foram salvos. Validando e salvando parâmetros antes de editar e finalizar...");

  // Trava clínica: área realizada sem energia não pode ser salva nem finalizada
  const { possuiPendencia, areasSemEnergia } = verificarParametrosObrigatorios(parametrosFormularios);
  if (possuiPendencia) {
    finalizacaoEmAndamento = false;
    const nomes = areasSemEnergia.map(a => a.nomeArea || a.area).join(", ");
    document.querySelectorAll('.param-energia[data-sem-historico="1"]').forEach(inp => {
      if (!(parseFloat(inp.value) > 0)) {
        inp.classList.add("param-input-erro");
        const card = inp.closest(".atend-param-form-card");
        if (card) {
          alternarCardArea(card, true);
          inp.focus();
        }
      }
    });
    if (atendStatusSalvarLaser) {
      atendStatusSalvarLaser.style.display = "block";
      atendStatusSalvarLaser.className = "param-save-status status-error";
      atendStatusSalvarLaser.textContent = `Informe a energia (J) aplicada hoje em: ${nomes}.`;
    }
    alert(`Não é possível finalizar: informe a energia (J) aplicada hoje em ${nomes}.`);
    return;
  }

  const { possuiSemEvolucao, areasSemEvolucao } = verificarEvolucaoParametros(parametrosFormularios);

  const salvarParametrosEProsseguir = async () => {
    if (btnAtendFinalizar) {
      btnAtendFinalizar.disabled = true;
      btnAtendFinalizar.textContent = "⏳ Salvando parâmetros...";
    }

    if (parametrosFormularios.length > 0) {
      const resSalvar = await salvarParametrosLaserDireto(parametrosFormularios);
      if (!resSalvar || !resSalvar.success) {
        finalizacaoEmAndamento = false;
        if (btnAtendFinalizar) {
          btnAtendFinalizar.disabled = false;
          btnAtendFinalizar.textContent = "✅ Finalizar Atendimento";
        }
        const areasFalhas = (resSalvar?.falhas || []).map(f => f.area).join(", ");
        alert(
          resSalvar?.parcial
            ? `Atendimento NÃO finalizado.\n\nApenas ${resSalvar.salvos} de ${resSalvar.total} área(s) foram gravadas no prontuário.\nNão gravadas: ${areasFalhas}\n\nTente salvar novamente antes de finalizar.`
            : `Atendimento NÃO finalizado.\n\nOs parâmetros do laser não puderam ser gravados no prontuário${areasFalhas ? ` (${areasFalhas})` : ""}.\nVerifique a conexão e tente novamente.`
        );
        return;
      }
    }

    parametrosJaSalvosNesteAtendimento = true;
    await executarEdicaoEFinalizacao();
  };

  if (possuiSemEvolucao) {
    abrirModalTravaEvolucao(areasSemEvolucao, () => {
      salvarParametrosEProsseguir();
    }, () => {
      finalizacaoEmAndamento = false;
    });
  } else {
    await salvarParametrosEProsseguir();
  }
}

export function renderizarProximaClienteAguardando(currentApp) {
  const cardProxima = document.getElementById("card-proxima-aguardando");
  const infoProxima = document.getElementById("proxima-aguardando-info");
  if (!cardProxima || !infoProxima) return;

  const currentId = currentApp?.id || currentApp?.codConsulta;
  const currentCli = currentApp?.codCliente;
  const currentNome = (currentApp?.clienteNome || "").toLowerCase().trim();

  // 1. Procura a próxima cliente que está com status "aguardando"
  const proximaAguardando = (state.appointmentsData || []).find(a => {
    if (String(a.id) === String(currentId) || String(a.codConsulta) === String(currentId)) return false;
    if (a.isBloqueado || a.status === "bloqueado" || a.status === "finalizado" || a.status === "falta") return false;

    const mesmoCliente = (currentCli && a.codCliente && String(a.codCliente) === String(currentCli)) ||
                         (currentNome && a.clienteNome && a.clienteNome.toLowerCase().trim() === currentNome);
    if (mesmoCliente) return false;

    return a.status === "aguardando";
  });

  if (proximaAguardando) {
    const procs = (proximaAguardando.arrServ && proximaAguardando.arrServ.length > 0)
      ? proximaAguardando.arrServ.map(s => s.nome).join(", ")
      : (proximaAguardando.procedimento || "Depilação a Laser");

    cardProxima.style.display = "block";
    infoProxima.innerHTML = `
      <div class="proxima-aguardando-content">
        <div class="proxima-aguardando-detalhes">
          <strong class="proxima-nome">👤 ${proximaAguardando.clienteNome}</strong>
          <span class="proxima-meta">⏰ ${proximaAguardando.horario} • 📍 ${proximaAguardando.salaNome}</span>
          <span style="font-size: 11px; color: #7c2d12; margin-top: 2px; line-height: 1.2;">✨ ${procs}</span>
        </div>
        <button class="btn-chamar-proxima" id="btn-chamar-proxima-aguardando" data-id="${proximaAguardando.id}">
          🔔 Chamar
        </button>
      </div>
    `;

    const btnChamar = document.getElementById("btn-chamar-proxima-aguardando");
    btnChamar?.addEventListener("click", () => {
      abrirAtendimento(proximaAguardando);
    });
  } else {
    cardProxima.style.display = "none";
  }
}

export async function abrirAtendimento(app, servicosExtras = null, { onAtivarAba, onRecarregarAgenda } = {}) {
  if (!app) return;
  if (state.currentUserRole === "consultora") {
    console.warn("[Atendimento] 🚫 Perfil Consultora não tem acesso à tela clínica de atendimento.");
    return;
  }
  if (onAtivarAba) callbackAtivarAba = onAtivarAba;
  if (onRecarregarAgenda) callbackRecarregarAgenda = onRecarregarAgenda;

  state.selectedAppointment = app;
  if (state.lastClienteLaserRegistrosCod && String(state.lastClienteLaserRegistrosCod) !== String(app.codCliente)) {
    state.ultimosRegistrosLaserCliente = [];
    parametrosJaSalvosNesteAtendimento = false;
  }
  state.lastClienteLaserRegistrosCod = app.codCliente;
  checarEAtualizarUIParametrosSalvos(app);

  const consultaId = app.id || app.codConsulta;
  if (idConsultaCacheFormulario !== consultaId) {
    idConsultaCacheFormulario = consultaId;
    limparCacheFormularioLaser();
  }

  const codCli = app.codCliente;
  const nomeCli = (app.clienteNome || "").toLowerCase().trim();

  const agendamentosMesmoCliente = (state.appointmentsData || []).filter(a => {
    if (a.isBloqueado || a.status === "bloqueado") return false;
    if (codCli && a.codCliente) {
      return String(a.codCliente) === String(codCli);
    }
    if (nomeCli && a.clienteNome) {
      return a.clienteNome.toLowerCase().trim() === nomeCli;
    }
    return false;
  });
  agendamentosMesmoCliente.sort((a, b) => (a.horario || "").localeCompare(b.horario || ""));

  if (atendimentoPlaceholder) atendimentoPlaceholder.style.display = "none";
  if (atendimentoContent) atendimentoContent.style.display = "flex";

  if (atendHorario) {
    if (agendamentosMesmoCliente.length > 1) {
      const horaIni = agendamentosMesmoCliente[0].horario || app.horario || "00:00";
      const horaFim = agendamentosMesmoCliente[agendamentosMesmoCliente.length - 1].hrFim || app.hrFim || "00:00";
      atendHorario.textContent = `⏰ ${horaIni} - ${horaFim}`;
    } else {
      atendHorario.textContent = `⏰ ${app.horario || '00:00'} - ${app.hrFim || '00:00'}`;
    }
  }
  
  if (atendStatusBadge) {
    let badgeClass = "badge-agendado";
    let statusLabel = app.statusFormatado || app.status;
    if (app.status === "aguardando") { badgeClass = "badge-aguardando"; statusLabel = "Aguardando"; }
    else if (app.status === "confirmado") { badgeClass = "badge-confirmado"; statusLabel = "Confirmado"; }
    else if (app.status === "agendado") { badgeClass = "badge-agendado"; statusLabel = "Marcado"; }
    else if (app.status === "atendimento") { badgeClass = "badge-atendimento"; statusLabel = "Em Andamento"; }
    else if (app.status === "finalizado") { badgeClass = "badge-finalizado"; statusLabel = "Atendido"; }
    else if (app.status === "falta") { badgeClass = "badge-falta"; statusLabel = "Falhou"; }
    else if (app.status === "bloqueado") { badgeClass = "badge-bloqueado"; statusLabel = "Bloqueado"; }

    atendStatusBadge.className = `app-badge ${badgeClass}`;
    atendStatusBadge.textContent = statusLabel;
  }

  renderizarProximaClienteAguardando(app);

  const codTxt = app.codCliente ? `${app.codCliente} - ` : "";
  if (atendNomeCliente) atendNomeCliente.textContent = `👤 ${codTxt}${app.clienteNome || "Cliente"}`;
  if (atendCodPaciente) atendCodPaciente.textContent = app.codCliente ? `#${app.codCliente}` : "N/A";
  if (atendCpf) atendCpf.textContent = app.cpf || "Não informado";
  if (atendTelefone) atendTelefone.textContent = app.telefone || "Não informado";
  if (atendSala) atendSala.textContent = app.salaNome || app.sala || "Geral";
  if (atendProfissional) atendProfissional.textContent = app.profissional || "Não informada";
  if (atendCodConsulta) atendCodConsulta.textContent = app.codConsulta ? `#${app.codConsulta}` : (app.id ? `#${app.id}` : "N/A");
  if (atendTagsBox) atendTagsBox.style.display = "none";

  renderizarMultiplosAgendamentosHoje(app);

  const badgeMultiPacotes = document.getElementById("atend-multi-pacotes-badge");
  if (badgeMultiPacotes) {
    if (agendamentosMesmoCliente.length > 1) {
      badgeMultiPacotes.textContent = `${agendamentosMesmoCliente.length} Pacotes`;
      badgeMultiPacotes.style.display = "inline-block";
    } else {
      badgeMultiPacotes.style.display = "none";
    }
  }

  // Pacotes Agendados: design limpo e escaneável direto no cabeçalho
  if (agendamentosMesmoCliente.length > 1) {
    if (atendNomePlano) {
      atendNomePlano.innerHTML = agendamentosMesmoCliente.map((a, idx) => `
        <div class="atend-pacote-row">
          <span class="atend-pacote-tag-hora">⏰ ${a.horario}</span>
          <span class="atend-pacote-title" title="${a.nomePlano || a.procedimento || 'Tratamento'}">${a.nomePlano || a.procedimento || "Tratamento"}</span>
          ${a.codOrcamento ? `<span class="atend-pacote-orc-badge">#${a.codOrcamento}</span>` : ''}
        </div>
      `).join("");
    }
    if (atendCodOrcamento) {
      const orcs = agendamentosMesmoCliente.map(a => a.codOrcamento).filter(Boolean);
      if (orcs.length > 0) {
        atendCodOrcamento.textContent = `${orcs.length} Vendas: ${orcs.map(o => `#${o}`).join(", ")}`;
      }
    }
  } else {
    if (atendNomePlano) {
      atendNomePlano.innerHTML = `
        <div class="atend-pacote-row single">
          <span class="atend-pacote-icon">📦</span>
          <span class="atend-pacote-title" title="${app.nomePlano || app.procedimento || 'Atendimento Avulso / Procedimento'}">${app.nomePlano || app.procedimento || "Atendimento Avulso / Procedimento"}</span>
          ${app.codOrcamento ? `<span class="atend-pacote-orc-badge">#${app.codOrcamento}</span>` : ''}
        </div>
      `;
    }
    if (atendCodOrcamento) {
      if (app.codOrcamento) {
        atendCodOrcamento.textContent = `Orçamento / Venda: #${app.codOrcamento}`;
      }
    }
  }

  // Lista de Serviços & Áreas: unifica áreas de todos os pacotes agendados hoje
  let listaServicos = [];
  if (agendamentosMesmoCliente.length > 1) {
    agendamentosMesmoCliente.forEach(ag => {
      let servsAg = (ag.arrServ && ag.arrServ.length > 0) ? [...ag.arrServ] : [];
      if (servsAg.length === 0 && ag.lbServ) {
        const linhas = ag.lbServ.split("<br>").map(l => l.trim()).filter(Boolean);
        linhas.forEach(l => {
          const match = l.match(/(.+?)\s*-\s*(\d+\/\d+)/);
          const nomeServ = match ? match[1].trim() : l;
          if (nomeServ) {
            servsAg.push({ nome: nomeServ, cod_servico: ag.codTipo || "" });
          }
        });
      }
      if (servsAg.length === 0 && ag.procedimento) {
        servsAg = [{ nome: ag.procedimento, cod_servico: ag.codTipo || "" }];
      }
      servsAg.forEach(s => {
        listaServicos.push({
          ...s,
          codAgendamento: String(ag.codConsulta || ag.id),
          agendamentoHorario: ag.horario,
          codOrcamento: ag.codOrcamento,
          pacoteNome: ag.nomePlano || ag.procedimento
        });
      });
    });
  } else {
    listaServicos = (app.arrServ && app.arrServ.length > 0) ? [...app.arrServ] : [];

    if (listaServicos.length === 0 && !servicosExtras && app.codConsulta && state.currentToken) {
      try {
        servicosExtras = await buscarGetServicosApi(state.currentToken, app.codConsulta, state.currentCodEstab);
      } catch (e) {}
    }

    if (listaServicos.length === 0 && servicosExtras && servicosExtras.servicos) {
      const nomes = servicosExtras.servicos.split(",").map(s => s.trim()).filter(Boolean);
      nomes.forEach((nome, idx) => {
        listaServicos.push({
          nome: nome,
          cod_servico: idx === 0 && servicosExtras.cod_serv ? servicosExtras.cod_serv : "",
          codAgendamento: app.codConsulta || app.id,
          codOrcamento: app.codOrcamento
        });
      });
    }

    if (listaServicos.length === 0 && app.procedimento) {
      listaServicos.push({
        nome: app.procedimento,
        cod_servico: app.codTipo || "",
        codAgendamento: app.codConsulta || app.id,
        codOrcamento: app.codOrcamento
      });
    }
  }

  state.currentServicosAgendadosHoje = [...listaServicos];
  state.currentListaServicosRegistro = [...listaServicos];

  if (atendQtdServicos) atendQtdServicos.textContent = `${listaServicos.length} área${listaServicos.length === 1 ? '' : 's'}`;

  // Mapeamento de progresso de lbServ (ex: "AXILAS (P) - depilação a laser - 15/40")
  const progressoMap = new Map();
  const appsParaProgresso = (agendamentosMesmoCliente.length > 1) ? agendamentosMesmoCliente : [app];
  appsParaProgresso.forEach(agItem => {
    if (agItem.lbServ) {
      const linhas = agItem.lbServ.split("<br>").map(l => l.trim()).filter(Boolean);
      linhas.forEach(l => {
        const match = l.match(/(.+?)\s*-\s*(\d+\/\d+)/);
        if (match) {
          progressoMap.set(match[1].trim().toLowerCase(), match[2]);
        }
      });
    }
  });

  // 1. Renderização visual IMEDIATA das áreas com barras de sessões (0ms)
  let cardsHtml = "";
  listaServicos.forEach((s, idx) => {
    const sNome = s.nome || `Procedimento #${idx + 1}`;
    const sCod = s.cod_servico || "";
    
    // Procura progresso de sessões no lbServ
    let sFeitas = 0;
    let sTotal = 0;
    let perc = 0;
    let temSaldo = false;
    for (const [k, v] of progressoMap.entries()) {
      if (sNome.toLowerCase().includes(k) || k.includes(sNome.toLowerCase().substring(0, 8))) {
        const parts = v.split("/");
        if (parts.length === 2) {
          sFeitas = Number(parts[0]) || 0;
          sTotal = Number(parts[1]) || 0;
          if (sTotal > 0) {
            perc = Math.min(100, Math.round((sFeitas / sTotal) * 100));
            temSaldo = true;
          }
        }
        break;
      }
    }

    cardsHtml += gerarCardServicoHtml({
      cod: sCod,
      nome: sNome,
      realizadas: sFeitas,
      contratadas: sTotal,
      pct: perc,
      temSaldo: temSaldo
    });
  });

  if (atendListaServicos) {
    atendListaServicos.innerHTML = cardsHtml || '<div style="font-size: 12px; color: #64748b; padding: 8px;">Nenhum procedimento discriminado.</div>';
  }

  const isAvaliacao = app.isAvaliacao ?? ehAgendamentoAvaliacao(app);
  const statusStr = String(app.status || "").toLowerCase();
  const statusFmtStr = String(app.statusFormatado || "").toLowerCase();
  const stsStr = String(app.sts || "").toLowerCase();
  const isJaFinalizado = statusStr === "finalizado" || statusStr === "atendido" ||
                         statusFmtStr === "atendido" || stsStr === "atendido";

  const cardParametros = document.getElementById("atend-card-parametros");
  const cardNovoParametro = document.getElementById("atend-card-novo-parametro");
  let cardAvaliacao = document.getElementById("atend-card-avaliacao");

  if (isAvaliacao) {
    if (cardParametros) cardParametros.style.display = "none";
    if (cardNovoParametro) cardNovoParametro.style.display = "none";

    if (!cardAvaliacao) {
      cardAvaliacao = document.createElement("div");
      cardAvaliacao.id = "atend-card-avaliacao";
      cardAvaliacao.className = "card card-avaliacao-destaque";
      cardAvaliacao.innerHTML = `
        <div class="card-section-title-flex">
          <div class="title-with-icon">
            <span class="icon-bubble" style="background: #e0f2fe; color: #0284c7;">📋</span>
            <span style="color: #0369a1; font-weight: 800;">Atendimento de Avaliação</span>
          </div>
          <span class="badge-count-pill" style="background: #e0f2fe; color: #0284c7;">Sem Laser</span>
        </div>
        <div class="avaliacao-info-banner">
          <p style="font-size: 11.5px; color: #334155; margin: 0 0 8px 0; line-height: 1.4;">
            💡 Este agendamento é uma <strong>Avaliação</strong>. <strong>Não há parâmetros técnicos de laser a registrar</strong> nesta sessão.
          </p>
          <div class="avaliacao-checklist">
            <div class="avaliacao-check-item">✔ Avaliar tipo de pele e histórico da cliente</div>
            <div class="avaliacao-check-item">✔ Esclarecer dúvidas sobre o tratamento e contraindicações</div>
            <div class="avaliacao-check-item">✔ Apresentar propostas de pacotes na aba <strong>CS & Vendas</strong></div>
          </div>
        </div>
      `;
      const actionCard = document.querySelector(".action-buttons-card");
      if (actionCard && actionCard.parentNode) {
        actionCard.parentNode.insertBefore(cardAvaliacao, actionCard);
      }
    } else {
      cardAvaliacao.style.display = "block";
    }

    if (btnAtendFinalizar) {
      if (isJaFinalizado) {
        btnAtendFinalizar.disabled = true;
        btnAtendFinalizar.textContent = "✅ Atendimento Já Finalizado";
        btnAtendFinalizar.style.background = "#64748b";
        btnAtendFinalizar.style.borderColor = "#475569";
        btnAtendFinalizar.style.cursor = "not-allowed";
        btnAtendFinalizar.title = "Este atendimento já foi finalizado no Belle.";
      } else {
        btnAtendFinalizar.disabled = false;
        btnAtendFinalizar.textContent = "✅ Concluir Avaliação";
        btnAtendFinalizar.style.background = "#0284c7";
        btnAtendFinalizar.style.borderColor = "#0369a1";
        btnAtendFinalizar.style.cursor = "";
        btnAtendFinalizar.title = "";
      }
    }
  } else {
    if (cardParametros) cardParametros.style.display = "block";
    if (cardNovoParametro) cardNovoParametro.style.display = "block";
    if (cardAvaliacao) cardAvaliacao.style.display = "none";

    // Inicia o histórico de parâmetros fechado por padrão (mostra apenas o título da div)
    alternarToggleParametros(false);

    if (btnAtendFinalizar) {
      if (isJaFinalizado) {
        btnAtendFinalizar.disabled = true;
        btnAtendFinalizar.textContent = "✅ Atendimento Já Finalizado";
        btnAtendFinalizar.style.background = "#64748b";
        btnAtendFinalizar.style.borderColor = "#475569";
        btnAtendFinalizar.style.cursor = "not-allowed";
        btnAtendFinalizar.title = "Este atendimento já foi finalizado no Belle.";
      } else {
        btnAtendFinalizar.disabled = false;
        btnAtendFinalizar.textContent = "✅ Finalizar Atendimento";
        btnAtendFinalizar.style.background = "#16a34a";
        btnAtendFinalizar.style.borderColor = "#15803d";
        btnAtendFinalizar.style.cursor = "";
        btnAtendFinalizar.title = "";
      }
    }

    if (btnSalvarParametrosLaser) {
      btnSalvarParametrosLaser.style.display = "none";
    }

    checarEAtualizarUIParametrosSalvos(app);

    // Renderiza imediatamente os formulários de registro por área
    renderizarFormulariosParametrosLaser(listaServicos, state.ultimosRegistrosLaserCliente);

    // 3. Busca parâmetros anteriores do prontuário do laser
    if (atendListaLaserParams) atendListaLaserParams.innerHTML = '<div style="font-size: 11px; color: #64748b; padding: 4px;">Consultando histórico no prontuário...</div>';
    if (loadingLaserParams) loadingLaserParams.style.display = "flex";
    if (atendLaserDataBadge) atendLaserDataBadge.textContent = "Buscando...";

    if (app.codCliente && state.currentToken) {
      buscarParametrosLaserApi(state.currentToken, app.codCliente, state.currentCodEstab)
        .then(registros => {
          renderizarParametrosLaser(registros);
        })
        .catch(() => {
          renderizarParametrosLaser([]);
        });
    } else {
      renderizarParametrosLaser([]);
    }
  }

  // Ativa a aba Atendimento imediatamente
  if (typeof callbackAtivarAba === "function") {
    callbackAtivarAba("tab-atendimento");
  }

  // 2. Consulta de Saldos e Planos (Reaproveita cache da agenda com 0ms de espera!)
  if (!isAvaliacao && state.currentToken) {
    const appsComOrc = (agendamentosMesmoCliente.length > 1 ? agendamentosMesmoCliente : [app]).filter(a => a.codOrcamento);
    const codClienteStr = String(app.codCliente || "").trim();

    // A. Verifica se o cliente já teve os pacotes e saldos pré-carregados na Agenda
    const pacotesPreCarregados = codClienteStr ? clientesPacotesCache.get(codClienteStr) : null;
    const saldosPreCarregados = codClienteStr ? clientesSaldosCache.get(codClienteStr) : null;

    if (pacotesPreCarregados && saldosPreCarregados) {
      console.log(`[Atendimento] ⚡ Cliente #${codClienteStr} já pré-carregado na Agenda! 0ms de espera.`);
      state.todosPacotesCliente = pacotesPreCarregados;
      state.todosSaldosCliente = saldosPreCarregados;
      renderizarServicosComSaldo(saldosPreCarregados);

      if (state.selectedAppointment) {
        atualizarOfertasComSexo(state.selectedAppointment, saldosPreCarregados, state.ultimosRegistrosLaserCliente);
      }
    } else {
      // B. Fallback sob demanda: consulta apenas se não estiver em cache
      console.log(`[Atendimento] 🔍 Buscando saldos e planos sob demanda para #${codClienteStr}...`);
      
      const buscarSaldosAgendados = appsComOrc.length > 0
        ? Promise.all(appsComOrc.map(a => 
            buscarSaldoVendaPlanoApi(state.currentToken, a.codOrcamento, a.codPlano, a.idGeinfo, state.currentCodEstab)
          )).then(resps => resps.flat().filter(Boolean))
        : Promise.resolve([]);

      const buscarTodosPacotes = codClienteStr
        ? buscarVendasPlanosClienteApi(state.currentToken, codClienteStr, state.currentCodEstab)
        : Promise.resolve([]);

      Promise.all([buscarSaldosAgendados, buscarTodosPacotes]).then(async ([saldosAgendados, vendasCliente]) => {
        state.todosPacotesCliente = Array.isArray(vendasCliente) ? vendasCliente : [];
        if (codClienteStr && Array.isArray(vendasCliente)) {
          clientesPacotesCache.set(codClienteStr, vendasCliente);
        }

        let saldosFinais = [...saldosAgendados];

        // Se o cliente tem outros pacotes não agendados hoje, busca seus saldos também
        const orcsAdicionais = state.todosPacotesCliente
          .filter(p => p.cod_orcamento && !appsComOrc.some(a => String(a.codOrcamento) === String(p.cod_orcamento)));

        if (orcsAdicionais.length > 0) {
          const respsExtras = await Promise.all(orcsAdicionais.map(p =>
            buscarSaldoVendaPlanoApi(state.currentToken, p.cod_orcamento, p.cod_plano || 0, p.id_geinfo, state.currentCodEstab)
          ));
          const saldosExtras = respsExtras.flat().filter(Boolean);
          saldosFinais.push(...saldosExtras);
        }

        state.todosSaldosCliente = saldosFinais;
        if (codClienteStr) {
          clientesSaldosCache.set(codClienteStr, saldosFinais);
        }

        renderizarServicosComSaldo(saldosFinais);
        appsComOrc.forEach(a => {
          if (a.codOrcamento) registrarSaldoCapturado(a.codOrcamento, saldosFinais);
        });

        if (state.selectedAppointment) {
          atualizarOfertasComSexo(state.selectedAppointment, saldosFinais, state.ultimosRegistrosLaserCliente);
        }
      }).catch(err => {
        console.warn("[Atendimento] Erro na busca sob demanda:", err);
      });
    }
  }
}

function renderizarServicosComSaldoFallback(app) {
  if (app.arrServ && app.arrServ.length > 0) {
    const arrSimulado = app.arrServ.map((s, idx) => ({
      servico: s.nome,
      nome: s.nome,
      realizadas: 1,
      contratadas: 10,
      saldo: 9,
      cod_servico: s.cod_servico || (55556400 + idx)
    }));
    renderizarServicosComSaldo(arrSimulado);
  } else {
    renderizarServicosComSaldo([{
      servico: app.procedimento || "Tratamento",
      nome: app.procedimento || "Tratamento",
      realizadas: 1,
      contratadas: 10,
      saldo: 9,
      cod_servico: 55556400
    }]);
  }
}

export function alternarCardArea(card, forcarAberto = null) {
  if (!card) return;
  const isCurrentlyOpen = card.classList.contains("param-card-open");
  const deveAbrir = forcarAberto !== null ? forcarAberto : !isCurrentlyOpen;

  // Se for abrir este card, fecha todos os outros cards primeiro (regra do acordeão: apenas 1 aberto por vez)
  if (deveAbrir) {
    document.querySelectorAll(".atend-param-form-card").forEach(c => {
      if (c !== card) {
        c.classList.remove("param-card-open");
        const b = c.querySelector(".param-form-body");
        if (b) b.style.display = "none";
        const h = c.querySelector(".atend-area-toggle");
        if (h) h.setAttribute("aria-expanded", "false");
        const ch = c.querySelector(".param-toggle-chevron");
        if (ch) ch.textContent = "▼";
      }
    });

    card.classList.add("param-card-open");
    const body = card.querySelector(".param-form-body");
    if (body) body.style.display = "block";
    const header = card.querySelector(".atend-area-toggle");
    if (header) header.setAttribute("aria-expanded", "true");
    const chevron = card.querySelector(".param-toggle-chevron");
    if (chevron) chevron.textContent = "▲";
  } else {
    // Apenas fecha este card
    card.classList.remove("param-card-open");
    const body = card.querySelector(".param-form-body");
    if (body) body.style.display = "none";
    const header = card.querySelector(".atend-area-toggle");
    if (header) header.setAttribute("aria-expanded", "false");
    const chevron = card.querySelector(".param-toggle-chevron");
    if (chevron) chevron.textContent = "▼";
  }

  salvarEstadoFormularioEmCache();
}

export function inicializarAtendimentoView({ onAtivarAba, onRecarregarAgenda } = {}) {
  callbackAtivarAba = onAtivarAba;
  callbackRecarregarAgenda = onRecarregarAgenda;

  // Sincronização em tempo real do cache dos formulários de laser
  atendListaFormsLaser?.addEventListener("input", () => {
    salvarEstadoFormularioEmCache();
  });
  atendListaFormsLaser?.addEventListener("change", () => {
    salvarEstadoFormularioEmCache();
  });
  atendListaFormsLaser?.addEventListener("click", () => {
    setTimeout(salvarEstadoFormularioEmCache, 0);
  });

  atendListaFormsLaser?.addEventListener("click", (e) => {
    // 0. Toggle de Acordeão da Área (Abrir/Fechar ao clicar no cabeçalho)
    const headerToggle = e.target.closest(".atend-area-toggle");
    if (headerToggle) {
      e.preventDefault();
      const card = headerToggle.closest(".atend-param-form-card");
      if (card) {
        alternarCardArea(card);
      }
      return;
    }

    // 1. Alternância de status Realizada vs Não Realizada
    const toggleBtn = e.target.closest(".btn-toggle-status");
    if (toggleBtn) {
      e.preventDefault();
      const card = toggleBtn.closest(".atend-param-form-card");
      if (!card) return;

      const newStatus = toggleBtn.getAttribute("data-status");
      card.setAttribute("data-status", newStatus);

      card.querySelectorAll(".btn-toggle-status").forEach(b => b.classList.remove("active"));
      toggleBtn.classList.add("active");

      // Atualiza o badge no cabeçalho visível do acordeão
      const statusBadge = card.querySelector(".param-status-badge");
      if (statusBadge) {
        if (newStatus === "nao_realizada") {
          statusBadge.className = "param-status-badge badge-nao-realizada";
          statusBadge.textContent = "✕ Não Realizada";
        } else {
          statusBadge.className = "param-status-badge badge-realizada";
          statusBadge.textContent = "✓ Realizada";
        }
      }

      const secRealizada = card.querySelector(".param-section-realizada");
      const secNaoRealizada = card.querySelector(".param-section-nao-realizada");

      if (newStatus === "nao_realizada") {
        card.classList.add("param-card-skipped");
        if (secRealizada) secRealizada.style.display = "none";
        if (secNaoRealizada) secNaoRealizada.style.display = "block";
      } else {
        card.classList.remove("param-card-skipped");
        if (secRealizada) secRealizada.style.display = "block";
        if (secNaoRealizada) secNaoRealizada.style.display = "none";
      }
      return;
    }

    // 2. Chips de motivo de não realização
    const skipPill = e.target.closest(".skip-pill");
    if (skipPill) {
      e.preventDefault();
      const card = skipPill.closest(".atend-param-form-card");
      const skipInput = card?.querySelector(".param-skip-obs");
      const reason = skipPill.getAttribute("data-reason");
      if (skipInput && reason) {
        let currentText = skipInput.value.trim();
        if (currentText.includes(reason)) {
          currentText = currentText.replace(new RegExp(`\\s*(?:•\\s*)?${reason.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'), '').trim();
          currentText = currentText.replace(/^•\s*/, '').replace(/•\s*•/, '•').trim();
          skipPill.classList.remove("active");
        } else {
          if (currentText.length > 0) {
            currentText += ` • ${reason}`;
          } else {
            currentText = reason;
          }
          skipPill.classList.add("active");
        }
        skipInput.value = currentText;
        skipInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return;
    }

    // 3. Stepper de valores (Energia, Frequência, Disparos)
    const stepBtn = e.target.closest(".btn-param-step");
    if (stepBtn) {
      e.preventDefault();
      const wrap = stepBtn.closest(".param-stepper-wrap");
      const input = wrap?.querySelector("input.param-input");
      if (input) {
        const delta = parseFloat(stepBtn.getAttribute("data-delta")) || 0;
        const min = input.hasAttribute("min") ? parseFloat(input.getAttribute("min")) : 0;
        const max = input.hasAttribute("max") ? parseFloat(input.getAttribute("max")) : 9999;
        let val = parseFloat(input.value) || 0;
        val = Math.min(max, Math.max(min, Number((val + delta).toFixed(1))));
        input.value = val;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return;
    }

    // 4. Multi-select Tags / Pills de Observação Clínica (Área Realizada)
    const pill = e.target.closest(".obs-pill");
    if (pill) {
      e.preventDefault();
      const card = pill.closest(".atend-param-form-card");
      const obsInput = card?.querySelector(".param-obs");
      const pillText = pill.getAttribute("data-text");
      if (obsInput && pillText) {
        let currentText = obsInput.value.trim();
        if (currentText.includes(pillText)) {
          currentText = currentText.replace(new RegExp(`\\s*(?:•\\s*)?${pillText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'), '').trim();
          currentText = currentText.replace(/^•\s*/, '').replace(/•\s*•/, '•').trim();
          pill.classList.remove("active");
        } else {
          if (currentText.length > 0) {
            currentText += ` • ${pillText}`;
          } else {
            currentText = pillText;
          }
          pill.classList.add("active");
        }
        obsInput.value = currentText;
        obsInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return;
    }

    // 5. Adicionar Subzona / Dividir por Fototipo
    const btnAddSub = e.target.closest(".btn-add-subzona");
    if (btnAddSub) {
      e.preventDefault();
      const card = btnAddSub.closest(".atend-param-form-card");
      if (!card) return;
      const container = card.querySelector(".param-subzonas-container");
      if (!container) return;

      const subItems = container.querySelectorAll(".param-subzona-item");
      const nextIdx = subItems.length;
      if (nextIdx >= 4) return; // Limite máximo de 4 subzonas por área

      // Se for a primeira divisão (tinha só 1 item), re-renderiza o item 0 com o cabeçalho de subzona 1
      if (nextIdx === 1) {
        const item0 = subItems[0];
        item0.classList.add("param-subzona-destacada");
        if (!item0.querySelector(".subzona-header")) {
          const headerDiv = document.createElement("div");
          headerDiv.className = "subzona-header";
          headerDiv.innerHTML = `
            <div class="subzona-title-wrap">
              <span class="subzona-badge-tag">Zona 1</span>
              <input type="text" class="subzona-rotulo-input" value="Geral" placeholder="Nome (ex: Geral)">
            </div>
          `;
          item0.prepend(headerDiv);
        }
      }

      // Cria a nova subzona (ex: Lábios, Fototipo V)
      const novaSubzonaObj = {
        rotulo: "Lábios / Mais escura",
        fototipo: "V",
        modo: "HR",
        energiaValor: "",
        energiaAnterior: "",
        temEnergiaAnterior: false,
        freqNum: 0.8,
        disparosNum: 150,
        obs: "",
        origEnergia: 0,
        origFototipo: "V",
        origModo: "HR"
      };

      const sNome = card.getAttribute("data-area-nome") || "Área";
      const novaSubHtml = gerarHtmlSubzonaItem(novaSubzonaObj, nextIdx, nextIdx + 1, sNome);
      container.insertAdjacentHTML("beforeend", novaSubHtml);

      if (nextIdx + 1 >= 4) {
        btnAddSub.style.display = "none";
      }

      const novoItem = container.lastElementChild;
      novoItem?.querySelector(".param-energia")?.focus();
      return;
    }

    // 6. Remover Subzona
    const btnRemoveSub = e.target.closest(".btn-remove-subzona");
    if (btnRemoveSub) {
      e.preventDefault();
      const subItem = btnRemoveSub.closest(".param-subzona-item");
      const card = subItem?.closest(".atend-param-form-card");
      if (!subItem || !card) return;

      subItem.remove();

      const container = card.querySelector(".param-subzonas-container");
      const remainingItems = container?.querySelectorAll(".param-subzona-item") || [];

      // Se sobrou apenas 1 subzona, simplifica de volta
      if (remainingItems.length === 1) {
        const item0 = remainingItems[0];
        item0.classList.remove("param-subzona-destacada");
        item0.querySelector(".subzona-header")?.remove();
        item0.querySelector(".subzona-sugestoes-row")?.remove();
      }

      const btnAdd = card.querySelector(".btn-add-subzona");
      if (btnAdd) btnAdd.style.display = "inline-flex";
      return;
    }

    // 7. Chips rápidos de sugestão de subzona (ex: Lábios, Face interna)
    const chipSugestao = e.target.closest(".subzona-sugestao-pill");
    if (chipSugestao) {
      e.preventDefault();
      const rotulo = chipSugestao.getAttribute("data-rotulo");
      const subItem = chipSugestao.closest(".param-subzona-item");
      const inputRotulo = subItem?.querySelector(".subzona-rotulo-input");
      if (inputRotulo && rotulo) {
        inputRotulo.value = rotulo;
        inputRotulo.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return;
    }
  });

  atendListaFormsLaser?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      const headerToggle = e.target.closest(".atend-area-toggle");
      if (headerToggle) {
        e.preventDefault();
        const card = headerToggle.closest(".atend-param-form-card");
        if (card) alternarCardArea(card);
      }
    }
  });

  btnSalvarParametrosLaser?.addEventListener("click", () => {
    if (verificarSeParametrosForamSalvos()) {
      alert(
        "Os parâmetros desta cliente já foram salvos hoje no prontuário do Belle!\n\n" +
        "Para não gerar registros duplicados no mesmo dia, uma nova gravação não será realizada.\n\n" +
        "Caso você deseje encerrar a consulta e vincular a atendente, clique em 'Finalizar Atendimento'."
      );
      return;
    }

    const parametros = coletarParametrosDosFormularios();
    if (parametros.length === 0) {
      alert("Nenhum formulário de parâmetro preenchido para salvar.");
      return;
    }

    const { possuiSemEvolucao, areasSemEvolucao } = verificarEvolucaoParametros(parametros);
    if (possuiSemEvolucao) {
      abrirModalTravaEvolucao(areasSemEvolucao, () => {
        salvarParametrosLaserDireto(parametros);
      });
    } else {
      salvarParametrosLaserDireto(parametros);
    }
  });

  btnAtendFinalizar?.addEventListener("click", () => {
    if (!state.selectedAppointment) return;
    executarFluxoFinalizacaoAtendimento(state.selectedAppointment);
  });

  btnAtendVoltar?.addEventListener("click", () => {
    if (typeof callbackAtivarAba === "function") callbackAtivarAba("tab-agenda");
  });

  // Toggle abrir/fechar do Histórico de Parâmetros Anteriores
  const headerToggleParametros = document.getElementById("atend-toggle-parametros");
  headerToggleParametros?.addEventListener("click", () => {
    alternarToggleParametros();
  });
  headerToggleParametros?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      alternarToggleParametros();
    }
  });
}
