/**
 * BELLE COPILOT - VIEW DE ATENDIMENTO CLÍNICO (APLICADORA / LASER)
 * Gerencia a ficha clínica da cliente, histórico de parâmetros, formulários com steppers e fluxo de finalização.
 */

import { state, limparCachesAtendimento } from '../core/state.js';
import { 
  buscarGetServicosApi, 
  buscarParametrosLaserApi, 
  buscarSaldoVendaPlanoApi, 
  salvarParametrosLaserEmLoteApi, 
  atualizarServicosAgendamentoApi,
  finalizarAtendimentoApi 
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
  verificarParametrosObrigatorios 
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
  // Renderiza na hora sem o sexo (áreas exclusivas ficam de fora só se a dedução
  // por áreas já bastar) e refina quando o cadastro responde.
  atualizarOfertasSugeridasAtendimento(app, saldoServicos, historicoLaser, null);

  const sexo = await obterSexoCliente(app?.codCliente);
  if (sexo && state.selectedAppointment?.codCliente === app?.codCliente) {
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
  if (!atendMultiAppBox || !atendMultiButtons) return;
  if (!appAtual) {
    atendMultiAppBox.style.display = "none";
    return;
  }

  const codCli = appAtual.codCliente;
  const nomeCli = (appAtual.clienteNome || "").toLowerCase().trim();

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

  if (agendamentosMesmoCliente.length <= 1) {
    atendMultiAppBox.style.display = "none";
    return;
  }

  agendamentosMesmoCliente.sort((a, b) => a.horario.localeCompare(b.horario));
  atendMultiAppBox.style.display = "block";
  if (atendMultiQtd) atendMultiQtd.textContent = agendamentosMesmoCliente.length;

  let btnsHtml = "";
  agendamentosMesmoCliente.forEach(a => {
    const isCurrent = String(a.id) === String(appAtual.id) || String(a.codConsulta) === String(appAtual.codConsulta);
    const procs = (a.arrServ && a.arrServ.length > 0) ? a.arrServ.map(s => s.nome).join(", ") : (a.procedimento || "Laser");
    const activeClass = isCurrent ? "active" : "";

    btnsHtml += `
      <button class="multi-app-btn ${activeClass}" data-id="${a.id}" data-consulta="${a.codConsulta}">
        <span class="multi-app-time">⏰ ${a.horario}</span>
        <span class="multi-app-proc" title="${procs}">✨ ${procs}</span>
        <span class="app-badge ${isCurrent ? 'badge-atendimento' : 'badge-confirmado'}">${isCurrent ? 'Em Tela' : a.statusFormatado || a.status}</span>
      </button>
    `;
  });

  atendMultiButtons.innerHTML = btnsHtml;

  atendMultiButtons.querySelectorAll(".multi-app-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-id");
      const targetCons = btn.getAttribute("data-consulta");
      const targetApp = state.appointmentsData.find(x => String(x.id) === String(targetId) || String(x.codConsulta) === String(targetCons));
      if (targetApp) {
        abrirAtendimento(targetApp);
      }
    });
  });
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
    const sCod = sHoje.cod_servico || sHoje.codServ || "";

    // Procura o saldo correspondente desta área no pacote retornado pela API
    const saldoItem = encontrarSaldoDoServico(sHoje, servicosSaldo);

    let realizadas = 0;
    let contratadas = 0;
    let saldo = 0;
    let pct = 0;
    let temSaldoInfo = false;

    if (saldoItem) {
      realizadas = parseInt(saldoItem.gasto || saldoItem.realizadas || saldoItem.qtd_executada || 0, 10);
      contratadas = parseInt(saldoItem.quantidade || saldoItem.contratadas || saldoItem.qtd_contratada || 10, 10);
      saldo = parseInt(saldoItem.saldo_atual || saldoItem.saldo || (contratadas - realizadas), 10);
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
            saldo = Math.max(0, contratadas - realizadas);
            pct = Math.min(100, Math.round((realizadas / Math.max(1, contratadas)) * 100));
            temSaldoInfo = true;
            break;
          }
        }
      }
    }

    html += `
      <div class="atend-service-card">
        <div class="atend-service-header">
          <span class="atend-service-name">✨ ${sNome}</span>
          ${temSaldoInfo ? `<span class="atend-service-progress">📊 Sessão ${realizadas}/${contratadas}</span>` : ''}
        </div>
        ${temSaldoInfo ? `
          <div class="atend-session-bar-wrap">
            <div class="atend-session-bar-fill" style="width: ${pct}%;"></div>
          </div>
        ` : ''}
        <div class="atend-service-footer">
          <span class="atend-service-code">🏷️ ${sCod ? `Cód: ${sCod}` : `Área #${idx + 1}`}</span>
          ${temSaldoInfo ? `<span class="atend-service-saldo">Restam: <strong>${saldo} sessões</strong></span>` : ''}
        </div>
      </div>
    `;
  });

  atendListaServicos.innerHTML = html;

  // Atualiza também os formulários de registro de parâmetros estritamente com as áreas de hoje
  renderizarFormulariosParametrosLaser(servicosHoje, state.ultimosRegistrosLaserCliente);

  if (state.selectedAppointment) {
    atualizarOfertasComSexo(state.selectedAppointment, servicosSaldo, state.ultimosRegistrosLaserCliente);
  }
}

export function renderizarParametrosLaser(registros) {
  if (!atendListaLaserParams) return;
  if (loadingLaserParams) loadingLaserParams.style.display = "none";

  state.ultimosRegistrosLaserCliente = Array.isArray(registros) ? registros : [];

  if (!Array.isArray(registros) || registros.length === 0) {
    if (atendLaserDataBadge) atendLaserDataBadge.textContent = "Sem registros";
    atendListaLaserParams.innerHTML = '<div style="font-size: 11px; color: #64748b; padding: 6px;">Nenhum parâmetro de laser anterior registrado para esta cliente.</div>';
    renderizarFormulariosParametrosLaser(state.currentListaServicosRegistro, []);
    return;
  }

  const primeiraDataHora = registros[0].data_hora;
  const diaRecente = primeiraDataHora ? primeiraDataHora.split(" ")[0] : "";
  const registrosUltimoDia = diaRecente ? registros.filter(r => r.data_hora && r.data_hora.startsWith(diaRecente)) : [registros[0]];

  if (atendLaserDataBadge && diaRecente) {
    atendLaserDataBadge.textContent = `Última Sessão: ${formatarDataPtBr(diaRecente)}`;
  }

  let cardsHtml = "";
  registrosUltimoDia.forEach(r => {
    const hora = r.data_hora ? r.data_hora.split(" ")[1]?.substring(0, 5) : "";
    let tagsHtml = "";
    if (r.fototipo) tagsHtml += `<span class="laser-tag laser-tag-fototipo">Fototipo: ${r.fototipo}</span>`;
    if (r.modo_aplicacao) tagsHtml += `<span class="laser-tag laser-tag-modo">Modo: ${r.modo_aplicacao}</span>`;
    if (r.energia) tagsHtml += `<span class="laser-tag">Energia: ${r.energia}</span>`;
    if (r.frequencia) tagsHtml += `<span class="laser-tag">Freq: ${r.frequencia}</span>`;
    if (r.largura_pulso) tagsHtml += `<span class="laser-tag">Pulso: ${r.largura_pulso}</span>`;
    if (r.qtd_disparos) tagsHtml += `<span class="laser-tag">Disparos: ${r.qtd_disparos}</span>`;

    cardsHtml += `
      <div class="atend-laser-card">
        <div class="atend-laser-header">
          <span class="atend-laser-area">⚡ ${r.area || 'Área Geral'}</span>
          ${hora ? `<span class="atend-laser-time">⏰ ${hora}</span>` : ''}
        </div>
        ${r.profissional ? `<div class="atend-laser-prof">👩‍⚕️ Aplicado por: <strong>${r.profissional}</strong></div>` : ''}
        ${tagsHtml ? `<div class="atend-laser-tags">${tagsHtml}</div>` : ''}
        ${r.observacao ? `<div class="atend-laser-obs">${r.observacao}</div>` : '<div style="font-size:11px; color:#94a3b8; font-style:italic;">Sem observações adicionais.</div>'}
      </div>
    `;
  });

  atendListaLaserParams.innerHTML = cardsHtml;
  renderizarFormulariosParametrosLaser(state.currentListaServicosRegistro, state.ultimosRegistrosLaserCliente);

  if (state.selectedAppointment) {
    atualizarOfertasComSexo(state.selectedAppointment, state.lastSaldoServicosCache, state.ultimosRegistrosLaserCliente);
  }
}

export function gerarHtmlSubzonaItem(sub, subIdx, totalSubzonas, sNome) {
  const isMulti = totalSubzonas > 1;
  const rotulo = sub.rotulo || (subIdx === 0 ? "Geral" : `Sub-Zona ${subIdx + 1}`);
  const energiaValor = sub.energiaValor || (sub.temEnergiaAnterior ? sub.energiaAnterior : "");
  const temEnergiaAnterior = sub.temEnergiaAnterior;
  const freqNum = sub.freqNum || 0.8;
  const disparosNum = sub.disparosNum || (subIdx > 0 ? 150 : 200);
  const modoHist = (sub.origModo === 'HR' || sub.modo === 'HR' || !sub.origModo) ? 'HR (Pontual)' : (sub.origModo || sub.modo || 'HR (Pontual)');

  return `
    <div class="param-subzona-item ${isMulti ? 'param-subzona-destacada' : ''}" 
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

        ${subIdx > 0 ? `
          <div class="subzona-sugestoes-row">
            <span class="subzona-sugestao-pill" data-rotulo="Lábios / Mais escura">Lábios</span>
            <span class="subzona-sugestao-pill" data-rotulo="Face Interna">Face Interna</span>
            <span class="subzona-sugestao-pill" data-rotulo="Púbis / Externa">Púbis</span>
            <span class="subzona-sugestao-pill" data-rotulo="Buço">Buço</span>
            <span class="subzona-sugestao-pill" data-rotulo="Face Externa">Face Externa</span>
          </div>
        ` : ''}
      ` : ''}

      ${temEnergiaAnterior ? `
        <div class="param-historico-ref">
          <span class="param-hist-icon">📌</span>
          <span>Última aplicação ${isMulti ? `[${rotulo}]` : ''}: <strong>${sub.energiaAnterior}J</strong> • Fototipo ${sub.origFototipo || sub.fototipo} • ${modoHist}</span>
        </div>
      ` : `
        <div class="param-historico-ref param-historico-novo">
          <span class="param-hist-icon">🛡️</span>
          <span>${isMulti ? `Sub-zona [${rotulo}]: ` : ''}Sem histórico anterior. Defina os parâmetros para esta sessão.</span>
        </div>
      `}

      <!-- Linha 1: Fototipo & Modo de Disparo -->
      <div class="param-grid-duo">
        <div class="param-field">
          <label class="param-label">
            <span>👤 Fototipo</span>
          </label>
          <select class="param-input param-fototipo">
            <option value="I" ${sub.fototipo === 'I' ? 'selected' : ''}>Fototipo I (Muito clara)</option>
            <option value="II" ${sub.fototipo === 'II' ? 'selected' : ''}>Fototipo II (Clara)</option>
            <option value="III" ${sub.fototipo === 'III' ? 'selected' : ''}>Fototipo III (Morena clara)</option>
            <option value="IV" ${sub.fototipo === 'IV' || !sub.fototipo ? 'selected' : ''}>Fototipo IV (Morena média)</option>
            <option value="V" ${sub.fototipo === 'V' ? 'selected' : ''}>Fototipo V (Morena escura)</option>
            <option value="VI" ${sub.fototipo === 'VI' ? 'selected' : ''}>Fototipo VI (Negra)</option>
          </select>
        </div>

        <div class="param-field">
          <label class="param-label">
            <span>⚡ Modo</span>
          </label>
          <select class="param-input param-modo">
            <option value="HR" ${sub.modo === 'HR' || !sub.modo ? 'selected' : ''}>HR (Pontual)</option>
            <option value="SHR" ${sub.modo === 'SHR' ? 'selected' : ''}>SHR (Varredura)</option>
          </select>
        </div>
      </div>

      <!-- Linha 2: Energia Principal (Joules) em Destaque -->
      <div class="param-field param-field-energia-hero">
        <div class="param-label param-label-energia">
          <span>⚡ Energia Aplicada Hoje</span>
          <span class="param-label-unit">Joules (J)</span>
        </div>
        <div class="param-stepper-wrap param-stepper-energia">
          <button type="button" class="btn-param-step" data-delta="-1" title="Diminuir 1J">−1</button>
          <div class="param-input-with-unit">
            <input type="number" step="1" min="0" max="100" class="param-input param-energia" value="${energiaValor}" placeholder="Definir J" ${!temEnergiaAnterior ? 'data-sem-historico="1"' : ''}>
            <span class="param-unit-tag">J</span>
          </div>
          <button type="button" class="btn-param-step" data-delta="1" title="Aumentar 1J">+1</button>
        </div>
      </div>

      <!-- Linha 3: Frequência & Disparos -->
      <div class="param-grid-duo">
        <div class="param-field">
          <label class="param-label">
            <span>⏱️ Frequência</span>
            <span class="param-label-unit">Hz</span>
          </label>
          <div class="param-stepper-wrap">
            <button type="button" class="btn-param-step" data-delta="-0.1" title="Diminuir 0.1Hz">−</button>
            <div class="param-input-with-unit">
              <input type="number" step="0.1" min="0.1" max="10.0" class="param-input param-frequencia" value="${freqNum}">
              <span class="param-unit-tag">Hz</span>
            </div>
            <button type="button" class="btn-param-step" data-delta="0.1" title="Aumentar 0.1Hz">+</button>
          </div>
        </div>

        <div class="param-field">
          <label class="param-label">
            <span>🎯 Disparos</span>
            <span class="param-label-unit">shots</span>
          </label>
          <div class="param-stepper-wrap">
            <button type="button" class="btn-param-step" data-delta="-50" title="Diminuir 50 disparos">−</button>
            <div class="param-input-with-unit">
              <input type="number" step="50" min="0" max="5000" class="param-input param-disparos" value="${disparosNum}">
              <span class="param-unit-tag">qtd</span>
            </div>
            <button type="button" class="btn-param-step" data-delta="50" title="Aumentar 50 disparos">+</button>
          </div>
        </div>
      </div>

      ${isMulti ? `
        <div class="param-field" style="margin-top: 6px;">
          <input type="text" class="param-input param-obs" placeholder="Observação da sub-zona [${rotulo}] (opcional)" value="">
        </div>
      ` : ''}
    </div>
  `;
}

