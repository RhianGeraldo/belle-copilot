/**
 * BELLE COPILOT - MODAL DE AGENDAMENTO DA PRÓXIMA SESSÃO (RECEPÇÃO / COMERCIAL)
 * - Suporta agendamento sequencial em lote para clientes com múltiplos planos/pacotes;
 * - Agrupa áreas por plano, soma a duração unificada total e busca slots contínuos na sala;
 * - Ao selecionar o horário, divide automaticamente em agendamentos consecutivos (ex: 14:00 às 14:10 e 14:10 às 14:30).
 */

import { state } from '../core/state.js';
import { 
  buscarSaldoVendaPlanoApi, 
  buscarVendasPlanosClienteApi,
  buscarTurnosValidosApi, 
  buscarServicosCatalogoApi, 
  buscarGridSalaApi,
  buscarAgendaApi, 
  montarArrGridDeGridSala 
} from '../core/api-client.js';

const modalAgendarProxima = document.getElementById("modal-agendar-proxima");
const modalAgendaNomeCliente = document.getElementById("modal-agenda-nome-cliente");
const modalAgendaInfoPaciente = document.getElementById("modal-agenda-info-paciente");
const modalAgendaContextoHoje = document.getElementById("modal-agenda-contexto-hoje");
const modalAgendaBadgeRegra = document.getElementById("modal-agenda-badge-regra");
const modalAgendaTipoProximoBadge = document.getElementById("modal-agenda-tipo-proximo-badge");
const modalAgendaLblData = document.getElementById("modal-agenda-lbl-data");
const modalAgendaDataBrDisplay = document.getElementById("modal-agenda-data-br-display");
const modalAgendaListaServicos = document.getElementById("modal-agenda-lista-servicos");
const modalAgendaInputDataBr = document.getElementById("modal-agenda-input-data-br");
const modalAgendaPicker = document.getElementById("modal-agenda-picker");
const btnModalAgendaAbrirCalendario = document.getElementById("btn-modal-agenda-abrir-calendario");
const modalAgendaDuracaoBadge = document.getElementById("modal-agenda-duracao-badge");
const modalAgendaSelectHorario = document.getElementById("modal-agenda-select-horario");
const modalAgendaDisponibilidadeStatus = document.getElementById("modal-agenda-disponibilidade-status");
const modalAgendaSequencialPreview = document.getElementById("modal-agenda-sequencial-preview");
const modalAgendaSequencialLista = document.getElementById("modal-agenda-sequencial-lista");
const modalAgendaSelectSala = document.getElementById("modal-agenda-select-sala");
const btnCancelarAgendarProxima = document.getElementById("btn-cancelar-agendar-proxima");
const btnConfirmarAgendarProxima = document.getElementById("btn-confirmar-agendar-proxima");

let callbackSalvar = null;
let currentAppAgendamento = null;
let tipoProcedimentoAtual = "depilacao"; // "depilacao" ou "clareamento"
let debounceDisponibilidadeTimer = null;
let planosEstruturadosCache = [];

const DIAS_SEMANA = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado"
];

/**
 * Converte horário string "HH:MM" em minutos desde meia-noite
 */
function horaParaMinutos(horaStr = "") {
  if (!horaStr) return 0;
  const partes = String(horaStr).trim().split(":");
  return (Number(partes[0]) || 0) * 60 + (Number(partes[1]) || 0);
}

/**
 * Converte minutos desde meia-noite em string "HH:MM"
 */
function minutosParaHora(minutos = 0) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Identifica se um texto / serviço refere-se a Clareamento ou Depilação a Laser
 */
export function identificarTipoProcedimento(texto = "") {
  if (!texto) return "depilacao";
  const t = texto.toLowerCase();
  if (
    t.includes("claream") || 
    t.includes("clareador") || 
    t.includes("peeling") || 
    t.includes("black peel") || 
    t.includes("melasma") ||
    t.includes("manchas")
  ) {
    return "clareamento";
  }
  return "depilacao";
}

/**
 * Calcula o intervalo clínico exato em dias
 */
export function calcularIntervaloClinico(tipoOrigem, tipoDestino) {
  if (tipoOrigem === "depilacao" && tipoDestino === "depilacao") return 45;
  if (tipoOrigem === "clareamento" && tipoDestino === "clareamento") return 45;
  if (tipoOrigem === "depilacao" && tipoDestino === "clareamento") return 25;
  if (tipoOrigem === "clareamento" && tipoDestino === "depilacao") return 25;
  return 45;
}

/**
 * Obtém a data base de hoje para o cálculo
 */
