/**
 * BELLE COPILOT - HTTP API CLIENT
 * Cliente HTTP autônomo e de alta performance com cache para os endpoints do Belle Software.
 */

import { state, getFromCache, setInCache, saldoPlanosCache, laserParamsCache, getServicosCache, servicosCatalogoCache, turnosValidosCache, arvoreSalasCache } from './state.js';

export function montarArrGridDeGridSala(gridSalas, codEstab = "1") {
  if (!Array.isArray(gridSalas) || gridSalas.length === 0) return [];
  return gridSalas.map((g, idx) => ({
    id_geinfo: g.id_geinfo || 103868,
    codigo: g.codigo || (922280 + idx),
    login: g.login || state.currentCodUsuario || "master-admin",
    cod_tipo: g.cod_tipo || 2,
    cod_sala: Number(g.cod_sala || g.id || 0),
    todos: "1",
    id: Number(g.cod_sala || g.id || 0),
    cod_clinica: String(g.cod_clinica || codEstab || "1"),
    nom_clinica: g.nom_clinica || state.currentClinicaNome || "",
    nome: g.nome || g.title || "",
    tempo: String(g.tempo || "5"),
    limite: g.limite || 1,
    foto: g.foto || "",
    title: g.title || g.nome || "",
    businessHours: g.businessHours || [
      { daysOfWeek: [1], startTime: "07:50", endTime: "12:00" },
      { daysOfWeek: [1], startTime: "12:00", endTime: "20:10" },
      { daysOfWeek: [2], startTime: "07:50", endTime: "12:00" },
      { daysOfWeek: [2], startTime: "12:00", endTime: "20:10" },
      { daysOfWeek: [3], startTime: "07:50", endTime: "12:00" },
      { daysOfWeek: [3], startTime: "12:00", endTime: "20:10" },
      { daysOfWeek: [4], startTime: "07:50", endTime: "12:00" },
      { daysOfWeek: [4], startTime: "12:00", endTime: "20:10" },
      { daysOfWeek: [5], startTime: "07:50", endTime: "12:00" },
      { daysOfWeek: [5], startTime: "12:00", endTime: "20:10" },
      { daysOfWeek: [6], startTime: "07:50", endTime: "17:00" }
    ]
  }));
}

export async function buscarDadosUsuarioApi(token, codUsuario = "master-admin") {
  try {
    const url = `https://app.bellesoftware.com.br/api/release/controller/Login/v1.0/${encodeURIComponent(codUsuario)}/recuperar_dados?estabGeral=`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "authorization": token,
        "accept": "application/json, text/plain, */*"
      }
    });

    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("Erro ao buscar dados do usuário:", err);
  }
  return null;
}

export async function buscarEstabelecimentosApi(token, codEstabAtivo = "1") {
  try {
    const url = `https://app.bellesoftware.com.br/api/release/controller/Usuario/v1.0/estabelecimentos_do_usuario?estabGeral=`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "authorization": token,
        "accept": "application/json, text/plain, */*"
      }
    });

    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn("Erro ao buscar estabelecimentos:", err);
  }
  return null;
}

export async function buscarArvoreSalasApi(token, codEstab = "1") {
  const authTok = token || state.currentToken || "";
  if (!authTok) return [];

  const cacheKey = `arvore_${codEstab}`;
  const cached = getFromCache(arvoreSalasCache, cacheKey);
  if (cached) return cached;

  try {
    const url = `https://app.bellesoftware.com.br/api/release/controller/Agenda/v1.0/arvoresala?estabGeral=1`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "authorization": authTok,
        "etb": String(codEstab || "1"),
        "restringe": "0",
        "accept": "application/json, text/plain, */*"
      }
    });
    if (res.ok) {
      const data = await res.json();
      const list = data?.rs || (Array.isArray(data) ? data : []);
      if (list.length > 0) {
        setInCache(arvoreSalasCache, cacheKey, list);
        return list;
      }
    }
  } catch (e) {
    console.warn("Erro ao buscar árvore de salas:", e);
  }
  return [];
}

export async function buscarGridSalaApi(token, codEstab = "1") {
  const authTok = token || state.currentToken || "";
  if (!authTok) return [];

  try {
    const url = `https://app.bellesoftware.com.br/api/release/controller/Agenda/v1.0/gridsala?etb=1&restringe=0&estabGeral=1`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "authorization": authTok,
        "accept": "application/json, text/plain, */*"
      }
    });
    if (res.ok) {
      const gridData = await res.json();
      if (Array.isArray(gridData) && gridData.length > 0) {
        return gridData;
      }
    }
  } catch (e) {
    console.warn("Erro ao buscar grid de salas:", e);
  }
  return [];
}

