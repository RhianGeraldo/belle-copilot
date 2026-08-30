/**
 * BELLE COPILOT - CORE STATE & CACHE STORE
 * Gerencia o estado reativo global e os caches temporários da extensão.
 */

export const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos de cache

export const state = {
  // Sessão e Identificação
  currentToken: "",
  currentCodEstab: "1",
  currentCodUsuario: "master-admin",
  currentUserName: "Master - Patrícia Karla",
  currentClinicaNome: "ESTETICA E LASER",
  currentEstabelecimentos: [],
  currentSalas: [],
  currentDataAgenda: new Date().toISOString().split("T")[0],

  // Perfis e Permissões (RBAC)
  currentUserRole: "gerente", // "aplicadora" | "consultora" | "gerente"
  currentUserOriginalRole: "gerente",
  currentUserData: null,

  // Dados da Agenda & Atendimento
  appointmentsData: [],
  selectedAppointment: null,
  currentListaServicosRegistro: [],
  ultimosRegistrosLaserCliente: [],
  lastSaldoServicosCache: [],
  lastInterceptedArrGrid: null,
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

export function limparCachesAtendimento() {
  saldoPlanosCache.clear();
  laserParamsCache.clear();
  getServicosCache.clear();
  servicosCatalogoCache.clear();
  turnosValidosCache.clear();
  arvoreSalasCache.clear();
}