function obterDataBaseAgendamento(app) {
  let dataBase = new Date();
  
  if (state.currentDataAgenda && /^\d{4}-\d{2}-\d{2}$/.test(state.currentDataAgenda)) {
    const [y, m, d] = state.currentDataAgenda.split("-").map(Number);
    dataBase = new Date(y, m - 1, d);
  } else if (state.currentDataAgenda && /^\d{2}\/\d{2}\/\d{4}$/.test(state.currentDataAgenda)) {
    const [d, m, y] = state.currentDataAgenda.split("/").map(Number);
    dataBase = new Date(y, m - 1, d);
  }

  return dataBase;
}

/**
 * Converte data DD/MM/YYYY para YYYY-MM-DD
 */
function dataBrParaIso(dataBr = "") {
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dataBr)) {
    const [d, m, y] = dataBr.split("/");
    return `${y}-${m}-${d}`;
  }
  return dataBr;
}

/**
 * Define e formata a data nos campos em formato DD/MM/YYYY
 */
function setarDataNoModal(dataObj) {
  if (!dataObj || isNaN(dataObj.getTime())) return;
  
  const dd = String(dataObj.getDate()).padStart(2, "0");
  const mm = String(dataObj.getMonth() + 1).padStart(2, "0");
  const yyyy = dataObj.getFullYear();
  const dataBr = `${dd}/${mm}/${yyyy}`;
  const dataIso = `${yyyy}-${mm}-${dd}`;
  const diaSemana = DIAS_SEMANA[dataObj.getDay()] || "";

  if (modalAgendaInputDataBr) {
    modalAgendaInputDataBr.value = dataBr;
  }
  if (modalAgendaPicker) {
    modalAgendaPicker.value = dataIso;
  }
  if (modalAgendaDataBrDisplay) {
    modalAgendaDataBrDisplay.textContent = `📅 ${diaSemana}`;
  }
}

/**
 * Retorna o tempo individual de um serviço em minutos
 */
function obterTempoServico(nomeServ = "") {
  const nomeNorm = String(nomeServ).toLowerCase().trim();
  const catalogo = state.servicosCatalogo || [];

  if (catalogo.length > 0) {
    const match = catalogo.find(c => {
      const cNome = (c.nome || "").toLowerCase().trim();
      return cNome === nomeNorm || cNome.includes(nomeNorm) || nomeNorm.includes(cNome);
    });
    if (match && match.tempo) return Number(match.tempo);
  }

  if (nomeNorm.includes("(g)") || nomeNorm.includes("inteir") || nomeNorm.includes("completa")) return 10;
  if (nomeNorm.includes("(m)")) return 5;
  return 5;
}

/**
 * Mapeia e calcula a duração por plano e total
 */
export function calcularPlanosEServicosSelecionados() {
  const checkedInputs = modalAgendaListaServicos?.querySelectorAll("input[name='servico_agendar']:checked") || [];
  const planosMap = new Map();

  checkedInputs.forEach(chk => {
    const sNome = chk.value;
    const codOrc = chk.getAttribute("data-plano-orc") || currentAppAgendamento?.codOrcamento || "padrao";
    const nomePlano = chk.getAttribute("data-plano-nome") || currentAppAgendamento?.nomePlano || "Plano de Sessões";
    const codPlano = chk.getAttribute("data-plano-cod") || currentAppAgendamento?.codPlano || "";
    const tempoServ = Number(chk.getAttribute("data-tempo")) || obterTempoServico(sNome);

    if (!planosMap.has(codOrc)) {
      planosMap.set(codOrc, {
        codOrcamento: codOrc,
        codPlano: codPlano,
        nomePlano: nomePlano,
        duracaoMin: 0,
        servicos: []
      });
    }

    const p = planosMap.get(codOrc);
    p.duracaoMin += tempoServ;
    p.servicos.push({ nome: sNome, tempo: tempoServ });
  });

  const planosArray = Array.from(planosMap.values());
  let duracaoTotalGeral = 0;
  planosArray.forEach(p => {
    p.duracaoMin = Math.max(5, p.duracaoMin);
    duracaoTotalGeral += p.duracaoMin;
  });

  return {
    planos: planosArray,
    duracaoTotalMin: Math.max(5, duracaoTotalGeral)
  };
}

/**
 * Atualiza o preview sequencial dos agendamentos no modal
 */
