/**
 * BELLE COPILOT - CACHE PERSISTENTE (chrome.storage.local)
 *
 * O painel lateral é montado do zero toda vez que é aberto. Sem cache, cada abertura
 * refazia o "login" inteiro (recuperar_dados + estabelecimentos_do_usuario + gridsala)
 * antes de pintar qualquer coisa na tela.
 *
 * O QUE ENTRA AQUI (dado estável, de cadastro):
 *   - perfil do usuário logado (`recuperar_dados`)
 *   - dados da unidade (`estabelecimentos_do_usuario`: nome, CNPJ, UF, id_geinfo, cor)
 *   - grid de salas da unidade (`gridsala`)
 *   - catálogo de serviços
 *
 * O QUE NUNCA ENTRA (dado vivo ou clínico, que precisa ser sempre fresco):
 *   - agenda do dia, saldo de planos/sessões, parâmetros do laser, turnos válidos.
 *     Esses seguem no cache em memória de curta duração (core/state.js).
 *
 * O TOKEN TAMBÉM NÃO ENTRA: credencial não é gravada em disco. As entradas são
 * segmentadas por unidade, e o token continua vindo do cookie a cada sessão.
 */

const PREFIXO = "bc";

export const TTL_CACHE = {
  usuario:  12 * 60 * 60 * 1000, // 12h — perfil e grupos mudam raramente
  unidade:  24 * 60 * 60 * 1000, // 24h — cadastro da clínica é praticamente estático
  salas:     6 * 60 * 60 * 1000, // 6h  — estrutura física da unidade
  servicos:  6 * 60 * 60 * 1000  // 6h  — catálogo de procedimentos
};

export const ROTULOS_CACHE = {
  usuario: "👤 Usuário logado (recuperar_dados)",
  unidade: "🏢 Unidade ativa (estabelecimentos_do_usuario)",
  salas: "🚪 Salas da unidade (gridsala)",
  servicos: "💉 Catálogo de serviços"
};

function chaveCompleta(tipo, unidade) {
  return `${PREFIXO}:${unidade || "0"}:${tipo}`;
}

function temStorage() {
  return typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
}

function storageGet(chaves) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(chaves, (res) => resolve(res || {}));
    } catch (e) {
      resolve({});
    }
  });
}

function storageSet(objeto) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set(objeto, () => resolve(true));
    } catch (e) {
      resolve(false);
    }
  });
}

/**
 * Lê uma entrada. Devolve sempre os dados, mesmo vencidos, marcando `expirado`:
 * dado velho serve para pintar a tela na hora enquanto a rede revalida por trás.
 */
export async function lerCache(tipo, unidade) {
  if (!temStorage()) return null;

  const chave = chaveCompleta(tipo, unidade);
  const res = await storageGet([chave]);
  const item = res[chave];
  if (!item || typeof item !== "object" || !("dados" in item)) return null;

  const idadeMs = Date.now() - (item.ts || 0);
  const ttl = TTL_CACHE[tipo] || 0;

  return {
    tipo,
    dados: item.dados,
    ts: item.ts || 0,
    idadeMs,
    expirado: ttl > 0 && idadeMs > ttl
  };
}

export async function gravarCache(tipo, unidade, dados) {
  if (!temStorage() || dados === undefined || dados === null) return false;
  return storageSet({ [chaveCompleta(tipo, unidade)]: { dados, ts: Date.now() } });
}

/** Inventário do cache para a aba de Configurações. */
export async function listarCache(unidade) {
  if (!temStorage()) return [];

  const tipos = Object.keys(TTL_CACHE);
  const chaves = tipos.map(t => chaveCompleta(t, unidade));
  const res = await storageGet(chaves);

  return tipos.map((tipo, i) => {
    const item = res[chaves[i]];
    if (!item || typeof item !== "object" || !("dados" in item)) {
      return { tipo, rotulo: ROTULOS_CACHE[tipo], presente: false };
    }
    const idadeMs = Date.now() - (item.ts || 0);
    const ttl = TTL_CACHE[tipo] || 0;
    let tamanho = 0;
    try { tamanho = JSON.stringify(item.dados).length; } catch (e) {}

    return {
      tipo,
      rotulo: ROTULOS_CACHE[tipo],
      presente: true,
      ts: item.ts || 0,
      idadeMs,
      expirado: ttl > 0 && idadeMs > ttl,
      validadeMs: ttl,
      tamanhoBytes: tamanho,
      itens: Array.isArray(item.dados) ? item.dados.length : null,
      resumo: resumirEntrada(tipo, item.dados)
    };
  });
}

/** Uma linha legível do conteúdo, para a operadora conferir o que está guardado. */
function resumirEntrada(tipo, dados) {
  try {
    if (tipo === "usuario") {
      const grupo = Array.isArray(dados?.grupos) && dados.grupos[0]?.nome ? dados.grupos[0].nome : "sem grupo";
      return `${dados?.nom_usuario || dados?.cod_usuario || "?"} • ${grupo}`;
    }
    if (tipo === "unidade") {
      return `${dados?.nome || "?"} • CNPJ ${dados?.cnpj || "—"} • id_geinfo ${dados?.id_geinfo ?? "—"}`;
    }
    if (tipo === "salas") {
      const nomes = (dados || []).map(s => (s.nome || s.title || "").trim()).filter(Boolean);
      return nomes.slice(0, 3).join(", ") + (nomes.length > 3 ? ` +${nomes.length - 3}` : "");
    }
    if (tipo === "servicos") {
      return `${Array.isArray(dados) ? dados.length : 0} procedimento(s) no catálogo`;
    }
  } catch (e) {}
  return "";
}

export async function limparCache(unidade) {
  if (!temStorage()) return false;
  const chaves = Object.keys(TTL_CACHE).map(t => chaveCompleta(t, unidade));
  return new Promise((resolve) => {
    try {
      chrome.storage.local.remove(chaves, () => resolve(true));
    } catch (e) {
      resolve(false);
    }
  });
}

/** "há 3 min", "há 2 h", "há 1 d" */
export function formatarIdade(idadeMs) {
  if (!Number.isFinite(idadeMs) || idadeMs < 0) return "—";
  const min = Math.floor(idadeMs / 60000);
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}
