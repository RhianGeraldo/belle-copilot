/**
 * BELLE COPILOT - MODAL DE AGENDAMENTO DA PRÓXIMA SESSÃO (RECEPÇÃO / COMERCIAL)
 * - Mapeia e soma dinamicamente a duração em minutos de cada serviço selecionado (tempo);
 * - Consulta os turnos válidos e a ocupação da agendaapi para a data futura e sala escolhidas;
 * - Filtra e exibe no dropdown apenas os horários livres onde o tempo total do procedimento encaixa sem conflito.
 */

import { state } from '../core/state.js';
import { 
  buscarSaldoVendaPlanoApi, 
  buscarTurnosValidosApi, 
  buscarServicosCatalogoApi, 
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
const modalAgendaSelectSala = document.getElementById("modal-agenda-select-sala");
const btnCancelarAgendarProxima = document.getElementById("btn-cancelar-agendar-proxima");
const btnConfirmarAgendarProxima = document.getElementById("btn-confirmar-agendar-proxima");

let callbackSalvar = null;
let currentAppAgendamento = null;
let tipoProcedimentoAtual = "depilacao"; // "depilacao" ou "clareamento"
let debounceDisponibilidadeTimer = null;

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
  const partes = horaStr.split(":");
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
 * Calcula a duração total em minutos somando o tempo de cada serviço selecionado
 */
export function calcularDuracaoServicosSelecionados(checkedServicosNomes = []) {
  if (!Array.isArray(checkedServicosNomes) || checkedServicosNomes.length === 0) return 10;

  const catalogo = state.servicosCatalogo || [];
  let duracaoTotal = 0;

  checkedServicosNomes.forEach(nomeServ => {
    const nomeNorm = nomeServ.toLowerCase().trim();
    let tempoEncontrado = null;

    // Busca correspondência exata ou parcial no catálogo de serviços
    if (catalogo.length > 0) {
      const match = catalogo.find(c => {
        const cNome = (c.nome || "").toLowerCase().trim();
        return cNome === nomeNorm || cNome.includes(nomeNorm) || nomeNorm.includes(cNome);
      });
      if (match && match.tempo) {
        tempoEncontrado = Number(match.tempo);
      }
    }

    if (tempoEncontrado && tempoEncontrado > 0) {
      duracaoTotal += tempoEncontrado;
    } else {
      // Fallback heurístico por porte da área
      if (nomeNorm.includes("(g)") || nomeNorm.includes("inteir") || nomeNorm.includes("completa")) {
        duracaoTotal += 10;
      } else if (nomeNorm.includes("(m)")) {
        duracaoTotal += 5;
      } else {
        duracaoTotal += 5;
      }
    }
  });

  return Math.max(5, duracaoTotal);
}

/**
 * Consulta a API do Belle e calcula os horários livres onde cabe a duração total
 */
export async function carregarDisponibilidadeHorarios() {
  if (!modalAgendaSelectHorario) return;

  clearTimeout(debounceDisponibilidadeTimer);
  debounceDisponibilidadeTimer = setTimeout(async () => {
    await executarCalculoDisponibilidade();
  }, 250);
}

async function executarCalculoDisponibilidade() {
  const dataBr = modalAgendaInputDataBr?.value || "";
  const dataIso = dataBrParaIso(dataBr);
  const codSala = modalAgendaSelectSala?.value || "1";

  // 1. Obtém serviços selecionados e calcula duração total
  const checkedServicos = [];
  modalAgendaListaServicos?.querySelectorAll("input[name='servico_agendar']:checked").forEach(chk => {
    checkedServicos.push(chk.value);
  });

  const duracaoTotalMin = calcularDuracaoServicosSelecionados(checkedServicos);
  
  if (modalAgendaDuracaoBadge) {
    modalAgendaDuracaoBadge.textContent = `⏱️ ${duracaoTotalMin} min (${checkedServicos.length} área${checkedServicos.length === 1 ? '' : 's'})`;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataIso)) {
    if (modalAgendaDisponibilidadeStatus) modalAgendaDisponibilidadeStatus.textContent = "⚠️ Data inválida.";
    return;
  }

  if (modalAgendaDisponibilidadeStatus) {
    modalAgendaDisponibilidadeStatus.innerHTML = `<span style="color: #0284c7;">🔍 Buscando disponibilidade para <strong>${duracaoTotalMin} min</strong>...</span>`;
  }

  modalAgendaSelectHorario.innerHTML = `<option value="">Carregando horários livres...</option>`;

  try {
    // 2. Garante catálogo de serviços carregado
    if (!state.servicosCatalogo || state.servicosCatalogo.length === 0) {
      await buscarServicosCatalogoApi(state.currentToken, state.currentCodEstab);
    }

    // 3. Consulta turnos válidos para a sala e data alvo
    const turnosValidos = await buscarTurnosValidosApi(state.currentToken, codSala, dataIso, state.currentCodEstab);
    
    // Determina o dia da semana da data alvo (0=dom, 1=seg, ..., 6=sab)
    const [y, m, d] = dataIso.split("-").map(Number);
    const dataAlvoObj = new Date(y, m - 1, d);
    const dayOfWeekTarget = dataAlvoObj.getDay();

    // Filtra turnos do dia da semana
    let turnosDoDia = [];
    if (Array.isArray(turnosValidos) && turnosValidos.length > 0) {
      turnosDoDia = turnosValidos.filter(t => Array.isArray(t.daysOfWeek) && t.daysOfWeek.includes(dayOfWeekTarget));
    }

    // Fallback padrão se não houver turno cadastrado
    if (turnosDoDia.length === 0) {
      if (dayOfWeekTarget === 0) {
        // Domingo normalmente fechado
        modalAgendaSelectHorario.innerHTML = `<option value="">⚠️ Clínica fechada aos domingos</option>`;
        if (modalAgendaDisponibilidadeStatus) modalAgendaDisponibilidadeStatus.textContent = "Clínica sem expediente nesta data.";
        return;
      } else if (dayOfWeekTarget === 6) {
        turnosDoDia = [{ startTime: "08:00", endTime: "13:00" }];
      } else {
        turnosDoDia = [{ startTime: "08:00", endTime: "20:00" }];
      }
    }

    // 4. Consulta a ocupação da agenda no dia alvo
    const arrGridTarget = montarArrGridDeGridSala(state.currentSalas, state.currentCodEstab);
    const agendamentosDia = await buscarAgendaApi(state.currentToken, dataIso, arrGridTarget, state.currentCodEstab);

    // Mapeia ocupações da sala selecionada em minutos [startMin, endMin]
    const ocupacoes = [];
    if (Array.isArray(agendamentosDia)) {
      agendamentosDia.forEach(item => {
        const itemSala = String(item.cod_sala || item.id_recurso || item.section_id || "");
        const salaAlvo = String(codSala);

        // Verifica se pertence à sala (ou se salaAlvo está inclusa)
        if (itemSala === salaAlvo || !salaAlvo || salaAlvo === "1") {
          let horaIni = item.start_date ? item.start_date.split(" ")[1] : item.horario;
          let horaFim = item.end_date ? item.end_date.split(" ")[1] : item.hrFim;

          if (horaIni && horaFim) {
            const startMin = horaParaMinutos(horaIni.substring(0, 5));
            const endMin = horaParaMinutos(horaFim.substring(0, 5));
            if (endMin > startMin) {
              ocupacoes.push({ startMin, endMin, desc: item.text || item.clienteNome });
            }
          }
        }
      });
    }

    // 5. Gera e valida todos os slots possíveis de 5 em 5 minutos
    const slotsDisponiveis = [];
    const stepMin = 5; // Granularidade da agenda de 5 em 5 min

    turnosDoDia.forEach(turno => {
      const turnoStart = horaParaMinutos(turno.startTime);
      const turnoEnd = horaParaMinutos(turno.endTime);

      for (let s = turnoStart; s + duracaoTotalMin <= turnoEnd; s += stepMin) {
        const slotStart = s;
        const slotEnd = s + duracaoTotalMin;

        // Checa colisão com qualquer agendamento existente na sala
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

    // 6. Preenche o select de horários livres
    if (slotsDisponiveis.length > 0) {
      let optionsHtml = "";
      slotsDisponiveis.forEach((slot, i) => {
        optionsHtml += `<option value="${slot.inicio}">⏰ ${slot.inicio} às ${slot.fim} (Livre)</option>`;
      });
      modalAgendaSelectHorario.innerHTML = optionsHtml;
      if (modalAgendaDisponibilidadeStatus) {
        modalAgendaDisponibilidadeStatus.innerHTML = `<span style="color: #16a34a; font-weight: 700;">✅ ${slotsDisponiveis.length} horários livres para ${duracaoTotalMin} min nesta sala</span>`;
      }
    } else {
      modalAgendaSelectHorario.innerHTML = `<option value="">⚠️ Nenhum horário livre com ${duracaoTotalMin}m nesta data</option>`;
      if (modalAgendaDisponibilidadeStatus) {
        modalAgendaDisponibilidadeStatus.innerHTML = `<span style="color: #dc2626; font-weight: 700;">⚠️ Sala 100% ocupada sem encaixe de ${duracaoTotalMin} min. Escolha outra data.</span>`;
      }
    }

  } catch (err) {
    console.warn("Erro ao calcular disponibilidade:", err);
    modalAgendaSelectHorario.innerHTML = `
      <option value="08:00">⏰ 08:00 (Padrão)</option>
      <option value="09:00">⏰ 09:00 (Padrão)</option>
      <option value="10:00">⏰ 10:00 (Padrão)</option>
      <option value="14:00">⏰ 14:00 (Padrão)</option>
      <option value="16:00">⏰ 16:00 (Padrão)</option>
    `;
    if (modalAgendaDisponibilidadeStatus) modalAgendaDisponibilidadeStatus.textContent = "Disponibilidade padrão carregada.";
  }
}

/**
 * Recalcula e atualiza o banner de regra, intervalo e data sugerida no modal
 */
function atualizarRegraEDataSugerida() {
  if (!currentAppAgendamento) return;

  // 1. Identifica quais serviços estão selecionados
  const checkedServicos = [];
  modalAgendaListaServicos?.querySelectorAll("input[name='servico_agendar']:checked").forEach(chk => {
    checkedServicos.push(chk.value);
  });

  const textoDestino = checkedServicos.join(" ") || currentAppAgendamento.procedimento || "";
  const tipoDestino = identificarTipoProcedimento(textoDestino);

  // 2. Calcula intervalo em dias
  const diasIntervalo = calcularIntervaloClinico(tipoProcedimentoAtual, tipoDestino);

  // 3. Calcula nova data sugerida a partir da data base
  const dataBase = obterDataBaseAgendamento(currentAppAgendamento);
  const dataSugerida = new Date(dataBase.getTime());
  dataSugerida.setDate(dataSugerida.getDate() + diasIntervalo);

  setarDataNoModal(dataSugerida);

  if (modalAgendaLblData) {
    modalAgendaLblData.textContent = `🗓️ Data Sugerida (+${diasIntervalo} dias):`;
  }

  // 4. Atualiza badges e banners explicativos
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

  // 5. Dispara cálculo de horários livres para a data calculada
  carregarDisponibilidadeHorarios();
}

/**
 * Renderiza a lista de serviços e saldos exatos das áreas
 */
function renderizarListaServicosSaldo(servicosComSaldo) {
  if (!modalAgendaListaServicos) return;

  if (!Array.isArray(servicosComSaldo) || servicosComSaldo.length === 0) {
    modalAgendaListaServicos.innerHTML = '<div style="font-size: 11px; color: #64748b; padding: 4px;">Nenhuma área encontrada no plano.</div>';
    return;
  }

  let itemsHtml = "";
  servicosComSaldo.forEach((s, idx) => {
    const sNome = s.servico || s.nome || s.nom_servico || `Área #${idx + 1}`;
    const sTipo = identificarTipoProcedimento(sNome);
    const iconTipo = (sTipo === "clareamento") ? "🧴" : "🪒";
    
    const realizadas = parseInt(s.gasto || s.realizadas || s.qtd_executada || 0, 10);
    const contratadas = parseInt(s.quantidade || s.contratadas || s.qtd_contratada || 10, 10);
    const saldoRestante = parseInt(s.saldo_atual || s.saldo || (contratadas - realizadas), 10);
    const proximaSessao = realizadas + 1;

    let sessaoTxt = "";
    if (contratadas > 0) {
      if (saldoRestante > 0) {
        sessaoTxt = `(Sessão ${proximaSessao}/${contratadas} • Saldo: ${saldoRestante} sessões)`;
      } else {
        sessaoTxt = `(Concluído ${realizadas}/${contratadas} • Saldo: 0)`;
      }
    }

    const isChecked = saldoRestante > 0 ? "checked" : "";
    const isDesabilitado = saldoRestante <= 0 ? "style='opacity: 0.6;'" : "";

    itemsHtml += `
      <label class="check-servico-item" ${isDesabilitado}>
        <input type="checkbox" name="servico_agendar" value="${sNome}" ${isChecked}>
        <span>${iconTipo} <strong>${sNome}</strong> ${sessaoTxt ? `<small style="color: #0284c7; font-weight: 700;">${sessaoTxt}</small>` : ''}</span>
      </label>
    `;
  });

  modalAgendaListaServicos.innerHTML = itemsHtml;

  // Listener para recalcular ao alternar seleção
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

  // 1. Identifica procedimento atual da sessão de hoje
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

  // 2. Preenche as opções de salas
  if (modalAgendaSelectSala) {
    modalAgendaSelectSala.innerHTML = "";
    const salas = state.currentSalas || [];
    if (salas.length > 0) {
      salas.forEach(sala => {
        const opt = document.createElement("option");
        opt.value = sala.id || sala.id_recurso || sala.cod_sala || sala.nome;
        opt.textContent = `📍 ${sala.nome || sala.title}`;
        if (sala.nome === app.salaNome || String(sala.id) === String(app.codSala)) opt.selected = true;
        modalAgendaSelectSala.appendChild(opt);
      });
    } else {
      const opt = document.createElement("option");
      opt.value = app.codSala || "1";
      opt.textContent = `📍 ${app.salaNome || 'SALA DEPILAÇÃO A LASER'}`;
      modalAgendaSelectSala.appendChild(opt);
    }

    modalAgendaSelectSala.addEventListener("change", () => {
      carregarDisponibilidadeHorarios();
    });
  }

  // 3. Carrega e exibe as áreas com saldo
  if (modalAgendaListaServicos) {
    modalAgendaListaServicos.innerHTML = '<div style="font-size: 11px; color: #64748b; padding: 4px;">Carregando saldo de sessões...</div>';
    
    // a) Tenta buscar saldo exato da API oficial saldovendaplano
    let servicosSaldo = null;
    if (app.codOrcamento && state.currentToken) {
      try {
        servicosSaldo = await buscarSaldoVendaPlanoApi(state.currentToken, app.codOrcamento, app.codPlano, app.idGeinfo, state.currentCodEstab);
      } catch (e) {}
    }

    if (Array.isArray(servicosSaldo) && servicosSaldo.length > 0) {
      renderizarListaServicosSaldo(servicosSaldo);
    } else {
      // b) Fallback: extrai do lbServ / arrServ
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
          saldo: sal
        };
      });

      renderizarListaServicosSaldo(formatado);
    }
  }

  // 4. Configuração de eventos de máscara e sincronização do input DD/MM/YYYY
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

  // Sincroniza do picker para o input DD/MM/YYYY
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

  const checkedServicos = [];
  modalAgendaListaServicos?.querySelectorAll("input[name='servico_agendar']:checked").forEach(chk => {
    checkedServicos.push(chk.value);
  });

  const duracaoTotal = calcularDuracaoServicosSelecionados(checkedServicos);

  const dadosAgendamento = {
    clienteNome: currentAppAgendamento.clienteNome,
    codCliente: currentAppAgendamento.codCliente,
    telefone: currentAppAgendamento.telefone,
    cpf: currentAppAgendamento.cpf,
    data: dataEscolhidaBr,
    horario: horaEscolhida,
    duracaoMin: duracaoTotal,
    sala: salaEscolhida,
    servicos: checkedServicos
  };

  console.log("[BelleCopilot] 📅 Solicitação de agendamento de próxima sessão:", dadosAgendamento);

  if (typeof callbackSalvar === "function") {
    callbackSalvar(dadosAgendamento);
  }

  alert(`✅ Solicitação de agendamento para ${dadosAgendamento.clienteNome} no dia ${dataEscolhidaBr} às ${horaEscolhida} (${duracaoTotal} min) registrada com sucesso!`);
  fecharModalAgendarProxima();
});

btnCancelarAgendarProxima?.addEventListener("click", () => {
  fecharModalAgendarProxima();
});