function atualizarPreviewSequencial(horaInicioStr) {
  if (!modalAgendaSequencialPreview || !modalAgendaSequencialLista) return;

  const { planos, duracaoTotalMin } = calcularPlanosEServicosSelecionados();
  if (planos.length <= 1 || !horaInicioStr) {
    modalAgendaSequencialPreview.style.display = "none";
    return;
  }

  let startMinAtual = horaParaMinutos(horaInicioStr);
  let html = "";

  planos.forEach((p, idx) => {
    const endMinAtual = startMinAtual + p.duracaoMin;
    const hIni = minutosParaHora(startMinAtual);
    const hFim = minutosParaHora(endMinAtual);
    const servsText = p.servicos.map(s => s.nome.split("-")[0].trim()).join(", ");

    html += `
      <div style="display: flex; justify-content: space-between; align-items: center; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; padding: 4px 6px;">
        <div>
          <strong style="color: #0284c7;">${idx + 1}º Agendamento:</strong> <strong>${hIni} às ${hFim}</strong>
          <div style="color: #64748b; font-size: 10px;">📦 ${p.nomePlano} (${servsText})</div>
        </div>
        <span class="badge-count-pill" style="background: #e0f2fe; color: #0369a1; font-size: 10px;">${p.duracaoMin}m</span>
      </div>
    `;

    p.horarioInicio = hIni;
    p.horarioFim = hFim;
    startMinAtual = endMinAtual;
  });

  modalAgendaSequencialLista.innerHTML = html;
  modalAgendaSequencialPreview.style.display = "block";
}

/**
 * Consulta a API do Belle e calcula os horários livres onde cabe a duração total
 */
export async function carregarDisponibilidadeHorarios() {
  if (!modalAgendaSelectHorario) return;

  clearTimeout(debounceDisponibilidadeTimer);
  debounceDisponibilidadeTimer = setTimeout(async () => {
    await executarCalculoDisponibilidade();
  }, 200);
}

