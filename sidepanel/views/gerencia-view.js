/**
 * BELLE COPILOT - MÓDULO DE GESTÃO & AUDITORIA DE SESSÕES
 * Exclusivo para Gerência / Diretoria / Master.
 * 
 * Junta a Agenda do Dia com o painel de Atendimento Clínico:
 * Puxa os clientes agendados no dia, busca todos os planos e saldos de cada cliente,
 * e renderiza os pacotes e áreas com as bolinhas de sessões (stepper) idênticas ao Atendimento.
 */

import { state, clientesPacotesCache, clientesSaldosCache, arrGridDaUnidade } from '../core/state.js';
import { 
  buscarVendasPlanosClienteApi, 
  buscarSaldoVendaPlanoApi, 
  buscarAgendaApi 
} from '../core/api-client.js';

// Elementos de UI
let containerGerencia = null;
let listaGerenciaCards = null;
let emptyStateGerencia = null;
let emptyStateText = null;
let loadingGerencia = null;
let subtituloDiaGerencia = null;
let inputBuscaGerencia = null;
let btnRecarregarGerencia = null;
let btnFiltroTodos = null;
let btnFiltroDiscrepancia = null;
let btnFiltroRetaFinal = null;
let countBadgeTodos = null;
let countBadgeDiscrepancia = null;
let countBadgeRetaFinal = null;

// Cache local de saldos de orçamentos para resposta instantânea
const cacheSaldosOrcamentos = new Map();

// Estado local da visão de Gerência
let cacheClientesDoDia = [];
let filtroAtivoGerencia = "todos"; // "todos" | "discrepancia" | "reta_final"
let termoBuscaGerencia = "";
let carregandoGerencia = false;

/**
 * Analisa os serviços de um pacote para identificar discrepância entre áreas ou reta final
 */
function analisarDiscrepanciaPacote(servicosSaldo) {
  if (!Array.isArray(servicosSaldo) || servicosSaldo.length === 0) {
    return { temDiscrepancia: false, minRealizadas: 0, maxRealizadas: 0, diferenca: 0, retaFinal: false };
  }

  const realizadasArray = servicosSaldo.map(s => Number(s.gasto ?? s.realizadas ?? s.qtd_executada ?? 0));
  const contratadasArray = servicosSaldo.map(s => Number(s.quantidade ?? s.contratadas ?? s.qtd_contratada ?? 10));

  const minRealizadas = Math.min(...realizadasArray);
  const maxRealizadas = Math.max(...realizadasArray);
  const diferenca = maxRealizadas - minRealizadas;

  const temDiscrepancia = servicosSaldo.length > 1 && diferenca > 0;

  const retaFinal = servicosSaldo.some(s => {
    const r = Number(s.gasto ?? s.realizadas ?? 0);
    const c = Number(s.quantidade ?? s.contratadas ?? 10);
    return c > 0 && ((r / c) >= 0.8 || (c - r) <= 2);
  });

  return {
    temDiscrepancia,
    minRealizadas,
    maxRealizadas,
    diferenca,
    retaFinal
  };
}

/**
 * Gera o HTML do stepper com as bolinhas de sessões idênticas à aba de Atendimento
 */
function gerarStepperBolinhasHtml(qtdRealizadas, qtdContratadas, pct) {
  if (qtdContratadas <= 0) return "";

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
      const dotClass = isDone 
        ? (isCurrent ? "stepper-dot dot-done dot-current" : "stepper-dot dot-done") 
        : "stepper-dot dot-empty";
      const dotTitle = isDone 
        ? (isCurrent ? `Sessão ${i} (Última realizada)` : `Sessão ${i} (Concluída)`) 
        : `Sessão ${i} (Pendente)`;
      dotsItems += `<span class="${dotClass}" title="${dotTitle}"></span>`;
    }

    return `
      <div class="atend-session-stepper gerencia-stepper" title="${qtdRealizadas} de ${qtdContratadas} sessões realizadas (${pct}%)">
        <div class="atend-stepper-track">
          <div class="atend-stepper-fill" style="width: ${larguraFill}%;"></div>
        </div>
        <div class="atend-stepper-dots">
          ${dotsItems}
        </div>
      </div>
    `;
  }

  // Mais de 15 sessões: barra contínua de progresso
  return `
    <div class="atend-session-bar-wrap gerencia-bar" title="${qtdRealizadas} de ${qtdContratadas} sessões (${pct}%)">
      <div class="atend-session-bar-fill" style="width: ${pct}%;"></div>
    </div>
  `;
}

