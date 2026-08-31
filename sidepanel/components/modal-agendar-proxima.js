/**
 * BELLE COPILOT - MODAL DE AGENDAMENTO DA PRÓXIMA SESSÃO (RECEPÇÃO / COMERCIAL)
 * - Mapeamento e montagem estrita do array completo de serviços (arrServ e obServ);
 * - Trava de áreas com saldo zerado;
 * - Suporta agendamento sequencial em lote para clientes com múltiplos planos/pacotes;
 * - Executa a validação oficial (/validacao) e a gravação no Belle (/edicaoagenda);
 * - Feedback visual elegante integrado no Side Panel.
 */

import { state } from '../core/state.js';
import { 
  buscarSaldoVendaPlanoApi, 
  buscarVendasPlanosClienteApi,
  buscarTurnosValidosApi, 
  buscarServicosCatalogoApi, 
  buscarGridSalaApi,
  buscarAgendaApi, 
  montarArrGridDeGridSala,
  validarAgendamentoApi,
  salvarEdicaoAgendaApi 
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

// Modal de Sucesso Customizado
const modalAgendamentoSucesso = document.getElementById("modal-agendamento-sucesso");
const modalSucessoSubtitulo = document.getElementById("modal-sucesso-subtitulo");
const modalSucessoResumoCard = document.getElementById("modal-sucesso-resumo-card");
const btnFecharModalSucesso = document.getElementById("btn-fechar-modal-sucesso");
const btnVerNaAgendaSucesso = document.getElementById("btn-ver-na-agenda-sucesso");

let callbackSalvar = null;
let callbackVerNaAgenda = null;
let ultimoDataIsoAgendada = "";
let ultimoDataBrAgendada = "";
let currentAppAgendamento = null;
let tipoProcedimentoAtual = "depilacao";
let debounceDisponibilidadeTimer = null;

// Mapa em memória com os objetos completos originais dos serviços indexados
const servicosOriginaisRegistry = new Map();

const DIAS_SEMANA = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado"
];

function horaParaMinutos(horaStr = "") {
  if (!horaStr) return 0;
  const partes = String(horaStr).trim().split(":");
  return (Number(partes[0]) || 0) * 60 + (Number(partes[1]) || 0);
}

function minutosParaHora(minutos = 0) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

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

export function calcularIntervaloClinico(tipoOrigem, tipoDestino) {
  if (tipoOrigem === "depilacao" && tipoDestino === "depilacao") return 45;
  if (tipoOrigem === "clareamento" && tipoDestino === "clareamento") return 45;
  if (tipoOrigem === "depilacao" && tipoDestino === "clareamento") return 25;
  if (tipoOrigem === "clareamento" && tipoDestino === "depilacao") return 25;
  return 45;
}

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

function dataBrParaIso(dataBr = "") {
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dataBr)) {
    const [d, m, y] = dataBr.split("/");
    return `${y}-${m}-${d}`;
  }
  return dataBr;
}

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
 * Formata um objeto de serviço estritamente de acordo com a API do Belle (/validacao e /edicaoagenda)
 */