export function renderizarFormulariosParametrosLaser(listaServicos, historicoRegistros) {
  if (!atendListaFormsLaser) return;
  
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

  let formsHtml = "";
  state.currentListaServicosRegistro.forEach((s, idx) => {
    const sCod = s.codServ || s.cod_servico || (55556400 + idx);
    const sNome = s.nome || `Área #${idx + 1}`;
    const areaFormatada = `${sCod} - ${sNome}`;

    // Puxa automaticamente as sub-zonas anteriores da cliente se houver histórico dividido
    const subzonas = extrairSubzonasHistorico(sNome, historico, sCod, state.currentPerfilCliente);
    const subzonasHtml = subzonas.map((sub, sIdx) => gerarHtmlSubzonaItem(sub, sIdx, subzonas.length, sNome)).join("");

    formsHtml += `
      <div class="atend-param-form-card" 
           data-idx="${idx}"
           data-cod-serv="${sCod}" 
           data-area-nome="${sNome}"
           data-area-formatada="${areaFormatada}"
           data-status="realizada">
        
        <div class="param-form-header">
          <div class="param-header-title-row">
            <span class="param-form-title" title="${areaFormatada}">✨ ${sNome}</span>
          </div>
          <div class="param-header-controls-row">
            <span class="param-form-tag">Área ${idx + 1} de ${state.currentListaServicosRegistro.length}</span>
            <div class="param-status-toggle">
              <button type="button" class="btn-toggle-status status-realizada active" data-status="realizada" title="Área realizada normalmente na sessão de hoje">
                ✅ Realizada
              </button>
              <button type="button" class="btn-toggle-status status-nao-realizada" data-status="nao_realizada" title="Área não realizada (sensibilidade, dor, etc.)">
                ❌ Não Realizada
              </button>
            </div>
          </div>
        </div>

        <!-- SEÇÃO QUANDO REALIZADA (Com Suporte a Subzonas de Fototipo Misto) -->
        <div class="param-section-realizada">
          <div class="param-subzonas-container">
            ${subzonasHtml}
          </div>

          <div class="param-add-subzona-row">
            <button type="button" class="btn-add-subzona" title="Dividir esta área para aplicar com outro fototipo ou energia diferente">
              ➕ Dividir por Sub-Zona / Fototipo Misto (ex: Lábios, Face interna)
            </button>
          </div>

          <div class="param-field" style="margin-top: 10px;">
            <label style="display: flex; justify-content: space-between; align-items: center;">
              <span>Observações Clínicas da Área:</span>
              <span style="font-weight: normal; font-size: 10px; color: #8b5cf6;">💡 Opções rápidas</span>
            </label>
            <div class="param-obs-pills-row">
              <span class="obs-pill" data-text="Boa tolerância">👍 Boa tolerância</span>
              <span class="obs-pill" data-text="Pele íntegra">✨ Pele íntegra</span>
              <span class="obs-pill" data-text="Sensibilidade leve">⚡ Sensibilidade leve</span>
              <span class="obs-pill" data-text="Hiperemia leve">🔴 Hiperemia leve</span>
              <span class="obs-pill" data-text="Pelos finos">🔍 Pelos finos</span>
              <span class="obs-pill" data-text="Pelos grossos">💥 Pelos grossos</span>
              <span class="obs-pill" data-text="Sem intercorrências">✅ Sem intercorrências</span>
            </div>
            <input type="text" class="param-input param-obs" placeholder="ex: ${sNome.split(' - ')[0]} • Boa tolerância" value="">
          </div>
        </div>

        <!-- SEÇÃO QUANDO NÃO REALIZADA -->
        <div class="param-section-nao-realizada" style="display: none;">
          <div class="param-skip-alert">
            <span class="param-skip-alert-icon">🛡️</span>
            <div class="param-skip-alert-text">
              <strong>Área não realizada na sessão de hoje.</strong><br>
              Esta área será removida do agendamento para <strong>preservar a sessão no saldo do plano</strong> da cliente.
            </div>
          </div>

          <div class="param-skip-options">
            <label class="param-skip-chk-wrap">
              <input type="checkbox" class="chk-remover-agendamento" checked>
              <span>Remover do agendamento (não descontar sessão no Belle)</span>
            </label>

            <div class="param-field" style="margin-top: 6px;">
              <label style="display: flex; justify-content: space-between; align-items: center;">
                <span>Motivo da Não Realização:</span>
                <span style="font-weight: normal; font-size: 10px; color: #e11d48;">Motivos rápidos</span>
              </label>
              <div class="param-skip-pills-row">
                <span class="skip-pill" data-reason="Sensibilidade / Não tolerou o laser">⚡ Sensibilidade / Dor</span>
                <span class="skip-pill" data-reason="Pele sensível / Lesão no local">🩹 Pele sensível / Lesão</span>
                <span class="skip-pill" data-reason="Exposição solar recente / Bronzeada">☀️ Sol recente / Bronzeada</span>
                <span class="skip-pill" data-reason="Período menstrual / Hipersensibilidade">🩸 Período menstrual</span>
                <span class="skip-pill" data-reason="Cliente desistiu / Sem tempo hoje">⏱️ Sem tempo / Desistência</span>
                <span class="skip-pill" data-reason="Área com pelos não raspados">🔍 Pelos não raspados</span>
              </div>
              <input type="text" class="param-input param-skip-obs" placeholder="ex: Sensibilidade excessiva / Pele reativa no dia" value="">
            </div>
          </div>
        </div>
      </div>
    `;
  });

  atendListaFormsLaser.innerHTML = formsHtml;
}