async function executarCalculoDisponibilidade() {
  const dataBr = modalAgendaInputDataBr?.value || "";
  const dataIso = dataBrParaIso(dataBr);

  const selectedOpt = modalAgendaSelectSala?.selectedOptions?.[0];
  const codSalaAlvo = selectedOpt?.getAttribute("data-cod") || modalAgendaSelectSala?.value || currentAppAgendamento?.codSala || "2";
  const nomeSalaAlvo = selectedOpt?.getAttribute("data-nome") || currentAppAgendamento?.salaNome || "SALA DE DEPILAÇAO A LASER";

  // 1. Obtém planos e duração unificada total
  const { planos, duracaoTotalMin } = calcularPlanosEServicosSelecionados();
  const totalAreas = planos.reduce((acc, p) => acc + p.servicos.length, 0);
  
  if (modalAgendaDuracaoBadge) {
    const txtPlanos = planos.length > 1 ? ` (${planos.length} planos em sequência)` : '';
    modalAgendaDuracaoBadge.textContent = `⏱️ ${duracaoTotalMin} min (${totalAreas} áreas${txtPlanos})`;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataIso)) {
    if (modalAgendaDisponibilidadeStatus) modalAgendaDisponibilidadeStatus.textContent = "⚠️ Data inválida.";
    return;
  }

  if (modalAgendaDisponibilidadeStatus) {
    modalAgendaDisponibilidadeStatus.innerHTML = `<span style="color: #0284c7;">🔍 Buscando disponibilidade da <strong>${nomeSalaAlvo}</strong> para bloco de <strong>${duracaoTotalMin} min</strong>...</span>`;
  }

  modalAgendaSelectHorario.innerHTML = `<option value="">Carregando horários livres...</option>`;

  try {
    if (!state.servicosCatalogo || state.servicosCatalogo.length === 0) {
      await buscarServicosCatalogoApi(state.currentToken, state.currentCodEstab);
    }

    if (!state.currentSalas || state.currentSalas.length === 0) {
      state.currentSalas = await buscarGridSalaApi(state.currentToken, state.currentCodEstab);
    }

    // 2. Consulta turnos válidos para a sala e data alvo
    const turnosValidos = await buscarTurnosValidosApi(state.currentToken, codSalaAlvo, dataIso, state.currentCodEstab);
    
    const [y, m, d] = dataIso.split("-").map(Number);
    const dataAlvoObj = new Date(y, m - 1, d);
    const dayOfWeekTarget = dataAlvoObj.getDay();

    let turnosDoDia = [];
    if (Array.isArray(turnosValidos) && turnosValidos.length > 0) {
      turnosDoDia = turnosValidos.filter(t => Array.isArray(t.daysOfWeek) && t.daysOfWeek.includes(dayOfWeekTarget));
    }

    if (turnosDoDia.length === 0) {
      if (dayOfWeekTarget === 0) {
        modalAgendaSelectHorario.innerHTML = `<option value="">⚠️ Clínica fechada aos domingos</option>`;
        if (modalAgendaDisponibilidadeStatus) modalAgendaDisponibilidadeStatus.textContent = "Clínica sem expediente aos domingos.";
        return;
      } else if (dayOfWeekTarget === 6) {
        turnosDoDia = [{ startTime: "08:00", endTime: "12:00" }, { startTime: "12:00", endTime: "22:00" }];
      } else {
        turnosDoDia = [{ startTime: "08:00", endTime: "20:00" }];
      }
    }

    // 3. Consulta a ocupação da agenda no dia alvo
    const arrGridTarget = montarArrGridDeGridSala(state.currentSalas, state.currentCodEstab);
    const agendamentosDia = await buscarAgendaApi(state.currentToken, dataIso, arrGridTarget, state.currentCodEstab);

    const ocupacoes = [];
    if (Array.isArray(agendamentosDia)) {
      agendamentosDia.forEach(item => {
        const st = String(item.status || item.statusAgendamento || "").toLowerCase();
        if (st.includes("canc") || st.includes("desmarc")) return;

        const alvoCod = String(codSalaAlvo || "").trim();
        const alvoNome = String(nomeSalaAlvo || "").trim().toLowerCase();
        const itemCod = String(item.codSala || item.cod_sala || item.codTipo || item.resourceId || item.id_recurso || item.section_id || item.codigo || "").trim();
        const itemNome = String(item.sala || item.nomSala || item.salaNome || item.nome || item.title || "").trim().toLowerCase();

        let pertence = false;
        if (alvoCod && itemCod && (itemCod === alvoCod)) pertence = true;
        else if (alvoNome && itemNome && (itemNome === alvoNome || itemNome.includes(alvoNome) || alvoNome.includes(itemNome))) pertence = true;
        else if (alvoNome.includes("laser") && itemNome.includes("laser")) pertence = true;

        if (pertence) {
          let horaIni = item.hrIni || item.horario || item.hr_inicio || "";
          if (!horaIni && item.start_date) {
            const parts = item.start_date.split(" ");
            horaIni = parts.length > 1 ? parts[1] : parts[0];
          }

          let horaFim = item.hrFim || item.hr_fim || "";
          if (!horaFim && item.end_date) {
            const parts = item.end_date.split(" ");
            horaFim = parts.length > 1 ? parts[1] : parts[0];
          }

          horaIni = String(horaIni || "").trim().substring(0, 5);
          horaFim = String(horaFim || "").trim().substring(0, 5);

          if (horaIni && horaFim) {
            const startMin = horaParaMinutos(horaIni);
            const endMin = horaParaMinutos(horaFim);
            if (endMin > startMin) {
              ocupacoes.push({ startMin, endMin, desc: item.nom_paciente || item.clienteNome || "Agendamento" });
            }
          }
        }
      });
    }

    // 4. Gera e valida todos os slots possíveis de 5 em 5 minutos para o bloco total
    const slotsDisponiveis = [];
    const stepMin = 5;

    turnosDoDia.forEach(turno => {
      const turnoStart = horaParaMinutos(turno.startTime);
      const turnoEnd = horaParaMinutos(turno.endTime);

      for (let s = turnoStart; s + duracaoTotalMin <= turnoEnd; s += stepMin) {
        const slotStart = s;
        const slotEnd = s + duracaoTotalMin;

        const temConflito = ocupacoes.some(oc => {
          return slotStart < oc.endMin && slotEnd > oc.startMin;
        });

        if (!temConflito) {
          slotsDisponiveis.push({
            inicio: minutosParaHora(slotStart),
            fim: minutosParaHora(slotEnd),
            minutos: slotStart
          });
        }
      }
    });

    // 5. Preenche o select de horários livres
    if (slotsDisponiveis.length > 0) {
      let optionsHtml = "";
      slotsDisponiveis.forEach((slot) => {
        optionsHtml += `<option value="${slot.inicio}">⏰ ${slot.inicio} às ${slot.fim} (Livre)</option>`;
      });
      modalAgendaSelectHorario.innerHTML = optionsHtml;
      
      const txtInfoPlanos = planos.length > 1 ? ` (bloco consecutivo de ${planos.length} planos)` : '';
      if (modalAgendaDisponibilidadeStatus) {
        modalAgendaDisponibilidadeStatus.innerHTML = `<span style="color: #16a34a; font-weight: 700;">✅ ${slotsDisponiveis.length} horários livres para ${duracaoTotalMin} min${txtInfoPlanos}</span>`;
      }

      atualizarPreviewSequencial(slotsDisponiveis[0]?.inicio);
    } else {
      modalAgendaSelectHorario.innerHTML = `<option value="">⚠️ Nenhum horário livre com ${duracaoTotalMin}m nesta data</option>`;
      if (modalAgendaDisponibilidadeStatus) {
        modalAgendaDisponibilidadeStatus.innerHTML = `<span style="color: #dc2626; font-weight: 700;">⚠️ Sem encaixe contínuo de ${duracaoTotalMin} min nesta data. Escolha outro dia.</span>`;
      }
      if (modalAgendaSequencialPreview) modalAgendaSequencialPreview.style.display = "none";
    }

  } catch (err) {
    console.warn("Erro ao calcular disponibilidade:", err);
    modalAgendaSelectHorario.innerHTML = `<option value="14:00">⏰ 14:00 (Livre)</option>`;
  }
}