export async function buscarTurnosValidosApi(token, codSala, dataIsoStr, codEstab = "1") {
  const authTok = token || state.currentToken || "";
  if (!authTok || !codSala) return [];

  let dataUtc = `${dataIsoStr || new Date().toISOString().split("T")[0]}T03:00:00.000Z`;
  const cacheKey = `turno_${codSala}_${dataIsoStr}`;
  const cached = getFromCache(turnosValidosCache, cacheKey);
  if (cached) return cached;

  try {
    const url = `https://app.bellesoftware.com.br/api/release/controller/Buscas/v1.0/turnos_validos?cod=${codSala}&tpAgd=s&dtAgenda=${encodeURIComponent(dataUtc)}&estabGeral=1`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "authorization": authTok,
        "accept": "application/json, text/plain, */*"
      }
    });
    if (res.ok) {
      const turnos = await res.json();
      if (Array.isArray(turnos) && turnos.length > 0) {
        setInCache(turnosValidosCache, cacheKey, turnos);
        return turnos;
      }
    }
  } catch (e) {
    console.warn(`Erro ao buscar turnos válidos da sala #${codSala}:`, e);
  }
  return [];
}

export async function buscarServicosCatalogoApi(token, codEstab = "1") {
  const authTok = token || state.currentToken || "";
  if (!authTok) return [];

  const cacheKey = `servicos_catalogo_${codEstab}`;
  const cached = getFromCache(servicosCatalogoCache, cacheKey);
  if (cached) return cached;

  try {
    const url = `https://app.bellesoftware.com.br/api/release/controller/Servico/v1.0/servico?filtro=&tipo=&categoria=&ativo=0&tipoFrq=511&paginar=1&primeiro=0&ordenacao=1&limit=250&estabGeral=1`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "authorization": authTok,
        "accept": "application/json, text/plain, */*"
      }
    });
    if (res.ok) {
      const data = await res.json();
      const lista = data?.registros || (Array.isArray(data) ? data : []);
      if (Array.isArray(lista) && lista.length > 0) {
        state.servicosCatalogo = lista;
        setInCache(servicosCatalogoCache, cacheKey, lista);
        return lista;
      }
    }
  } catch (e) {
    console.warn("Erro ao buscar catálogo de serviços:", e);
  }
  return [];
}

export async function buscarAgendaApi(token, dataAgenda, arrGrid, codEstab = "1") {
  const authTok = token || state.currentToken || "";
  if (!authTok) return [];

  const dataFormatada = dataAgenda || state.currentDataAgenda || new Date().toISOString().split("T")[0];
  const gridArray = (Array.isArray(arrGrid) && arrGrid.length > 0) 
    ? arrGrid 
    : (state.lastInterceptedArrGrid || montarArrGridDeGridSala(state.currentSalas, codEstab));

  const payload = {
    tp: "0",
    canc: false,
    finan: false,
    codCli: "",
    finaliz: false,
    corInad: "#e19999",
    arrGrid: gridArray,
    semFinan: false,
    tpAgenda: "sala",
    dtAgenda: `${dataFormatada}, 00:00:00`,
    corAgenda: "ct",
    semFinaliz: false,
    destacarInad: "1",
    destacarPendCont: 1,
    corPendContrato: "#6b86dd",
    corAgendSemQuest: "#e1d783",
    destacarNaoPreencQuest: 1,
    verTodas: 1,
    exibir_pc_agenda: "1",
    destacarNomeInad: "1",
    teleatendimento: 0,
    etb: String(codEstab || state.currentCodEstab || "1")
  };

  try {
    const url = `https://app.bellesoftware.com.br/api/release/controller/Agenda/v1.0/agendaapi?data=${dataFormatada}&estabGeral=1`;
    console.log(`[AgendaAPI] 📤 Disparando consulta autônoma da agenda: ${dataFormatada}`);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "authorization": authTok,
        "content-type": "text/plain",
        "accept": "application/json, text/plain, */*"
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        console.log(`[AgendaAPI] 📥 Recebidos ${data.length} agendamentos da API!`);
        return data;
      }
    }
  } catch (err) {
    console.warn("Erro ao buscar agendaapi:", err);
  }
  return [];
}