function formatarServicoParaArrServ(s, codOrc, codPlano, idGeinfo) {
  let codServ = Number(s.cod_servico || s.codServico || s.codServ || s.id || s.codigo || 0);
  const sNome = String(s.nome || s.servico || s.nom_servico || "Serviço").trim();
  
  // Tenta encontrar ID oficial no catálogo se estiver zerado
  if (!codServ && state.servicosCatalogo?.length > 0) {
    const sNomeNorm = sNome.toLowerCase();
    const match = state.servicosCatalogo.find(c => {
      const cNome = (c.nome || "").toLowerCase().trim();
      return cNome === sNomeNorm || cNome.includes(sNomeNorm) || sNomeNorm.includes(cNome);
    });
    if (match) {
      codServ = Number(match.id || match.codigo || match.cod_servico || 0);
    }
  }
  if (!codServ) codServ = 55556418;

  const sTempo = Number(s.tempo || s.tempo_atendimento || obterTempoServico(sNome) || 5);
  const sValor = String(s.valor || "0,00");
  const sQtd = String(s.quantidade || s.contratadas || s.sessoes || "10");
  const sGasto = Number(s._gasto ?? s.gasto ?? s.realizadas ?? s.gastos ?? 0);
  const sSaldo = String(s.saldo_atual ?? s.saldo ?? s.restante ?? Math.max(1, Number(sQtd) - sGasto));
  const sCodSaldo = Number(s.cod_saldo || 0);
  const sGeinfo = Number(s.id_geinfo || idGeinfo || state.currentSalas?.[0]?.id_geinfo || 85015);
  const finalCodOrc = Number(codOrc || s.cod_orcamento || 0);

  return {
    id_geinfo: sGeinfo,
    cod_saldo: sCodSaldo,
    cod_orcamento: finalCodOrc,
    cod_servico: codServ,
    nome: sNome,
    valor: sValor,
    tempo: sTempo,
    quantidade: sQtd,
    saldo_atual: sSaldo,
    tipo: Number(s.tipo || 3),
    usa_campanha: String(s.usa_campanha || "2"),
    cod_campanha: Number(s.cod_campanha || 0),
    nome_campanha: s.nome_campanha || "",
    usa_regiao: Boolean(s.usa_regiao),
    dt_renovado: s.dt_renovado || null,
    cod_movimento_renovacao: s.cod_movimento_renovacao || null,
    label: s.label || `${codServ}-${sNome} `,
    _gasto: sGasto,
    usa_dia: s.usa_dia || "1",
    dia_retorno: Number(s.dia_retorno || 0),
    imagem: s.imagem || "",
    custo: String(s.custo || "0,00"),
    sessoes: sQtd,
    gastos: sGasto,
    restante: sSaldo,
    lbCampanha: s.lbCampanha || "",
    usa_equip: Number(s.usa_equip || 0),
    teleatendimento: Boolean(s.teleatendimento)
  };
}

/**
 * Agrupa serviços selecionados por plano com dados completos para o payload
 */