/**
 * Recalcula e atualiza o banner de regra, intervalo e data sugerida no modal
 */
function atualizarRegraEDataSugerida() {
  if (!currentAppAgendamento) return;

  const { planos } = calcularPlanosEServicosSelecionados();
  const todosServicosNomes = planos.flatMap(p => p.servicos.map(s => s.nome));
  const textoDestino = todosServicosNomes.join(" ") || currentAppAgendamento.procedimento || "";
  const tipoDestino = identificarTipoProcedimento(textoDestino);

  const diasIntervalo = calcularIntervaloClinico(tipoProcedimentoAtual, tipoDestino);
  const dataBase = obterDataBaseAgendamento(currentAppAgendamento);
  const dataSugerida = new Date(dataBase.getTime());
  dataSugerida.setDate(dataSugerida.getDate() + diasIntervalo);

  setarDataNoModal(dataSugerida);

  if (modalAgendaLblData) {
    modalAgendaLblData.textContent = `🗓️ Data Sugerida (+${diasIntervalo} dias):`;
  }

  const nomeOrigem = (tipoProcedimentoAtual === "clareamento") ? "🧴 Clareamento" : "🪒 Depilação";
  const nomeDestino = (tipoDestino === "clareamento") ? "🧴 Clareamento" : "🪒 Depilação";

  if (modalAgendaTipoProximoBadge) {
    modalAgendaTipoProximoBadge.textContent = (tipoDestino === "clareamento") ? "🧴 Clareamento" : "🪒 Depilação";
    modalAgendaTipoProximoBadge.style.background = (tipoDestino === "clareamento") ? "#fef3c7" : "#e0f2fe";
    modalAgendaTipoProximoBadge.style.color = (tipoDestino === "clareamento") ? "#92400e" : "#0369a1";
  }

  if (modalAgendaBadgeRegra) {
    const isCruzado = (tipoProcedimentoAtual !== tipoDestino);
    modalAgendaBadgeRegra.style.background = isCruzado ? "#eff6ff" : "#f0fdf4";
    modalAgendaBadgeRegra.style.borderColor = isCruzado ? "#bfdbfe" : "#bbf7d0";
    modalAgendaBadgeRegra.style.borderLeftColor = isCruzado ? "#0284c7" : "#16a34a";
    modalAgendaBadgeRegra.style.color = isCruzado ? "#1e40af" : "#166534";
    modalAgendaBadgeRegra.innerHTML = `⏱️ Regra Clínica: ${nomeOrigem} ➔ ${nomeDestino} (<strong>+${diasIntervalo} dias</strong> de intervalo)`;
  }

  carregarDisponibilidadeHorarios();
}

/**
 * Renderiza a lista de serviços estruturados e agrupados por plano
 */