export async function buscarDetalhesAgendaApi(token, codConsulta, codEstab = "1") {
  if (!codConsulta) return null;
  const authTok = token || state.currentToken || "";
  if (!authTok) return null;

  try {
    const url = `https://app.bellesoftware.com.br/api/release/controller/Agenda/v1.0/agenda/${codConsulta}?estabGeral=1`;
    const res = await fetch(url, {
      headers: {
        "authorization": authTok,
        "accept": "application/json, text/plain, */*"
      }
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn(`Erro ao consultar detalhes da consulta #${codConsulta}:`, e);
  }
  return null;
}

export async function buscarGetServicosApi(token, codConsulta, codEstab = "1") {
  if (!codConsulta) return null;
  const cacheKey = String(codConsulta);
  const cached = getFromCache(getServicosCache, cacheKey);
  if (cached) return cached;

  const authTok = token || state.currentToken || "";
  if (!authTok) return null;

  try {
    const res = await fetch(`https://app.bellesoftware.com.br/api/release/controller/PainelAtend/v1.0/get_servicos/${codConsulta}?estabGeral=1`, {
      headers: {
        "authorization": authTok,
        "accept": "application/json, text/plain, */*"
      }
    });
    if (res.ok) {
      const data = await res.json();
      setInCache(getServicosCache, cacheKey, data);
      return data;
    }
  } catch (e) {
    console.warn(`Erro no get_servicos #${codConsulta}:`, e);
  }
  return null;
}

export async function buscarParametrosLaserApi(token, codCliente, codEstab = "1") {
  if (!codCliente) return [];
  const cacheKey = String(codCliente);
  const cached = getFromCache(laserParamsCache, cacheKey);
  if (cached) return cached;

  const authTok = token || state.currentToken || "";
  if (!authTok) return [];

  try {
    const url = `https://app.bellesoftware.com.br/api/release/controller/PainelAtend/v1.0/parametro_laser?dataIni=2021-01-01T03:00:00.000Z&dataFim=2030-12-31T03:00:00.000Z&area=&desconsiderar=true&limit=50&offset=0&descData=1&sortField=data_hora&sortOrder=-1&cliente=${codCliente}&estabGeral=1`;
    const res = await fetch(url, {
      headers: {
        "authorization": authTok,
        "accept": "application/json, text/plain, */*"
      }
    });
    if (res.ok) {
      const data = await res.json();
      let registros = [];
      if (Array.isArray(data)) {
        registros = data;
      } else if (data && Array.isArray(data.registros)) {
        registros = data.registros;
      }
      setInCache(laserParamsCache, cacheKey, registros);
      return registros;
    }
  } catch (e) {
    console.warn(`Erro ao buscar histórico do laser do cliente #${codCliente}:`, e);
  }
  return [];
}

export async function buscarVendasPlanosClienteApi(token, codCliente, codEstab = "1") {
  const authTok = token || state.currentToken || "";
  if (!authTok || !codCliente) return [];

  try {
    const url = `https://app.bellesoftware.com.br/api/release/controller/Plano/v1.0/vendasplanos?codCliente=${codCliente}&estabGeral=1&limit=50`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "authorization": authTok,
        "accept": "application/json, text/plain, */*"
      }
    });
    if (res.ok) {
      const data = await res.json();
      const lista = data?.registros || (Array.isArray(data) ? data : []);
      if (Array.isArray(lista)) return lista;
    }
  } catch (e) {
    console.warn(`Erro ao consultar vendasplanos do cliente #${codCliente}:`, e);
  }
  return [];
}

export async function buscarSaldoVendaPlanoApi(token, codOrc, codPlano, idGeinfo, codEstab = "1") {
  const authTok = token || state.currentToken || "";
  if (!authTok) {
    console.warn("[Saldo API] ⚠️ Token de autenticação não encontrado para saldovendaplano.");
    return null;
  }

  const finalCodOrc = String(codOrc || state.selectedAppointment?.codOrcamento || "").trim();
  const finalCodPlano = String(codPlano || state.selectedAppointment?.codPlano || "").trim();
  const finalIdGeinfo = String(idGeinfo || state.selectedAppointment?.idGeinfo || state.currentSalas?.[0]?.id_geinfo || "114411").trim();

  if (!finalCodOrc) {
    console.log("[Saldo API] ℹ️ Consulta sem orçamento de plano vinculado (cod_plano_paciente).");
    return null;
  }

  const cacheKey = `${finalCodOrc}_${finalCodPlano}`;
  const cached = getFromCache(saldoPlanosCache, cacheKey);
  if (cached) return cached;

  try {
    const url = `https://app.bellesoftware.com.br/api/release/controller/Plano/v1.0/saldovendaplano?idGeinfo=${finalIdGeinfo}&estabGeral=1`;
    console.log(`[Saldo API] 🔍 Consultando saldovendaplano: codorc=${finalCodOrc}, codplano=${finalCodPlano}, idGeinfo=${finalIdGeinfo}`);
    
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "authorization": authTok,
        "codorc": finalCodOrc,
        "codplano": finalCodPlano,
        "total": "1",
        "tpplano": "3",
        "accept": "application/json, text/plain, */*"
      }
    });

    if (res.ok) {
      const data = await res.json();
      const lista = Array.isArray(data) ? data : (data.registros || data.servicos || []);
      if (Array.isArray(lista) && lista.length > 0) {
        console.log(`[Saldo API] ✅ Saldo retornado com sucesso: ${lista.length} serviços/sessões.`);
        setInCache(saldoPlanosCache, cacheKey, lista);
        return lista;
      }
    } else {
      console.warn(`[Saldo API] ⚠️ Resposta HTTP ${res.status}:`, await res.text().catch(() => ''));
    }
  } catch (e) {
    console.warn(`[Saldo API] ❌ Erro ao consultar saldovendaplano:`, e);
  }
  return null;
}