export function calcularPlanosEServicosSelecionados() {
  const checkedInputs = modalAgendaListaServicos?.querySelectorAll("input[name='servico_agendar']:checked:not(:disabled)") || [];
  const planosMap = new Map();

  checkedInputs.forEach(chk => {
    const sNome = chk.value;
    const codOrc = chk.getAttribute("data-plano-orc") || currentAppAgendamento?.codOrcamento || "0";
    const nomePlano = chk.getAttribute("data-plano-nome") || currentAppAgendamento?.nomePlano || "Plano de Sessões";
    const codPlano = chk.getAttribute("data-plano-cod") || currentAppAgendamento?.codPlano || "0";
    const codServico = chk.getAttribute("data-cod-servico") || "";
    const tempoServ = Number(chk.getAttribute("data-tempo")) || obterTempoServico(sNome);
    const saldoRestanteNum = Number(chk.getAttribute("data-saldo-restante") || 1);

    if (saldoRestanteNum <= 0) return; // Trava: não agendamos áreas zeradas

    // Recupera objeto original completo do registro em memória
    const regKey = `${codOrc}_${sNome.trim().toLowerCase()}`;
    const servOriginal = servicosOriginaisRegistry.get(regKey) || servicosOriginaisRegistry.get(`${codOrc}_${codServico}`);

    const servicoFormatado = formatarServicoParaArrServ(
      servOriginal || { nome: sNome, cod_servico: codServico, tempo: tempoServ, saldo_atual: saldoRestanteNum },
      codOrc,
      codPlano,
      currentAppAgendamento?.idGeinfo
    );

    if (!planosMap.has(codOrc)) {
      planosMap.set(codOrc, {
        codOrcamento: codOrc,
        codPlano: codPlano,
        nomePlano: nomePlano,
        duracaoMin: 0,
        servicos: [],
        servicosCompletos: []
      });
    }

    const p = planosMap.get(codOrc);
    p.duracaoMin += servicoFormatado.tempo;
    p.servicos.push({ nome: sNome, tempo: servicoFormatado.tempo, codServico: servicoFormatado.cod_servico });
    p.servicosCompletos.push(servicoFormatado);
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
  let codSalaAlvo = selectedOpt?.getAttribute("data-cod") || modalAgendaSelectSala?.value || currentAppAgendamento?.codSala || "";
  let nomeSalaAlvo = selectedOpt?.getAttribute("data-nome") || selectedOpt?.textContent?.replace(/^📍\s*/, "").trim() || currentAppAgendamento?.salaNome || "";

  if (!codSalaAlvo && Array.isArray(state.currentSalas) && state.currentSalas.length > 0) {
    const sPadrao = state.currentSalas.find(s => (s.nome || s.title || "").toLowerCase().includes("laser") || (s.nome || s.title || "").toLowerCase().includes("procedimento")) || state.currentSalas[0];
    codSalaAlvo = String(sPadrao.cod_sala || sPadrao.id || sPadrao.codigo || "");
    nomeSalaAlvo = (sPadrao.nome || sPadrao.title || "").trim();
  }

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

    if (slotsDisponiveis.length > 0) {
      let optionsHtml = "";
      slotsDisponiveis.forEach((slot) => {
        optionsHtml += `<option value="${slot.inicio}">⏰ ${slot.inicio} às ${slot.fim} (Livre)</option>`;
      });
      modalAgendaSelectHorario.innerHTML = optionsHtml;
      
      const txtInfoPlanos = planos.length > 1 ? ` (bloco de ${planos.length} planos em sequência)` : '';
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
 * Renderiza a lista de serviços estruturados (INDEXA OBJETOS NO REGISTRO EM MEMÓRIA)
 */
function renderizarPlanosEServicos(planosComServicos) {
  if (!modalAgendaListaServicos) return;

  servicosOriginaisRegistry.clear();

  if (!Array.isArray(planosComServicos) || planosComServicos.length === 0) {
    modalAgendaListaServicos.innerHTML = '<div style="font-size: 11px; color: #64748b; padding: 4px;">Nenhuma área encontrada no plano.</div>';
    return;
  }

  let html = "";
  planosComServicos.forEach((plano, pIdx) => {
    const isMultiplo = planosComServicos.length > 1;
    const codOrcPlano = plano.codOrcamento || "";
    const codPlanoPlano = plano.codPlano || "";
    const nomePlanoPlano = plano.nomePlano || "Plano de Sessões";

    const headerPlanoHtml = isMultiplo ? `
      <div style="font-size: 11px; font-weight: 800; color: #0369a1; background: #e0f2fe; padding: 3px 6px; border-radius: 4px; margin-top: ${pIdx > 0 ? '6px' : '0'}; margin-bottom: 3px; display: flex; justify-content: space-between;">
        <span>📦 Plano #${pIdx + 1}: ${nomePlanoPlano}</span>
        <small style="color: #0284c7;">#${codOrcPlano}</small>
      </div>
    ` : '';

    let servicosItemsHtml = "";
    plano.servicos.forEach((s, sIdx) => {
      const sNome = String(s.servico || s.nome || s.nom_servico || `Área #${sIdx + 1}`).trim();
      const sTipo = identificarTipoProcedimento(sNome);
      const iconTipo = (sTipo === "clareamento") ? "🧴" : "🪒";
      
      const realizadas = parseInt(s.gasto || s.realizadas || s.qtd_executada || s.gastos || 0, 10);
      const contratadas = parseInt(s.quantidade || s.contratadas || s.qtd_contratada || s.sessoes || 10, 10);
      const saldoRestante = parseInt(s.saldo_atual || s.saldo || s.restante || (contratadas - realizadas), 10);
      const proximaSessao = realizadas + 1;
      const tempoServ = Number(s.tempo || s.tempo_atendimento || obterTempoServico(sNome));
      const codServico = String(s.cod_servico || s.codServico || s.codServ || "");

      // Registra o objeto original no mapa em memória
      const servFormatado = formatarServicoParaArrServ(s, codOrcPlano, codPlanoPlano, currentAppAgendamento?.idGeinfo);
      servicosOriginaisRegistry.set(`${codOrcPlano}_${sNome.toLowerCase()}`, servFormatado);
      if (codServico) {
        servicosOriginaisRegistry.set(`${codOrcPlano}_${codServico}`, servFormatado);
      }

      let sessaoTxt = "";
      const isSaldoZerado = (saldoRestante <= 0);

      if (contratadas > 0) {
        if (!isSaldoZerado) {
          sessaoTxt = `(Sessão ${proximaSessao}/${contratadas} • Saldo: ${saldoRestante} | ⏱️ ${tempoServ}m)`;
        } else {
          sessaoTxt = `(Concluído ${realizadas}/${contratadas} • Saldo Zerado)`;
        }
      }

      const isChecked = !isSaldoZerado ? "checked" : "";
      const isDesabilitado = isSaldoZerado ? "disabled" : "";
      const estiloLabel = isSaldoZerado ? "style='opacity: 0.5; background: #f1f5f9; cursor: not-allowed;'" : "";

      servicosItemsHtml += `
        <label class="check-servico-item" ${estiloLabel}>
          <input 
            type="checkbox" 
            name="servico_agendar" 
            value="${sNome}" 
            data-plano-orc="${codOrcPlano}"
            data-plano-cod="${codPlanoPlano}"
            data-plano-nome="${nomePlanoPlano}"
            data-cod-servico="${codServico}"
            data-tempo="${tempoServ}"
            data-saldo-restante="${saldoRestante}"
            ${isChecked}
            ${isDesabilitado}
          >
          <span>${iconTipo} <strong>${sNome}</strong> ${sessaoTxt ? `<small style="color: ${isSaldoZerado ? '#94a3b8' : '#0284c7'}; font-weight: 700;">${sessaoTxt}</small>` : ''}</span>
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

  modalAgendaListaServicos.querySelectorAll("input[name='servico_agendar']:not(:disabled)").forEach(chk => {
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

  // 1. Configura salas da unidade ativa
  if (modalAgendaSelectSala) {
    modalAgendaSelectSala.innerHTML = "";
    
    // Sempre sincroniza o grid de salas atualizado da unidade
    let salas = await buscarGridSalaApi(state.currentToken, state.currentCodEstab);
    if (Array.isArray(salas) && salas.length > 0) {
      state.currentSalas = salas;
    } else {
      salas = state.currentSalas || [];
    }

    if (salas.length > 0) {
      const limpa = (str) => (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
      const appNomeLimpo = limpa(app.salaNome || app.sala || "");
      const appCodLimpo = String(app.codSala || "").trim();
      let optSelecionada = false;

      salas.forEach(sala => {
        const sCod = String(sala.cod_sala || sala.id || sala.codigo || "").trim();
        const sNome = (sala.nome || sala.title || sala.label || "").trim();
        const opt = document.createElement("option");
        opt.value = sCod;
        opt.setAttribute("data-cod", sCod);
        opt.setAttribute("data-nome", sNome);
        opt.textContent = `📍 ${sNome}`;

        const sNomeLimpo = limpa(sNome);
        const isMesmaSala = (!optSelecionada) && (
          (appCodLimpo && sCod === appCodLimpo) ||
          (appNomeLimpo && (sNomeLimpo === appNomeLimpo || sNomeLimpo.includes(appNomeLimpo) || appNomeLimpo.includes(sNomeLimpo)))
        );

        if (isMesmaSala) {
          opt.selected = true;
          optSelecionada = true;
        }
        modalAgendaSelectSala.appendChild(opt);
      });

      if (!optSelecionada && modalAgendaSelectSala.options.length > 0) {
        let idxLaser = -1;
        for (let i = 0; i < modalAgendaSelectSala.options.length; i++) {
          const optTxt = modalAgendaSelectSala.options[i].textContent.toLowerCase();
          if (optTxt.includes("laser") || optTxt.includes("procedimento")) {
            idxLaser = i;
            break;
          }
        }
        modalAgendaSelectSala.selectedIndex = idxLaser >= 0 ? idxLaser : 0;
      }
    }
  }

  // 2. Consulta e agrupa todos os planos e saldos da paciente
  if (modalAgendaListaServicos) {
    modalAgendaListaServicos.innerHTML = '<div style="font-size: 11px; color: #64748b; padding: 4px;">Carregando planos e saldo de sessões...</div>';
    
    const planosEstruturados = [];
    const agendamentosClienteHoje = (state.appointmentsData || []).filter(a => String(a.codCliente) === String(app.codCliente));
    const orcamentosProcessados = new Set();

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
          cod_servico: s.cod_servico || s.codServico || "",
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

    renderizarPlanosEServicos(planosEstruturados);
  }

  // 3. Listeners de Data e Hora
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

export function configurarModalAgendarProxima({ onVerNaAgenda } = {}) {
  if (onVerNaAgenda) callbackVerNaAgenda = onVerNaAgenda;
}

export function fecharModalSucesso() {
  if (modalAgendamentoSucesso) {
    modalAgendamentoSucesso.style.display = "none";
  }
}

export function abrirModalSucesso(clienteNome, dataBr, dataIso, nomeSala, planosAgendados) {
  if (!modalAgendamentoSucesso) return;
  ultimoDataIsoAgendada = dataIso || "";
  ultimoDataBrAgendada = dataBr || "";

  if (modalSucessoSubtitulo) {
    modalSucessoSubtitulo.innerHTML = `Sessão cadastrada com sucesso para <strong>${clienteNome || 'a cliente'}</strong> no Belle Software:`;
  }

  if (modalSucessoResumoCard) {
    let diaSemanaTxt = "";
    if (dataIso && /^\d{4}-\d{2}-\d{2}$/.test(dataIso)) {
      const [y, m, d] = dataIso.split("-").map(Number);
      const dtObj = new Date(y, m - 1, d);
      diaSemanaTxt = ` (${DIAS_SEMANA[dtObj.getDay()] || ''})`;
    }

    let planosHtml = "";
    (planosAgendados || []).forEach((p, idx) => {
      const servs = (p.servicos || []).map(s => (s.nome || "Área").split("-")[0].trim()).join(", ");
      planosHtml += `
        <div style="background: #ffffff; border: 1.5px solid #bfdbfe; border-radius: 8px; padding: 8px 10px; margin-top: ${idx > 0 ? '6px' : '0'};">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
            <span style="font-weight: 800; color: #0284c7; font-size: 12px;">⏰ ${p.horarioInicio} às ${p.horarioFim}</span>
            <span class="badge-count-pill" style="background: #e0f2fe; color: #0369a1; font-size: 10px; font-weight: 700;">⏱️ ${p.duracaoMin} min</span>
          </div>
          <div style="font-weight: 700; color: #0f172a; font-size: 12px; margin-bottom: 2px;">
            ✨ ${servs}
          </div>
          <div style="font-size: 10.5px; color: #64748b;">
            📦 ${p.nomePlano || 'Plano de Sessões'}
          </div>
        </div>
      `;
    });

    modalSucessoResumoCard.innerHTML = `
      <div style="margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px dashed #cbd5e1;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="color: #0f172a; font-size: 13px;">👤 ${clienteNome}</strong>
          <span class="app-badge badge-agendado" style="font-size: 9.5px;">Marcado</span>
        </div>
        <div style="color: #0284c7; font-size: 12px; font-weight: 700; margin-top: 3px;">
          🗓️ Data: <strong>${dataBr}</strong><span style="font-weight: 600; color: #64748b;">${diaSemanaTxt}</span>
        </div>
        <div style="color: #475569; font-size: 11px; margin-top: 2px;">
          📍 Sala: <strong>${nomeSala}</strong>
        </div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px;">
        ${planosHtml}
      </div>
    `;
  }

  modalAgendamentoSucesso.style.display = "flex";
}

btnFecharModalSucesso?.addEventListener("click", () => {
  fecharModalSucesso();
});

btnVerNaAgendaSucesso?.addEventListener("click", () => {
  fecharModalSucesso();
  if (typeof callbackVerNaAgenda === "function" && ultimoDataIsoAgendada) {
    callbackVerNaAgenda(ultimoDataIsoAgendada, ultimoDataBrAgendada);
  }
});

/**
 * Salva oficialmente o agendamento no Belle Software (validacao + edicaoagenda)
 */
btnConfirmarAgendarProxima?.addEventListener("click", async () => {
  if (!currentAppAgendamento) return;

  const dataEscolhidaBr = modalAgendaInputDataBr?.value || "";
  const dataIso = dataBrParaIso(dataEscolhidaBr);
  const horaEscolhida = modalAgendaSelectHorario?.value || "09:00";
  
  const selectedOpt = modalAgendaSelectSala?.selectedOptions?.[0];
  let codSalaAlvo = selectedOpt?.getAttribute("data-cod") || modalAgendaSelectSala?.value || currentAppAgendamento?.codSala || "";
  let nomeSalaAlvo = selectedOpt?.getAttribute("data-nome") || selectedOpt?.textContent?.replace(/^📍\s*/, "").trim() || currentAppAgendamento?.salaNome || "";

  if (!codSalaAlvo && Array.isArray(state.currentSalas) && state.currentSalas.length > 0) {
    const sPadrao = state.currentSalas.find(s => (s.nome || s.title || "").toLowerCase().includes("laser") || (s.nome || s.title || "").toLowerCase().includes("procedimento")) || state.currentSalas[0];
    codSalaAlvo = String(sPadrao.cod_sala || sPadrao.id || sPadrao.codigo || "");
    nomeSalaAlvo = (sPadrao.nome || sPadrao.title || "").trim();
  }

  const { planos, duracaoTotalMin } = calcularPlanosEServicosSelecionados();
  if (planos.length === 0) {
    alert("⚠️ Nenhuma área com saldo disponível selecionada para agendar.");
    return;
  }

  if (!horaEscolhida) {
    alert("⚠️ Selecione um horário disponível.");
    return;
  }

  // Validação estrita de integridade do arrServ
  for (const p of planos) {
    if (!Array.isArray(p.servicosCompletos) || p.servicosCompletos.length === 0) {
      alert(`⚠️ Erro: Nenhum serviço válido identificado para o plano ${p.nomePlano}.`);
      return;
    }
  }

  btnConfirmarAgendarProxima.disabled = true;
  btnConfirmarAgendarProxima.textContent = "⏳ Gravando no Belle...";

  let startMin = horaParaMinutos(horaEscolhida);
  const [y, m, d] = dataIso.split("-").map(Number);
  const dataObj = new Date(y, m - 1, d);
  const diaSemanaNum = dataObj.getDay();

  const resultadosGravacao = [];

  for (let i = 0; i < planos.length; i++) {
    const p = planos[i];
    const endMin = startMin + p.duracaoMin;
    const hIni = minutosParaHora(startMin);
    const hFim = minutosParaHora(endMin);
    startMin = endMin;

    p.horarioInicio = hIni;
    p.horarioFim = hFim;

    // 1. Monta Payload de Validação (/validacao)
    const payloadValidacao = {
      codAgenda: "",
      status: "",
      codOrc: Number(p.codOrcamento) || 0,
      codCli: Number(currentAppAgendamento.codCliente) || 0,
      arrServ: p.servicosCompletos,
      statusAlterado: "Marcado"
    };

    console.log(`[Agendamento ${i + 1}/${planos.length}] 📤 Disparando /validacao:`, payloadValidacao);
    await validarAgendamentoApi(state.currentToken, payloadValidacao, state.currentCodEstab);

    // 2. Monta Payload Oficial de Gravação (/edicaoagenda)
    const payloadEdicao = {
      obs: "Agendado via Belle Copilot",
      TAA: "",
      tipo: "3",
      estab: String(state.currentCodEstab || "1"),
      saldo: "",
      hrFim: hFim,
      hrIni: hIni,
      visao: "resourceTimeGridDay",
      codOrc: Number(p.codOrcamento) || 0,
      status: "Marcado",
      tpPlano: "orc",
      codSala: String(codSalaAlvo),
      codConv: "",
      tpArea: "1",
      tipoObs: 2264,
      codEquip: "",
      nomeProf: currentAppAgendamento.profissional || "",
      codPlano: Number(p.codPlano) || 0,
      vendedor: state.currentCodUsuario || "master-admin",
      codRegiao: "",
      tpEdicao: "I",
      codAgenda: "",
      codOrcOld: "",
      statusAnt: "",
      tpAgd: "sala",
      codCliente: Number(currentAppAgendamento.codCliente) || 0,
      codProfiss: currentAppAgendamento.codProfissional || "",
      tpAgendaOld: "",
      tpAgenda: "Serviço",
      teleatendimento: "",
      fltCli: String(currentAppAgendamento.codCliente || ""),
      usaInt: true,
      ckConv: false,
      usaPlan: true,
      planVld: false,
      preferencia: false,
      dia: diaSemanaNum,
      obOrc: {
        cod_orcamento: Number(p.codOrcamento) || 0,
        cod_plano: Number(p.codPlano) || 0,
        nome: p.nomePlano || "",
        dtOrc: "",
        tipo: "3",
        forma: "p",
        servicos: p.servicosCompletos.map(s => ({
          codServico: Number(s.cod_servico),
          saldoRestante: Number(s.saldo_atual || s.restante || 1),
          nome: s.nome
        }))
      },
      obCli: {
        cod_paciente: Number(currentAppAgendamento.codCliente) || 0,
        nom_paciente: currentAppAgendamento.clienteNome || "",
        cpf: currentAppAgendamento.cpf || "",
        celular: currentAppAgendamento.telefone || ""
      },
      obServ: p.servicosCompletos,
      obHora: { label: hIni, value: hIni },
      obConv: { label: "0-Particular", value: "" },
      obEstab: {
        cod: String(state.currentCodEstab || "1"),
        nome: state.currentClinicaNome || "Estética & Laser"
      },
      obVendedor: {
        label: state.currentUserName || "Master",
        value: { cod_usuario: state.currentCodUsuario || "master-admin" }
      },
      obSala: {
        label: nomeSalaAlvo,
        value: { nome: nomeSalaAlvo, codSala: String(codSalaAlvo), tempo: "5" }
      },
      arrReg: [],
      arrServ: p.servicosCompletos,
      arrEquip: [],
      tempo: p.duracaoMin,
      dtAgenda: `${dataIso}, 00:00:00`,
      dtAgendaComp: `${dataIso}, 00:00:00`,
      obObs: 2264,
      teleAtend: false
    };

    console.log(`[Agendamento ${i + 1}/${planos.length}] 💾 Disparando /edicaoagenda com ${p.servicosCompletos.length} serviços no arrServ:`, payloadEdicao);
    const resGravar = await salvarEdicaoAgendaApi(state.currentToken, payloadEdicao, state.currentCodEstab);
    resultadosGravacao.push({ plano: p, res: resGravar });
  }

  btnConfirmarAgendarProxima.disabled = false;
  btnConfirmarAgendarProxima.textContent = "💾 Salvar Agendamento";

  const sucessos = resultadosGravacao.filter(r => r.res?.success);
  if (sucessos.length > 0) {
    const nomeClienteSalvo = currentAppAgendamento?.clienteNome || "Cliente";
    const dataIsoSalvo = dataIso;
    const dataBrSalvo = dataEscolhidaBr;

    if (typeof callbackSalvar === "function") {
      callbackSalvar(resultadosGravacao);
    }

    fecharModalAgendarProxima();
    abrirModalSucesso(nomeClienteSalvo, dataBrSalvo, dataIsoSalvo, nomeSalaAlvo, planos);
  } else {
    alert("❌ Erro ao salvar agendamento no Belle. Verifique a conexão com o sistema.");
  }
});

btnCancelarAgendarProxima?.addEventListener("click", () => {
  fecharModalAgendarProxima();
});

modalAgendaSelectSala?.addEventListener("change", () => {
  carregarDisponibilidadeHorarios();
});