function renderizarPlanosEServicos(planosComServicos) {
  if (!modalAgendaListaServicos) return;

  if (!Array.isArray(planosComServicos) || planosComServicos.length === 0) {
    modalAgendaListaServicos.innerHTML = '<div style="font-size: 11px; color: #64748b; padding: 4px;">Nenhuma área encontrada no plano.</div>';
    return;
  }

  let html = "";
  planosComServicos.forEach((plano, pIdx) => {
    const isMultiplo = planosComServicos.length > 1;
    const headerPlanoHtml = isMultiplo ? `
      <div style="font-size: 11px; font-weight: 800; color: #0369a1; background: #e0f2fe; padding: 3px 6px; border-radius: 4px; margin-top: ${pIdx > 0 ? '6px' : '0'}; margin-bottom: 3px; display: flex; justify-content: space-between;">
        <span>📦 Plano #${pIdx + 1}: ${plano.nomePlano || 'Pacote de Sessões'}</span>
        <small style="color: #0284c7;">#${plano.codOrcamento || ''}</small>
      </div>
    ` : '';

    let servicosItemsHtml = "";
    plano.servicos.forEach((s, sIdx) => {
      const sNome = s.servico || s.nome || s.nom_servico || `Área #${sIdx + 1}`;
      const sTipo = identificarTipoProcedimento(sNome);
      const iconTipo = (sTipo === "clareamento") ? "🧴" : "🪒";
      
      const realizadas = parseInt(s.gasto || s.realizadas || s.qtd_executada || 0, 10);
      const contratadas = parseInt(s.quantidade || s.contratadas || s.qtd_contratada || 10, 10);
      const saldoRestante = parseInt(s.saldo_atual || s.saldo || (contratadas - realizadas), 10);
      const proximaSessao = realizadas + 1;
      const tempoServ = s.tempo || obterTempoServico(sNome);

      let sessaoTxt = "";
      if (contratadas > 0) {
        if (saldoRestante > 0) {
          sessaoTxt = `(Sessão ${proximaSessao}/${contratadas} • Saldo: ${saldoRestante} | ⏱️ ${tempoServ}m)`;
        } else {
          sessaoTxt = `(Concluído ${realizadas}/${contratadas} • Saldo: 0)`;
        }
      }

      const isChecked = saldoRestante > 0 ? "checked" : "";
      const isDesabilitado = saldoRestante <= 0 ? "style='opacity: 0.6;'" : "";

      servicosItemsHtml += `
        <label class="check-servico-item" ${isDesabilitado}>
          <input 
            type="checkbox" 
            name="servico_agendar" 
            value="${sNome}" 
            data-plano-orc="${plano.codOrcamento || ''}"
            data-plano-cod="${plano.codPlano || ''}"
            data-plano-nome="${plano.nomePlano || ''}"
            data-tempo="${tempoServ}"
            ${isChecked}
          >
          <span>${iconTipo} <strong>${sNome}</strong> ${sessaoTxt ? `<small style="color: #0284c7; font-weight: 700;">${sessaoTxt}</small>` : ''}</span>
        </label>
      `;
    });

    html += `
      <div class="plano-agendamento-box" style="margin-bottom: 4px;">
        ${headerPlanoHtml}
        <div style="display: flex; flex-direction: column; gap: 4px;">
          ${servicosItemsHtml}
        </div>
      </div>
    `;
  });

  modalAgendaListaServicos.innerHTML = html;

  modalAgendaListaServicos.querySelectorAll("input[name='servico_agendar']").forEach(chk => {
    chk.addEventListener("change", () => {
      atualizarRegraEDataSugerida();
    });
  });

  atualizarRegraEDataSugerida();
}