export async function salvarParametrosLaserEmLoteApi(payloadArray) {
  if (!Array.isArray(payloadArray) || payloadArray.length === 0) return { success: false, error: "Nenhum parâmetro informado" };
  const authTok = state.currentToken || "";
  const codConsulta = state.selectedAppointment?.codConsulta || state.selectedAppointment?.id || "";

  let salvosComSucesso = 0;
  for (const item of payloadArray) {
    try {
      const payloadFormatado = {
        id: null,
        codAgendamento: String(item.codAgendamento || codConsulta || ""),
        area: item.area || item.nomeArea || "",
        fototipo: item.fototipo || "IV",
        densidade: 0,
        cor: 0,
        espessura: 0,
        energia: String(item.energia || item.currentEnergia || "25"),
        frequencia: String(item.frequencia || "0,8"),
        larguraPulso: item.pulso || item.largura_pulso || null,
        qtdDisparos: String(item.disparos || item.qtd_disparos || "200"),
        modoAplicacao: item.modo || item.modo_aplicacao || "HR",
        observacao: item.obs || item.observacao || "",
        anexo: null
      };

      const res = await fetch(`https://app.bellesoftware.com.br/api/release/controller/PainelAtend/v1.0/parametro_laser?estabGeral=1`, {
        method: "POST",
        headers: {
          "authorization": authTok,
          "content-type": "text/plain",
          "accept": "application/json, text/plain, */*"
        },
        body: JSON.stringify(payloadFormatado)
      });
      if (res.ok) salvosComSucesso++;
    } catch (err) {
      console.warn("Erro ao salvar parâmetro individual:", err);
    }
  }

  // Invalida cache de parâmetros deste cliente para forçar atualização fresca
  if (payloadArray[0]?.cod_paciente || state.selectedAppointment?.codCliente) {
    const codCli = payloadArray[0]?.cod_paciente || state.selectedAppointment?.codCliente;
    laserParamsCache.delete(String(codCli));
  }

  return {
    success: salvosComSucesso > 0,
    total: payloadArray.length,
    salvos: salvosComSucesso
  };
}

export async function validarAgendamentoApi(token, payloadValidacao, codEstab = "1") {
  const authTok = token || state.currentToken || "";
  if (!authTok) return { planVld: true, servVld: true, stsVld: true };

  try {
    const url = `https://app.bellesoftware.com.br/api/release/controller/Agenda/v1.0/validacao?estabGeral=1`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "authorization": authTok,
        "content-type": "text/plain",
        "accept": "application/json, text/plain, */*"
      },
      body: JSON.stringify(payloadValidacao)
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn("Erro ao validar agendamento:", e);
  }
  return { planVld: true, servVld: true, stsVld: true };
}

export async function salvarEdicaoAgendaApi(token, payloadEdicao, codEstab = "1") {
  const authTok = token || state.currentToken || "";
  if (!authTok) return { success: false, error: "Sem token de autorização" };

  try {
    const url = `https://app.bellesoftware.com.br/api/release/controller/Agenda/v1.0/edicaoagenda?estabGeral=1`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "authorization": authTok,
        "content-type": "text/plain",
        "accept": "application/json, text/plain, */*"
      },
      body: JSON.stringify(payloadEdicao)
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.vld || data?.rs) {
        return { success: true, codConsulta: data.rs, data: data };
      }
      return { success: true, codConsulta: data?.rs, data };
    } else {
      const errTxt = await res.text().catch(() => "");
      return { success: false, error: errTxt || `HTTP ${res.status}` };
    }
  } catch (e) {
    console.warn("Erro ao salvar agendamento no Belle:", e);
    return { success: false, error: e.message };
  }
}

export async function finalizarAtendimentoApi(token, codConsulta, codEstab = "1") {
  if (!codConsulta) return false;
  const authTok = token || state.currentToken || "";

  try {
    const res = await fetch(`https://app.bellesoftware.com.br/api/release/controller/Agenda/v1.0/agenda/${codConsulta}?estabGeral=1`, {
      method: "PUT",
      headers: {
        "authorization": authTok,
        "content-type": "application/json;charset=UTF-8",
        "accept": "application/json, text/plain, */*"
      },
      body: JSON.stringify({
        status: "finalizado"
      })
    });
    return res.ok;
  } catch (e) {
    console.warn(`Erro ao finalizar consulta #${codConsulta}:`, e);
    return false;
  }
}