/**
 * Renderiza um card de plano/pacote com todas as suas áreas e bolinhas de sessões
 */
function renderizarCardPlanoHtml(plano) {
  const nomePlano = plano.nomePlano || plano.nome || plano.descricao || "Pacote de Tratamento";
  const codOrc = plano.codOrcamento || plano.cod_orcamento || "";
  const servicos = plano.servicos || [];

  const analise = analisarDiscrepanciaPacote(servicos);

  let areasHtml = "";
  if (servicos.length > 0) {
    areasHtml = servicos.map(s => {
      const sNome = s.servico || s.nome || s.nom_servico || "Área";
      const realizadas = Number(s.gasto ?? s.realizadas ?? s.qtd_executada ?? 0);
      const contratadas = Number(s.quantidade ?? s.contratadas ?? s.qtd_contratada ?? 10);
      const pct = Math.min(100, Math.round((realizadas / Math.max(1, contratadas)) * 100));

      const ficouAtras = analise.temDiscrepancia && realizadas < analise.maxRealizadas;
      const sDiff = analise.maxRealizadas - realizadas;

      return `
        <div class="gerencia-area-row ${ficouAtras ? 'area-descompassada' : ''}">
          <div class="gerencia-area-header">
            <span class="gerencia-area-nome" title="${sNome}">${sNome}</span>
            <div class="gerencia-area-score">
              ${ficouAtras ? `<span class="gerencia-tag-atras" title="Esta área está ${sDiff} sessão(ões) atrás da mais adiantada">-${sDiff}</span>` : ''}
              <span class="gerencia-area-contagem ${ficouAtras ? 'contagem-alerta' : ''}">Sessão ${realizadas}/${contratadas}</span>
            </div>
          </div>
          ${gerarStepperBolinhasHtml(realizadas, contratadas, pct)}
        </div>
      `;
    }).join("");
  } else {
    areasHtml = `<div style="font-size: 11px; color: #94a3b8; font-style: italic; padding: 4px;">Nenhuma área com saldo discriminado neste plano.</div>`;
  }

  return `
    <div class="gerencia-plano-bloco" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; margin-top: 6px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <div style="font-size: 11.5px; font-weight: 800; color: #1e293b; display: flex; align-items: center; gap: 5px;">
          <span>📦</span>
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 240px;" title="${nomePlano}">${nomePlano}</span>
          ${codOrc ? `<span style="font-size: 10px; color: #64748b; background: #e2e8f0; padding: 1px 5px; border-radius: 4px;">#${codOrc}</span>` : ''}
        </div>
        ${analise.temDiscrepancia ? `<span class="gerencia-tag-alerta" style="font-size: 9.5px; padding: 1px 6px;">⚠️ Discrepância</span>` : ''}
      </div>
      <div class="gerencia-areas-container" style="background: #ffffff; padding: 6px 8px; border: 1px solid #f1f5f9; border-radius: 6px;">
        ${areasHtml}
      </div>
    </div>
  `;
}

/**
 * Renderiza o card consolidado de um cliente da agenda do dia
 */
function renderizarCardClienteHtml(cliente) {
  const nomeCli = cliente.nomeCliente || "Cliente sem Nome";
  const codCli = cliente.codCliente || "";
  const telLimpo = (cliente.telefone || "").replace(/\D/g, "");
  const zapUrl = telLimpo.length >= 10 ? `https://wa.me/55${telLimpo}` : "";

  // Agendamentos de hoje
  const agendamentosHoje = cliente.agendamentosHoje || [];
  const horariosHoje = agendamentosHoje.map(a => a.horario).filter(Boolean).join(", ") || "--:--";
  const salasHoje = Array.from(new Set(agendamentosHoje.map(a => a.salaNome || a.sala).filter(Boolean))).join(", ");
  const statusHoje = agendamentosHoje[0]?.statusFormatado || agendamentosHoje[0]?.status || "Agendado";

  const planos = cliente.planos || [];

  // Verifica se qualquer plano do cliente tem discrepância ou reta final
  let temDiscrepanciaGlobal = false;
  let temRetaFinalGlobal = false;

  planos.forEach(p => {
    const analise = analisarDiscrepanciaPacote(p.servicos || []);
    if (analise.temDiscrepancia) temDiscrepanciaGlobal = true;
    if (analise.retaFinal) temRetaFinalGlobal = true;
  });

  let badgesHtml = "";
  if (temDiscrepanciaGlobal) {
    badgesHtml += `<span class="gerencia-tag-alerta" title="Há áreas com número de sessões diferentes no mesmo pacote">⚠️ Discrepância</span>`;
  } else if (temRetaFinalGlobal) {
    badgesHtml += `<span class="gerencia-tag-retafinal" title="Cliente com 80%+ das sessões feitas (Oportunidade de Renovação)">🎯 Reta Final</span>`;
  } else {
    badgesHtml += `<span class="gerencia-tag-ok" title="Todas as áreas em dia">✓ Sessões Alinhadas</span>`;
  }

  let planosHtml = "";
  if (planos.length > 0) {
    planosHtml = planos.map(p => renderizarCardPlanoHtml(p)).join("");
  } else {
    // Fallback: se não tiver pacote cadastrado, exibe os serviços agendados hoje
    const servsHoje = agendamentosHoje.flatMap(a => {
      if (Array.isArray(a.arrServ) && a.arrServ.length > 0) return a.arrServ;
      if (a.procedimento) return [{ nome: a.procedimento }];
      return [];
    });

    planosHtml = `
      <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; padding: 8px 10px; margin-top: 6px; font-size: 11px; color: #64748b;">
        <div style="font-weight: 700; color: #475569; margin-bottom: 4px;">Atendimento Avulso / Procedimento Hoje:</div>
        ${servsHoje.length > 0 
          ? servsHoje.map(s => `<div>• ${s.nome || s.servico || 'Procedimento'}</div>`).join("") 
          : '<div>Nenhum plano ativo encontrado no histórico do cliente.</div>'}
      </div>
    `;
  }

  return `
    <div class="gerencia-client-card ${temDiscrepanciaGlobal ? 'card-tem-discrepancia' : ''}" data-cliente-id="${codCli}">
      <!-- Topo do Card: Informações do Cliente & Status de Hoje -->
      <div class="gerencia-card-top">
        <div class="gerencia-client-info">
          <div class="gerencia-client-nome" title="${nomeCli}">${nomeCli}</div>
          <div style="font-size: 11px; color: #64748b; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <span>🆔 #${codCli}</span>
            <span>•</span>
            <span style="color: #0369a1; font-weight: 700;">⏰ Hoje: ${horariosHoje}</span>
            ${salasHoje ? `<span>• 📍 ${salasHoje}</span>` : ''}
            <span style="background: #f1f5f9; padding: 1px 5px; border-radius: 4px; font-weight: 600;">${statusHoje}</span>
          </div>
        </div>
        <div class="gerencia-card-badges">
          ${badgesHtml}
        </div>
      </div>

      <!-- Planos e Steppers de Sessões (Igual ao Atendimento) -->
      <div class="gerencia-planos-wrap">
        ${planosHtml}
      </div>

      <!-- Rodapé: Ações Rápidas -->
      <div class="gerencia-card-footer">
        <span style="font-size: 10px; color: #94a3b8;">${planos.length} plano(s) / pacote(s) cadastrado(s)</span>
        ${zapUrl ? `
          <a href="${zapUrl}" target="_blank" rel="noopener noreferrer" class="btn-gerencia-whats" title="Conversar no WhatsApp">
            <span>💬 WhatsApp</span>
          </a>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Filtra e renderiza os cards de clientes na tela
 */
function renderizarListaClientes() {
  if (!listaGerenciaCards) return;

  const termo = termoBuscaGerencia.trim().toLowerCase();

  const clientesFiltrados = cacheClientesDoDia.filter(cliente => {
    // 1. Filtro textual
    if (termo) {
      const matchNome = (cliente.nomeCliente || "").toLowerCase().includes(termo);
      const matchCod = String(cliente.codCliente || "").toLowerCase().includes(termo);
      const matchPlano = (cliente.planos || []).some(p => {
        const pNome = (p.nomePlano || p.nome || "").toLowerCase();
        const pServ = (p.servicos || []).some(s => (s.servico || s.nome || "").toLowerCase().includes(termo));
        return pNome.includes(termo) || pServ;
      });

      if (!matchNome && !matchCod && !matchPlano) return false;
    }

    // 2. Filtro de auditoria por botão
    if (filtroAtivoGerencia === "discrepancia") {
      return (cliente.planos || []).some(p => analisarDiscrepanciaPacote(p.servicos || []).temDiscrepancia);
    }

    if (filtroAtivoGerencia === "reta_final") {
      return (cliente.planos || []).some(p => analisarDiscrepanciaPacote(p.servicos || []).retaFinal);
    }

    return true;
  });

  // Atualiza contadores dos badges
  let totalDiscrepancia = 0;
  let totalRetaFinal = 0;

  cacheClientesDoDia.forEach(cliente => {
    let temDisc = false;
    let temReta = false;
    (cliente.planos || []).forEach(p => {
      const a = analisarDiscrepanciaPacote(p.servicos || []);
      if (a.temDiscrepancia) temDisc = true;
      if (a.retaFinal) temReta = true;
    });
    if (temDisc) totalDiscrepancia++;
    if (temReta) totalRetaFinal++;
  });

  if (countBadgeTodos) countBadgeTodos.textContent = String(cacheClientesDoDia.length);
  if (countBadgeDiscrepancia) countBadgeDiscrepancia.textContent = String(totalDiscrepancia);
  if (countBadgeRetaFinal) countBadgeRetaFinal.textContent = String(totalRetaFinal);

  // Badge no título da sub-aba de navegação
  const badgeAba = document.getElementById("badge-gerencia-alerta");
  if (badgeAba) {
    if (totalDiscrepancia > 0) {
      badgeAba.textContent = String(totalDiscrepancia);
      badgeAba.style.display = "inline-flex";
    } else {
      badgeAba.style.display = "none";
    }
  }

  // Renderiza cards
  if (clientesFiltrados.length === 0) {
    listaGerenciaCards.innerHTML = "";
    if (emptyStateGerencia) {
      emptyStateGerencia.style.display = "block";
      if (emptyStateText) {
        if (cacheClientesDoDia.length === 0) {
          emptyStateText.textContent = "Nenhum cliente agendado na Agenda para a data selecionada.";
        } else if (filtroAtivoGerencia === "discrepancia") {
          emptyStateText.textContent = "Nenhum cliente com discrepância de sessões encontrado hoje. Todos os pacotes estão alinhados!";
        } else if (filtroAtivoGerencia === "reta_final") {
          emptyStateText.textContent = "Nenhum cliente na reta final (80%+ realizado) agendado hoje.";
        } else {
          emptyStateText.textContent = "Nenhum cliente encontrado com os critérios de busca.";
        }
      }
    }
    return;
  }

  if (emptyStateGerencia) emptyStateGerencia.style.display = "none";
  listaGerenciaCards.innerHTML = clientesFiltrados.map(c => renderizarCardClienteHtml(c)).join("");
}

/**
 * Carrega a lista de clientes agendados no dia atual da Agenda,
 * busca todos os planos de cada cliente e consolida os saldos de cada área
 */
export async function carregarGestaoClientesDia() {
  if (carregandoGerencia) return;
  carregandoGerencia = true;

  if (loadingGerencia) loadingGerencia.style.display = "flex";
  if (emptyStateGerencia) emptyStateGerencia.style.display = "none";
  if (listaGerenciaCards) listaGerenciaCards.innerHTML = "";

  try {
    const dataAgenda = state.currentDataAgenda || new Date().toISOString().split("T")[0];
    if (subtituloDiaGerencia) {
      subtituloDiaGerencia.textContent = `Auditando clientes da data: ${dataAgenda}`;
    }

    // 1. Obtém os agendamentos do dia (usa o cache de state.appointmentsData se já carregado)
    let agendamentosDia = state.appointmentsData || [];
    if (!Array.isArray(agendamentosDia) || agendamentosDia.length === 0) {
      try {
        const raw = await buscarAgendaApi(
          state.currentToken,
          dataAgenda,
          arrGridDaUnidade(state.currentCodEstab),
          state.currentCodEstab
        );
        if (Array.isArray(raw)) {
          agendamentosDia = raw;
        }
      } catch (e) {
        console.warn("[GerenciaView] Erro ao buscar agenda do dia:", e);
      }
    }

    // 2. Agrupa por cliente único
    const mapaClientes = new Map();
    agendamentosDia.forEach(app => {
      const codCli = String(app.codCliente || app.codPaciente || app.idPaciente || "").trim();
      if (!codCli) return;

      if (!mapaClientes.has(codCli)) {
        mapaClientes.set(codCli, {
          codCliente: codCli,
          nomeCliente: app.nomeCliente || "Cliente sem Nome",
          telefone: app.telefone || "",
          agendamentosHoje: [],
          planos: []
        });
      }
      mapaClientes.get(codCli).agendamentosHoje.push(app);
    });

    const listaClientes = Array.from(mapaClientes.values());

    if (listaClientes.length === 0) {
      cacheClientesDoDia = [];
      if (loadingGerencia) loadingGerencia.style.display = "none";
      renderizarListaClientes();
      return;
    }

    // 3. Para cada cliente, busca TODOS os planos e os saldos detalhados (com controle de concorrência)
    const batchSize = 3;
    for (let i = 0; i < listaClientes.length; i += batchSize) {
      const lote = listaClientes.slice(i, i + batchSize);
      await Promise.allSettled(lote.map(async cliente => {
        try {
          const codCli = cliente.codCliente;

          // Busca pacotes do cliente (reaproveita cache se disponível)
          let pacotes = clientesPacotesCache.get(codCli);
          if (!pacotes && state.currentToken) {
            pacotes = await buscarVendasPlanosClienteApi(state.currentToken, codCli, state.currentCodEstab);
            if (Array.isArray(pacotes)) {
              clientesPacotesCache.set(codCli, pacotes);
            }
          }

          const pacotesArray = Array.isArray(pacotes) ? pacotes : [];

          // Identifica orçamentos conhecidos a partir dos agendamentos de hoje
          const orcsDosAgendamentos = cliente.agendamentosHoje
            .map(a => String(a.codOrcamento || "").trim())
            .filter(Boolean);

          // Se não houver planos retornados por buscarVendasPlanosClienteApi, usa os orçamentos dos agendamentos de hoje
          const orcsConsolidados = new Map();

          pacotesArray.forEach(p => {
            const orc = String(p.cod_orcamento || "").trim();
            if (orc) {
              orcsConsolidados.set(orc, {
                codOrcamento: orc,
                nomePlano: p.nome_plano || p.nome || p.descricao || "Plano / Pacote",
                codPlano: p.cod_plano || 0,
                idGeinfo: p.id_geinfo || state.currentIdGeinfo
              });
            }
          });

          orcsDosAgendamentos.forEach(orc => {
            if (!orcsConsolidados.has(orc)) {
              const agMatch = cliente.agendamentosHoje.find(a => String(a.codOrcamento).trim() === orc);
              orcsConsolidados.set(orc, {
                codOrcamento: orc,
                nomePlano: agMatch?.nomePlano || agMatch?.procedimento || "Pacote Agendado Hoje",
                codPlano: agMatch?.codPlano || 0,
                idGeinfo: agMatch?.idGeinfo || state.currentIdGeinfo
              });
            }
          });

          // Para cada orçamento do cliente, busca o saldo das áreas
          const planosDoCliente = [];

          for (const [orcKey, dadosOrc] of orcsConsolidados.entries()) {
            let saldoServicos = cacheSaldosOrcamentos.get(orcKey);

            if (!saldoServicos && state.currentToken) {
              try {
                const resSaldo = await buscarSaldoVendaPlanoApi(
                  state.currentToken,
                  dadosOrc.codOrcamento,
                  dadosOrc.codPlano,
                  dadosOrc.idGeinfo,
                  state.currentCodEstab
                );
                if (Array.isArray(resSaldo) && resSaldo.length > 0) {
                  saldoServicos = resSaldo;
                  cacheSaldosOrcamentos.set(orcKey, resSaldo);
                }
              } catch (e) {}
            }

            // Fallback para lbServ se a API não trouxer o array estruturado
            if (!saldoServicos) {
              const agComLb = cliente.agendamentosHoje.find(a => String(a.codOrcamento).trim() === orcKey && a.lbServ);
              if (agComLb && agComLb.lbServ) {
                const linhas = agComLb.lbServ.split("<br>").map(l => l.trim()).filter(Boolean);
                saldoServicos = linhas.map(l => {
                  const match = l.match(/(.+?)\s*-\s*(\d+)\/(\d+)/);
                  return {
                    servico: match ? match[1].trim() : l,
                    gasto: match ? Number(match[2]) : 0,
                    quantidade: match ? Number(match[3]) : 10
                  };
                });
              }
            }

            planosDoCliente.push({
              codOrcamento: dadosOrc.codOrcamento,
              nomePlano: dadosOrc.nomePlano,
              servicos: saldoServicos || []
            });
          }

          cliente.planos = planosDoCliente;
        } catch (errCli) {
          console.warn(`[GerenciaView] Erro ao consolidar cliente #${cliente.codCliente}:`, errCli);
        }
      }));
    }

    cacheClientesDoDia = listaClientes;
    if (subtituloDiaGerencia) {
      subtituloDiaGerencia.textContent = `📅 ${listaClientes.length} cliente(s) agendado(s) em ${dataAgenda}`;
    }

    renderizarListaClientes();
  } catch (err) {
    console.error("[GerenciaView] Erro geral ao carregar auditoria do dia:", err);
    if (emptyStateGerencia) {
      emptyStateGerencia.style.display = "block";
      if (emptyStateText) emptyStateText.textContent = "Erro ao carregar dados da agenda. Tente atualizar novamente.";
    }
  } finally {
    carregandoGerencia = false;
    if (loadingGerencia) loadingGerencia.style.display = "none";
  }
}

/**
 * Inicializa a view da tela de Gestão (ligações de eventos e DOM)
 */
export function inicializarGerenciaView() {
  containerGerencia = document.getElementById("tab-gerencia");
  listaGerenciaCards = document.getElementById("gerencia-cards-container");
  emptyStateGerencia = document.getElementById("gerencia-empty-state");
  emptyStateText = document.getElementById("gerencia-empty-text");
  loadingGerencia = document.getElementById("loading-gerencia");
  subtituloDiaGerencia = document.getElementById("gerencia-subtitulo-dia");
  inputBuscaGerencia = document.getElementById("gerencia-busca-input");
  btnRecarregarGerencia = document.getElementById("btn-gerencia-recarregar");

  btnFiltroTodos = document.getElementById("btn-filtro-todos");
  btnFiltroDiscrepancia = document.getElementById("btn-filtro-discrepancia");
  btnFiltroRetaFinal = document.getElementById("btn-filtro-retafinal");

  countBadgeTodos = document.getElementById("count-badge-todos");
  countBadgeDiscrepancia = document.getElementById("count-badge-discrepancia");
  countBadgeRetaFinal = document.getElementById("count-badge-retafinal");

  // Botões de filtro rápido
  function setFiltro(novoFiltro, btnAtivo) {
    filtroAtivoGerencia = novoFiltro;
    [btnFiltroTodos, btnFiltroDiscrepancia, btnFiltroRetaFinal].forEach(b => b?.classList.remove("active"));
    btnAtivo?.classList.add("active");
    renderizarListaClientes();
  }

  if (btnFiltroTodos) {
    btnFiltroTodos.addEventListener("click", () => setFiltro("todos", btnFiltroTodos));
  }
  if (btnFiltroDiscrepancia) {
    btnFiltroDiscrepancia.addEventListener("click", () => setFiltro("discrepancia", btnFiltroDiscrepancia));
  }
  if (btnFiltroRetaFinal) {
    btnFiltroRetaFinal.addEventListener("click", () => setFiltro("reta_final", btnFiltroRetaFinal));
  }

  // Busca rápida em tempo real
  if (inputBuscaGerencia) {
    inputBuscaGerencia.addEventListener("input", (e) => {
      termoBuscaGerencia = e.target.value;
      renderizarListaClientes();
    });
  }

  // Botão de atualizar
  if (btnRecarregarGerencia) {
    btnRecarregarGerencia.addEventListener("click", () => {
      cacheSaldosOrcamentos.clear();
      carregarGestaoClientesDia();
    });
  }
}