export async function abrirModalAgendarProxima(app, onSalvar) {
  if (!modalAgendarProxima || !app) return;

  currentAppAgendamento = app;
  callbackSalvar = onSalvar;

  const textoOrigem = `${app.procedimento || ''} ${(app.arrServ || []).map(s => s.nome).join(' ')} ${app.lbServ || ''}`;
  tipoProcedimentoAtual = identificarTipoProcedimento(textoOrigem);

  const statusLabel = app.statusFormatado || app.status || "Atendido";
  const statusElegivel = (app.status === "aguardando" || app.status === "atendimento" || app.status === "finalizado");

  if (modalAgendaNomeCliente) {
    modalAgendaNomeCliente.textContent = `👤 ${app.clienteNome || "Cliente"}`;
  }

  if (modalAgendaInfoPaciente) {
    const pront = app.codCliente ? `#${app.codCliente}` : "N/A";
    const tel = app.telefone || "Não informado";
    modalAgendaInfoPaciente.textContent = `Prontuário: ${pront} • Celular: ${tel}`;
  }

  if (modalAgendaContextoHoje) {
    const nomeProcHoje = (tipoProcedimentoAtual === "clareamento") ? "🧴 Clareamento" : "🪒 Depilação a Laser";
    modalAgendaContextoHoje.innerHTML = `📍 Sessão de Hoje: <strong>${nomeProcHoje}</strong> <span style="font-weight: 800; color: ${statusElegivel ? '#16a34a' : '#64748b'};">• [Status: ${statusLabel}]</span>`;
  }

  // 1. Configura salas
  if (modalAgendaSelectSala) {
    modalAgendaSelectSala.innerHTML = "";
    
    if (!state.currentSalas || state.currentSalas.length === 0) {
      state.currentSalas = await buscarGridSalaApi(state.currentToken, state.currentCodEstab);
    }

    const salas = state.currentSalas || [];
    if (salas.length > 0) {
      salas.forEach(sala => {
        const sCod = String(sala.cod_sala || sala.id || sala.codigo || "");
        const sNome = sala.nome || sala.title || "";
        const opt = document.createElement("option");
        opt.value = sCod;
        opt.setAttribute("data-cod", sCod);
        opt.setAttribute("data-nome", sNome);
        opt.textContent = `📍 ${sNome}`;

        const isMesmaSala = (app.salaNome && sNome.trim().toLowerCase() === app.salaNome.trim().toLowerCase()) ||
                            (app.codSala && String(sCod) === String(app.codSala));

        if (isMesmaSala) opt.selected = true;
        modalAgendaSelectSala.appendChild(opt);
      });
    }

    modalAgendaSelectSala.addEventListener("change", () => {
      carregarDisponibilidadeHorarios();
    });
  }

  // 2. Consulta e agrupa todos os planos e saldos da paciente
  if (modalAgendaListaServicos) {
    modalAgendaListaServicos.innerHTML = '<div style="font-size: 11px; color: #64748b; padding: 4px;">Carregando planos e saldo de sessões...</div>';
    
    const planosEstruturados = [];

    // a) Identifica múltiplos agendamentos da cliente no dia de hoje
    const agendamentosClienteHoje = (state.appointmentsData || []).filter(a => String(a.codCliente) === String(app.codCliente));
    const orcamentosProcessados = new Set();

    // Processa os orçamentos dos agendamentos de hoje
    for (const ag of agendamentosClienteHoje) {
      const orcKey = String(ag.codOrcamento || "").trim();
      if (orcKey && !orcamentosProcessados.has(orcKey)) {
        orcamentosProcessados.add(orcKey);
        try {
          const servicosSaldo = await buscarSaldoVendaPlanoApi(state.currentToken, ag.codOrcamento, ag.codPlano, ag.idGeinfo, state.currentCodEstab);
          if (Array.isArray(servicosSaldo) && servicosSaldo.length > 0) {
            planosEstruturados.push({
              codOrcamento: ag.codOrcamento,
              codPlano: ag.codPlano,
              nomePlano: ag.nomePlano || `Plano #${ag.codOrcamento}`,
              servicos: servicosSaldo
            });
          }
        } catch (e) {}
      }
    }

    // Se ainda não encontrou ou cliente tem outros planos na base
    if (planosEstruturados.length === 0 && app.codOrcamento) {
      try {
        const servicosSaldo = await buscarSaldoVendaPlanoApi(state.currentToken, app.codOrcamento, app.codPlano, app.idGeinfo, state.currentCodEstab);
        if (Array.isArray(servicosSaldo) && servicosSaldo.length > 0) {
          planosEstruturados.push({
            codOrcamento: app.codOrcamento,
            codPlano: app.codPlano,
            nomePlano: app.nomePlano || "Plano de Sessões",
            servicos: servicosSaldo
          });
        }
      } catch (e) {}
    }

    // Fallback: monta do lbServ/arrServ
    if (planosEstruturados.length === 0) {
      let servicosFallback = (app.arrServ && app.arrServ.length > 0) ? [...app.arrServ] : [];
      if (servicosFallback.length === 0 && app.procedimento) {
        servicosFallback.push({ nome: app.procedimento, cod_servico: "" });
      }

      const progressoMap = new Map();
      if (app.lbServ) {
        const linhas = app.lbServ.split("<br>").map(l => l.trim()).filter(Boolean);
        linhas.forEach(l => {
          const match = l.match(/(.+?)\s*-\s*(\d+)\/(\d+)/);
          if (match) {
            const f = parseInt(match[2], 10) || 0;
            const tot = parseInt(match[3], 10) || 10;
            progressoMap.set(match[1].trim().toLowerCase(), { feitas: f, total: tot, saldo: Math.max(0, tot - f) });
          }
        });
      }

      const formatado = servicosFallback.map(s => {
        const sNome = s.nome || "Área";
        let f = 0, tot = 10, sal = 10;
        for (const [k, v] of progressoMap.entries()) {
          if (sNome.toLowerCase().includes(k) || k.includes(sNome.toLowerCase().substring(0, 8))) {
            f = v.feitas;
            tot = v.total;
            sal = v.saldo;
            break;
          }
        }
        return {
          nome: sNome,
          gasto: f,
          quantidade: tot,
          saldo: sal,
          tempo: obterTempoServico(sNome)
        };
      });

      planosEstruturados.push({
        codOrcamento: app.codOrcamento || "",
        codPlano: app.codPlano || "",
        nomePlano: app.nomePlano || "Plano de Sessões",
        servicos: formatado
      });
    }

    planosEstruturadosCache = planosEstruturados;
    renderizarPlanosEServicos(planosEstruturados);
  }

  // 3. Listeners do campo de data DD/MM/YYYY
  if (modalAgendaInputDataBr) {
    modalAgendaInputDataBr.addEventListener("input", (e) => {
      let v = e.target.value.replace(/\D/g, "");
      if (v.length > 8) v = v.substring(0, 8);
      if (v.length >= 5) {
        e.target.value = `${v.substring(0, 2)}/${v.substring(2, 4)}/${v.substring(4, 8)}`;
      } else if (v.length >= 3) {
        e.target.value = `${v.substring(0, 2)}/${v.substring(2, 4)}`;
      } else {
        e.target.value = v;
      }

      if (e.target.value.length === 10) {
        const [d, m, y] = e.target.value.split("/").map(Number);
        const dataManual = new Date(y, m - 1, d);
        if (!isNaN(dataManual.getTime())) {
          const diaSemana = DIAS_SEMANA[dataManual.getDay()] || "";
          if (modalAgendaDataBrDisplay) modalAgendaDataBrDisplay.textContent = `📅 ${diaSemana}`;
          if (modalAgendaPicker) {
            const mmStr = String(m).padStart(2, "0");
            const ddStr = String(d).padStart(2, "0");
            modalAgendaPicker.value = `${y}-${mmStr}-${ddStr}`;
          }
          carregarDisponibilidadeHorarios();
        }
      }
    });
  }

  modalAgendaPicker?.addEventListener("change", (e) => {
    if (e.target.value) {
      const [y, m, d] = e.target.value.split("-").map(Number);
      const dataPick = new Date(y, m - 1, d);
      setarDataNoModal(dataPick);
      carregarDisponibilidadeHorarios();
    }
  });

  btnModalAgendaAbrirCalendario?.addEventListener("click", () => {
    if (modalAgendaPicker) {
      if (typeof modalAgendaPicker.showPicker === "function") {
        modalAgendaPicker.showPicker();
      } else {
        modalAgendaPicker.click();
      }
    }
  });

  modalAgendaSelectHorario?.addEventListener("change", (e) => {
    atualizarPreviewSequencial(e.target.value);
  });

  atualizarRegraEDataSugerida();
  modalAgendarProxima.style.display = "flex";
}