export async function salvarParametrosLaserDireto(parametros) {
  if (!btnSalvarParametrosLaser) return { success: false, error: "Formulário indisponível" };

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
      if (!(parseFloat(inp.value) > 0)) inp.classList.add("param-input-erro");
    });
    return { success: false, bloqueado: true, error: `Energia não informada em: ${nomes}` };
  }

  document.querySelectorAll(".param-energia.param-input-erro").forEach(inp => inp.classList.remove("param-input-erro"));

  btnSalvarParametrosLaser.disabled = true;
  btnSalvarParametrosLaser.textContent = "⏳ Gravando no Belle...";

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

    btnSalvarParametrosLaser.textContent = "✅ Parâmetros Salvos!";
    btnSalvarParametrosLaser.style.background = "#16a34a";
    if (atendStatusSalvarLaser) {
      atendStatusSalvarLaser.className = "param-save-status status-success";
      atendStatusSalvarLaser.textContent = msgSucesso;
    }

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
      btnSalvarParametrosLaser.disabled = false;
      btnSalvarParametrosLaser.textContent = "💾 Salvar Parâmetros (Todas as Áreas)";
      btnSalvarParametrosLaser.style.background = "";
      if (atendStatusSalvarLaser) atendStatusSalvarLaser.style.display = "none";
    }, 4000);
  } else {
    btnSalvarParametrosLaser.disabled = false;
    btnSalvarParametrosLaser.textContent = "💾 Salvar Parâmetros (Todas as Áreas)";
    btnSalvarParametrosLaser.style.background = "";
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

  const isAval = app.isAvaliacao ?? ehAgendamentoAvaliacao(app);

  // Se for AVALIAÇÃO: não há parâmetros técnicos de laser nem evolução a validar
  if (isAval) {
    if (btnAtendFinalizar) {
      btnAtendFinalizar.disabled = true;
      btnAtendFinalizar.textContent = "⏳ Concluindo avaliação...";
    }

    const codConsulta = app.codConsulta || app.id;
    const sucesso = await finalizarAtendimentoApi(state.currentToken, codConsulta, state.currentCodEstab);

    if (btnAtendFinalizar) {
      btnAtendFinalizar.disabled = false;
      btnAtendFinalizar.textContent = "✅ Concluir Avaliação";
    }

    if (sucesso) {
      app.status = "finalizado";
      app.statusFormatado = "Atendido";
      if (atendStatusBadge) {
        atendStatusBadge.className = "app-badge badge-finalizado";
        atendStatusBadge.textContent = "Atendido";
      }

      limparCachesAtendimento();

      if (typeof callbackRecarregarAgenda === "function") {
        callbackRecarregarAgenda();
      }

      // Sugere agendar primeira sessão ou pacote
      abrirModalProximoAgendamento(app, []);
    } else {
      alert("Não foi possível concluir a avaliação no Belle. Verifique a conexão e tente novamente.");
    }
    return;
  }

  const parametrosParaSalvar = coletarParametrosDosFormularios();
  const areasRealizadas = parametrosParaSalvar.filter(p => p.isRealizada !== false);
  const areasNaoRealizadas = parametrosParaSalvar.filter(p => p.isRealizada === false);
  const areasParaRemover = areasNaoRealizadas.filter(p => p.removerDoAgendamento !== false);

  // Trava antes de tocar no agendamento: área realizada sem energia não pode ser finalizada.
  const { possuiPendencia, areasSemEnergia } = verificarParametrosObrigatorios(parametrosParaSalvar);
  if (possuiPendencia) {
    const nomes = areasSemEnergia.map(a => a.nomeArea || a.area).join(", ");
    document.querySelectorAll('.param-energia[data-sem-historico="1"]').forEach(inp => {
      if (!(parseFloat(inp.value) > 0)) inp.classList.add("param-input-erro");
    });
    if (atendStatusSalvarLaser) {
      atendStatusSalvarLaser.style.display = "block";
      atendStatusSalvarLaser.className = "param-save-status status-error";
      atendStatusSalvarLaser.textContent = `Informe a energia (J) aplicada hoje em: ${nomes}.`;
    }
    alert(`Não é possível finalizar: informe a energia (J) aplicada hoje em ${nomes}.`);
    return;
  }

  const { possuiSemEvolucao, areasSemEvolucao } = verificarEvolucaoParametros(parametrosParaSalvar);

  const executarSalvarEFinalizar = async () => {
    if (btnAtendFinalizar) {
      btnAtendFinalizar.disabled = true;
      btnAtendFinalizar.textContent = "⏳ Processando...";
    }

    // 1. Sincronização Inteligente com o Belle: remove áreas não realizadas do agendamento para NÃO descontar sessões
    if (areasParaRemover.length > 0 && areasRealizadas.length > 0) {
      if (btnAtendFinalizar) btnAtendFinalizar.textContent = "⏳ Ajustando agendamento...";
      
      const servicosParaManter = (app.arrServ && app.arrServ.length > 0)
        ? app.arrServ.filter(s => {
            const sNomeNorm = (s.nome || "").toLowerCase().trim();
            const sCod = String(s.codServ || s.cod_servico || "");
            return areasRealizadas.some(r => {
              const rNomeNorm = (r.nomeArea || "").toLowerCase().trim();
              const rCod = String(r.codServ || "");
              return (rCod && sCod && rCod === sCod) || rNomeNorm.includes(sNomeNorm) || sNomeNorm.includes(rNomeNorm);
            });
          })
        : [];

      if (servicosParaManter.length > 0 && servicosParaManter.length < (app.arrServ || []).length) {
        console.log(`[Atendimento] ✂️ Removendo ${areasParaRemover.length} área(s) não realizada(s) do agendamento para não descontar do pacote da cliente.`);
        await atualizarServicosAgendamentoApi(state.currentToken, app, servicosParaManter, state.currentCodEstab);
        app.arrServ = servicosParaManter;
        limparCachesAtendimento();
      }
    }

    // 2. Salva parâmetros do laser (disparos nas realizadas e notas de intercorrência nas não realizadas)
    if (parametrosParaSalvar.length > 0) {
      const resSalvar = await salvarParametrosLaserDireto(parametrosParaSalvar);

      // Só finaliza a consulta se TODAS as áreas entraram no prontuário. Encerrar com
      // gravação parcial deixaria a sessão debitada sem a evolução clínica correspondente.
      if (!resSalvar || !resSalvar.success) {
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

    // 3. Finaliza oficialmente a consulta no Belle
    if (btnAtendFinalizar) {
      btnAtendFinalizar.textContent = "⏳ Concluindo...";
    }

    const codConsulta = app.codConsulta || app.id;
    const sucesso = await finalizarAtendimentoApi(state.currentToken, codConsulta, state.currentCodEstab);

    if (btnAtendFinalizar) {
      btnAtendFinalizar.disabled = false;
      btnAtendFinalizar.textContent = "✅ Finalizar Atendimento";
    }

    if (sucesso) {
      app.status = "finalizado";
      app.statusFormatado = "Atendido";
      if (atendStatusBadge) {
        atendStatusBadge.className = "app-badge badge-finalizado";
        atendStatusBadge.textContent = "Atendido";
      }

      limparCachesAtendimento();

      const codCli = app.codCliente;
      const nomeCli = (app.clienteNome || "").toLowerCase().trim();
      const horaAtual = app.horario || "00:00";

      const proximoAgendamentoHoje = (state.appointmentsData || []).find(a => {
        if (String(a.id) === String(app.id) || String(a.codConsulta) === String(app.codConsulta)) return false;
        if (a.isBloqueado || a.status === "bloqueado" || a.status === "finalizado") return false;

        const mesmoCliente = (codCli && a.codCliente && String(a.codCliente) === String(codCli)) ||
                             (nomeCli && a.clienteNome && a.clienteNome.toLowerCase().trim() === nomeCli);
        if (!mesmoCliente) return false;

        return a.horario >= horaAtual;
      });

      if (proximoAgendamentoHoje) {
        abrirModalProximoAgendamento(app.clienteNome, proximoAgendamentoHoje, (prox) => {
          abrirAtendimento(prox);
        });
      } else {
        // Encontra a próxima cliente da fila (preferência: status "aguardando", ou próximo agendamento do dia)
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
      }
    } else {
      alert("Não foi possível finalizar o agendamento no Belle. Verifique a conexão.");
    }
  };

  if (possuiSemEvolucao) {
    abrirModalTravaEvolucao(areasSemEvolucao, () => {
      executarSalvarEFinalizar();
    });
  } else {
    executarSalvarEFinalizar();
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

  if (atendimentoPlaceholder) atendimentoPlaceholder.style.display = "none";
  if (atendimentoContent) atendimentoContent.style.display = "flex";

  if (atendHorario) atendHorario.textContent = `⏰ ${app.horario || '00:00'} - ${app.hrFim || '00:00'} (${app.duracaoMin || 0}m)`;
  
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

  if (atendNomeCliente) atendNomeCliente.textContent = app.clienteNome || "Cliente";
  if (atendCodPaciente) atendCodPaciente.textContent = app.codCliente ? `#${app.codCliente}` : "N/A";
  if (atendCpf) atendCpf.textContent = app.cpf || "Não informado";
  if (atendTelefone) atendTelefone.textContent = app.telefone || "Não informado";
  if (atendSala) atendSala.textContent = app.salaNome || app.sala || "Geral";
  if (atendProfissional) atendProfissional.textContent = app.profissional || "Não informada";
  if (atendCodConsulta) atendCodConsulta.textContent = app.codConsulta ? `#${app.codConsulta}` : (app.id ? `#${app.id}` : "N/A");

  if (atendTagsBox) {
    let tagsHtml = "";
    if (app.questPendente) tagsHtml += `<span class="tag-alert-quest">⚠️ Questionário Pendente</span>`;
    if (app.fazAniver) tagsHtml += `<span class="tag-alert-aniver">🎂 Aniversariante</span>`;
    if (app.tagsCliente) {
      const clientTags = app.tagsCliente.split(",").map(t => t.trim()).filter(Boolean);
      clientTags.forEach(tag => {
        tagsHtml += `<span class="tag-alert-client">🏷️ ${tag}</span>`;
      });
    }

    if (tagsHtml) {
      atendTagsBox.innerHTML = tagsHtml;
      atendTagsBox.style.display = "flex";
    } else {
      atendTagsBox.style.display = "none";
    }
  }

  renderizarMultiplosAgendamentosHoje(app);

  // Pacote / Contrato
  if (atendNomePlano) atendNomePlano.textContent = app.nomePlano || app.procedimento || "Atendimento Avulso / Procedimento";
  if (atendCodOrcamento) {
    if (app.codOrcamento) {
      atendCodOrcamento.textContent = `Orçamento / Venda: #${app.codOrcamento}`;
      atendCodOrcamento.style.display = "inline-block";
    } else {
      atendCodOrcamento.style.display = "none";
    }
  }

  // Lista de Serviços & Áreas
  let listaServicos = (app.arrServ && app.arrServ.length > 0) ? [...app.arrServ] : [];

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
        cod_servico: idx === 0 && servicosExtras.cod_serv ? servicosExtras.cod_serv : ""
      });
    });
  }

  if (listaServicos.length === 0 && app.procedimento) {
    listaServicos.push({
      nome: app.procedimento,
      cod_servico: app.codTipo || ""
    });
  }

  state.currentServicosAgendadosHoje = [...listaServicos];
  state.currentListaServicosRegistro = [...listaServicos];

  if (atendQtdServicos) atendQtdServicos.textContent = `${listaServicos.length} área${listaServicos.length === 1 ? '' : 's'}`;

  // Mapeamento de progresso de lbServ (ex: "AXILAS (P) - depilação a laser - 15/40")
  const progressoMap = new Map();
  if (app.lbServ) {
    const linhas = app.lbServ.split("<br>").map(l => l.trim()).filter(Boolean);
    linhas.forEach(l => {
      const match = l.match(/(.+?)\s*-\s*(\d+\/\d+)/);
      if (match) {
        progressoMap.set(match[1].trim().toLowerCase(), match[2]);
      }
    });
  }

  // 1. Renderização visual IMEDIATA das áreas com barras de sessões (0ms)
  let cardsHtml = "";
  listaServicos.forEach((s, idx) => {
    const sNome = s.nome || `Procedimento #${idx + 1}`;
    const sCod = s.cod_servico ? `Cód: ${s.cod_servico}` : `Área #${idx + 1}`;
    
    // Procura progresso de sessões no lbServ
    let progressoTxt = "";
    let sFeitas = 0;
    let sTotal = 0;
    let perc = 0;
    for (const [k, v] of progressoMap.entries()) {
      if (sNome.toLowerCase().includes(k) || k.includes(sNome.toLowerCase().substring(0, 8))) {
        progressoTxt = `📊 Sessão ${v}`;
        const parts = v.split("/");
        if (parts.length === 2) {
          sFeitas = Number(parts[0]) || 0;
          sTotal = Number(parts[1]) || 0;
          if (sTotal > 0) perc = Math.min(100, Math.round((sFeitas / sTotal) * 100));
        }
        break;
      }
    }

    cardsHtml += `
      <div class="atend-service-card">
        <div class="atend-service-header">
          <span class="atend-service-name">✨ ${sNome}</span>
          ${progressoTxt ? `<span class="atend-service-progress">${progressoTxt}</span>` : ''}
        </div>
        ${sTotal > 0 ? `
          <div class="atend-session-bar-wrap">
            <div class="atend-session-bar-fill" style="width: ${perc}%;"></div>
          </div>
        ` : ''}
        <div class="atend-service-footer">
          <span class="atend-service-code">🏷️ ${sCod}</span>
          ${sTotal > 0 ? `<span class="atend-service-saldo">Restam: <strong>${sTotal - sFeitas} sessões</strong></span>` : ''}
        </div>
      </div>
    `;
  });

  if (atendListaServicos) {
    atendListaServicos.innerHTML = cardsHtml || '<div style="font-size: 12px; color: #64748b; padding: 8px;">Nenhum procedimento discriminado.</div>';
  }

  const isAvaliacao = app.isAvaliacao ?? ehAgendamentoAvaliacao(app);

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
      btnAtendFinalizar.textContent = "✅ Concluir Avaliação";
      btnAtendFinalizar.style.background = "#0284c7";
      btnAtendFinalizar.style.borderColor = "#0369a1";
    }
  } else {
    if (cardParametros) cardParametros.style.display = "block";
    if (cardNovoParametro) cardNovoParametro.style.display = "block";
    if (cardAvaliacao) cardAvaliacao.style.display = "none";

    if (btnAtendFinalizar) {
      btnAtendFinalizar.textContent = "✅ Finalizar Atendimento";
      btnAtendFinalizar.style.background = "#16a34a";
      btnAtendFinalizar.style.borderColor = "#15803d";
    }

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

  // 2. Busca o saldo exato e oficial de cada área via saldovendaplano usando cod_plano_paciente (se houver pacote)
  if (!isAvaliacao && app.codOrcamento && state.currentToken) {
    buscarSaldoVendaPlanoApi(state.currentToken, app.codOrcamento, app.codPlano, app.idGeinfo, state.currentCodEstab)
      .then(resSaldo => {
        if (Array.isArray(resSaldo) && resSaldo.length > 0) {
          renderizarServicosComSaldo(resSaldo);
          if (app.codOrcamento) {
            registrarSaldoCapturado(app.codOrcamento, resSaldo);
          }
        }
      })
      .catch(() => {});
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

export function inicializarAtendimentoView({ onAtivarAba, onRecarregarAgenda } = {}) {
  callbackAtivarAba = onAtivarAba;
  callbackRecarregarAgenda = onRecarregarAgenda;

  atendListaFormsLaser?.addEventListener("click", (e) => {
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

  btnSalvarParametrosLaser?.addEventListener("click", () => {
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
}
