/**
 * BELLE COPILOT - CORE STATE & CACHE STORE
 * Gerencia o estado reativo global e os caches temporários da extensão.
 */

export const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos de cache

export const state = {
  // Sessão e Identificação
  currentToken: "",
  // Sem unidade padrão: ela é sempre resolvida da aba do Belle (core/session.js).
  // O valor fixo "1" fazia o painel consultar a unidade #1 antes de descobrir a real.
  currentCodEstab: "",
  // Unidade da ABA do Belle cujo stream ao vivo o painel aceita (só quando ela confere
  // com a unidade que autenticou; do contrário fica nula e o stream é ignorado).
  unidadeAbaBelle: null,
  // Unidade da URL da aba usada na última resolução de sessão — serve para detectar que a
  // operadora trocou de filial sem re-sincronizar em laço quando URL e token divergem.
  unidadeAbaResolvida: null,
  currentCodUsuario: "master-admin",
  currentUserName: "Master - Patrícia Karla",
  currentClinicaNome: "ESTETICA E LASER",
  // Cadastro completo da unidade ativa (estabelecimentos_do_usuario): nome, CNPJ, UF,
  // cor_hexa, hrI/hrF e id_geinfo.
  currentUnidadeDados: null,
  // id_geinfo da unidade, exigido pelo saldovendaplano. Resolvido da API, não fixo.
  currentIdGeinfo: "",
  currentEstabelecimentos: [],
  currentSalas: [],
  currentDataAgenda: new Date().toISOString().split("T")[0],

  // Perfis e Permissões (RBAC) - Padrão seguro restritivo até a sessão confirmar o perfil
  currentUserRole: "consultora", // "aplicadora" | "consultora" | "gerente" | "crc"
  currentUserOriginalRole: "consultora",
  currentUserData: null,

  // Dados da Agenda & Atendimento
  appointmentsData: [],
  selectedAppointment: null,
  currentServicosAgendadosHoje: [],
  currentListaServicosRegistro: [],
  ultimosRegistrosLaserCliente: [],
  lastSaldoServicosCache: [],
  lastInterceptedArrGrid: null,
  // Unidade sob a qual o arrGrid acima foi obtido. O grid NÃO carrega essa informação:
  // `cod_clinica` responde "1" em todas as filiais, então a unidade é registrada aqui.
  arrGridUnidade: null,
  lastInterceptedAgendaPayload: null,
  servicosCatalogo: [],

  // Filtros Ativos
  filtroSalaAtivo: "todos",
  filtroStatusAtivo: "todos",
  termoBuscaAtivo: ""
};

// Caches com TTL
export const saldoPlanosCache = new Map();
export const laserParamsCache = new Map();
export const getServicosCache = new Map();
export const servicosCatalogoCache = new Map();
export const turnosValidosCache = new Map();
export const arvoreSalasCache = new Map();

export function getFromCache(map, key) {
  if (!map || !key || !map.has(key)) return null;
  const item = map.get(key);
  if (Date.now() - item.ts > CACHE_TTL_MS) {
    map.delete(key);
    return null;
  }
  return item.data;
}

export function setInCache(map, key, data) {
  if (!map || !key || !data) return;
  map.set(key, { data: data, ts: Date.now() });
}

/**
 * Define o grid de salas junto da unidade a que ele pertence.
 * Sem esse par, um grid de outra filial passa despercebido e a agenda vem trocada.
 */
export function definirArrGrid(arrGrid, unidade) {
  state.lastInterceptedArrGrid = (Array.isArray(arrGrid) && arrGrid.length > 0) ? arrGrid : null;
  state.arrGridUnidade = state.lastInterceptedArrGrid ? String(unidade || "") : null;
}

/** O grid em memória é utilizável apenas se foi obtido na unidade informada. */
export function arrGridDaUnidade(unidade) {
  if (!Array.isArray(state.lastInterceptedArrGrid) || state.lastInterceptedArrGrid.length === 0) return null;
  if (String(state.arrGridUnidade || "") !== String(unidade || "")) return null;
  return state.lastInterceptedArrGrid;
}

export function limparCachesAtendimento() {
  saldoPlanosCache.clear();
  laserParamsCache.clear();
  getServicosCache.clear();
  servicosCatalogoCache.clear();
  turnosValidosCache.clear();
  arvoreSalasCache.clear();
}