export function fecharModalAgendarProxima() {
  if (modalAgendarProxima) {
    modalAgendarProxima.style.display = "none";
  }
  currentAppAgendamento = null;
  callbackSalvar = null;
}

btnConfirmarAgendarProxima?.addEventListener("click", () => {
  if (!currentAppAgendamento) return;

  const dataEscolhidaBr = modalAgendaInputDataBr?.value || "";
  const horaEscolhida = modalAgendaSelectHorario?.value || "09:00";
  const salaEscolhida = modalAgendaSelectSala?.value;

  const { planos, duracaoTotalMin } = calcularPlanosEServicosSelecionados();
  if (planos.length === 0) {
    alert("⚠️ Selecione pelo menos uma área para agendar.");
    return;
  }

  let startMin = horaParaMinutos(horaEscolhida);
  const agendamentosConsecutivos = planos.map((p, idx) => {
    const endMin = startMin + p.duracaoMin;
    const hIni = minutosParaHora(startMin);
    const hFim = minutosParaHora(endMin);
    startMin = endMin;

    return {
      clienteNome: currentAppAgendamento.clienteNome,
      codCliente: currentAppAgendamento.codCliente,
      telefone: currentAppAgendamento.telefone,
      cpf: currentAppAgendamento.cpf,
      data: dataEscolhidaBr,
      horario: hIni,
      hrFim: hFim,
      duracaoMin: p.duracaoMin,
      codOrcamento: p.codOrcamento,
      codPlano: p.codPlano,
      nomePlano: p.nomePlano,
      sala: salaEscolhida,
      servicos: p.servicos.map(s => s.nome)
    };
  });

  console.log("[BelleCopilot] 📅 Agendamentos consecutivos gerados:", agendamentosConsecutivos);

  if (typeof callbackSalvar === "function") {
    callbackSalvar(agendamentosConsecutivos);
  }

  if (agendamentosConsecutivos.length > 1) {
    const resumo = agendamentosConsecutivos.map((a, i) => `${i + 1}º às ${a.horario} (${a.duracaoMin}m)`).join(", ");
    alert(`✅ ${agendamentosConsecutivos.length} Agendamentos consecutivos gerados para ${currentAppAgendamento.clienteNome} no dia ${dataEscolhidaBr}:\n${resumo}`);
  } else {
    alert(`✅ Solicitação de agendamento para ${currentAppAgendamento.clienteNome} no dia ${dataEscolhidaBr} às ${horaEscolhida} (${duracaoTotalMin} min) registrada com sucesso!`);
  }

  fecharModalAgendarProxima();
});

btnCancelarAgendarProxima?.addEventListener("click", () => {
  fecharModalAgendarProxima();
});
