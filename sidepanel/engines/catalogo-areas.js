/**
 * BELLE COPILOT - CATÁLOGO DE SERVIÇOS, REGIÕES E ÁREAS
 *
 * Base para o cruzamento comercial: o que a cliente já trata × o que falta.
 *
 * Os nomes que chegam do Belle são livres e inconsistentes ("BUÇO (P) depilação a
 * laser.", "VIRILHA COMPLETA EXCETO ANAL (M)", "27- 5SS CLAREAMENTO INTERNO DE COXA"),
 * então cada área carrega sinônimos e o casamento é feito por texto normalizado.
 */

/* ---------------------------------------------------------------- SERVIÇOS */

export const SERVICOS = [
  { id: "depilacao",       nome: "Depilação a Laser",              sinonimos: ["depilacao", "depilatorio", "remocao de pelos", "laser hair"] },
  { id: "clareamento",     nome: "Clareamento",                    sinonimos: ["clareamento", "clareador", "despigmentacao", "hipercromia"] },
  { id: "rejuvenescimento",nome: "Rejuvenescimento",               sinonimos: ["rejuvenescimento", "rejuvenesc", "colageno", "firmeza"] },
  { id: "tatuagem",        nome: "Remoção de Tatuagem",            sinonimos: ["remocao de tatuagem", "tatuagem", "tattoo"] },
  { id: "micropigmentacao",nome: "Remoção de Micropigmentação",    sinonimos: ["remocao de micropigmentacao", "micropigmentacao", "microblading", "remocao de sobrancelha"] },
  { id: "blackpeel",       nome: "Black Peel",                     sinonimos: ["black peel", "blackpeel", "peeling de carbono", "carbon peel"] },
  { id: "peeling",         nome: "Peeling",                        sinonimos: ["peeling", "peel quimico", "renovacao celular"] }
];

/* ------------------------------------------------------- REGIÕES E ÁREAS */
/*
 * tags:
 *   pelos       - candidata natural a depilação
 *   hipercromia - escurece com frequência: alvo direto de clareamento
 *   facial      - elegível a rejuvenescimento / peeling
 *   oleosidade  - elegível a Black Peel
 */

export const REGIOES = [
  { id: "face", nome: "Face", areas: [
    { id: "testa",          nome: "Testa",            tags: ["pelos", "facial", "oleosidade"] },
    { id: "glabela",        nome: "Glabela",          tags: ["pelos", "facial"], sinonimos: ["entre as sobrancelhas", "entrecenho"] },
    { id: "nariz",          nome: "Nariz",            tags: ["pelos", "facial", "oleosidade"] },
    { id: "laterais-face",  nome: "Laterais da Face", tags: ["pelos", "facial"], sinonimos: ["lateral da face", "costeleta", "costeletas", "face lateral"] },
    { id: "buco",           nome: "Buço",             tags: ["pelos", "facial"], sinonimos: ["buco", "labio superior"], equivalentes: ["bigode"] },
    { id: "mento",          nome: "Mento",            tags: ["pelos", "facial"], sinonimos: ["queixo"] },
    { id: "maxilar",        nome: "Maxilar",          tags: ["pelos", "facial"], sinonimos: ["mandibula", "linha da mandibula"] },
    { id: "bigode",         nome: "Bigode",           tags: ["pelos", "facial"], equivalentes: ["buco"] },
    { id: "cavanhaque",     nome: "Cavanhaque",       tags: ["pelos", "facial"] },
    { id: "orelhas",        nome: "Orelhas",          tags: ["pelos"], sinonimos: ["orelha", "pavilhao auricular"] }
  ]},
  { id: "pescoco", nome: "Pescoço", areas: [
    { id: "pescoco",        nome: "Pescoço",          tags: ["pelos", "facial"], sinonimos: ["colo", "papada"] },
    { id: "nuca",           nome: "Nuca",             tags: ["pelos"] }
  ]},
  { id: "barba", nome: "Barba", areas: [
    { id: "barba",          nome: "Barba",            tags: ["pelos", "facial"], sinonimos: ["barba completa"] },
    // `suprime`: o nome "FAIXA DE BARBA" contém "barba", mas quem faz só a faixa NÃO
    // faz a barba completa — e a barba inteira segue sendo uma oferta válida para ela.
    { id: "faixa-barba",    nome: "Faixa de Barba",   tags: ["pelos", "facial"], sinonimos: ["faixa da barba", "contorno de barba", "desenho de barba"], suprime: ["barba"] }
  ]},
  { id: "torax", nome: "Tórax", areas: [
    { id: "axilas",         nome: "Axilas",           tags: ["pelos", "hipercromia"], sinonimos: ["axila", "sovaco"] },
    { id: "seios",          nome: "Seios",            tags: ["pelos"], sinonimos: ["mamas", "peito feminino"] },
    { id: "areolas",        nome: "Aréolas",          tags: ["pelos", "hipercromia"], sinonimos: ["areola", "auréola", "aureolas"] },
    { id: "torax",          nome: "Tórax",            tags: ["pelos", "oleosidade"], sinonimos: ["peitoral", "peito"] }
  ]},
  { id: "abdomen", nome: "Abdômen", areas: [
    { id: "abdomen",        nome: "Abdômen",          tags: ["pelos"] },
    { id: "barriga",        nome: "Barriga",          tags: ["pelos"] },
    { id: "linha-alba",     nome: "Linha Alba",       tags: ["pelos"], sinonimos: ["linha alba", "faixa abdominal", "meio da barriga"] }
  ]},
  { id: "bracos", nome: "Braços", areas: [
    { id: "bracos",         nome: "Braços",           tags: ["pelos"], sinonimos: ["braco", "bracos completos"] },
    { id: "antebracos",     nome: "Antebraços",       tags: ["pelos"], sinonimos: ["antebraco", "meio braco"] },
    { id: "maos-dedos",     nome: "Mãos e Dedos",     tags: ["pelos", "facial"], sinonimos: ["maos", "dedos", "maos e dedos"] }
  ]},
  { id: "costas", nome: "Costas", areas: [
    { id: "ombros",         nome: "Ombros",           tags: ["pelos"], sinonimos: ["ombro"] },
    { id: "costas",         nome: "Costas",           tags: ["pelos", "oleosidade"], sinonimos: ["dorso", "costas completas"] },
    { id: "lombar",         nome: "Lombar",           tags: ["pelos"], sinonimos: ["lombo", "baixo das costas"] }
  ]},
  { id: "intimo", nome: "Íntimo", areas: [
    { id: "virilha",        nome: "Virilha",          tags: ["pelos", "hipercromia"], sinonimos: ["virilha completa", "virilha simples", "biquini", "cavado"] },
    { id: "virilha-interna",nome: "Virilha Interna",  tags: ["pelos", "hipercromia"], sinonimos: ["virilha interna", "interno de virilha", "labios", "grandes labios"] },
    { id: "base-penis",     nome: "Base do Pênis",    tags: ["pelos"], sinonimos: ["base do penis", "penis", "genital masculino"] }
  ]},
  { id: "gluteos", nome: "Glúteos", areas: [
    { id: "gluteos",        nome: "Glúteos",          tags: ["pelos"], sinonimos: ["gluteo", "bumbum", "nadegas"] },
    { id: "interglúteo",    nome: "Interglúteo",      tags: ["pelos", "hipercromia"], sinonimos: ["intergluteo", "entre gluteos", "sulco intergluteo"] },
    { id: "anus",           nome: "Ânus",             tags: ["pelos", "hipercromia"], sinonimos: ["anus", "anal", "perianal", "peri anal"] }
  ]},
  { id: "pernas", nome: "Pernas", areas: [
    { id: "coxa-anterior",  nome: "Anterior de Coxa", tags: ["pelos"], sinonimos: ["anterior de coxa", "frente da coxa"] },
    { id: "coxa-posterior", nome: "Posterior de Coxa",tags: ["pelos"], sinonimos: ["posterior de coxa", "atras da coxa"] },
    { id: "coxa-interior",  nome: "Interior de Coxa", tags: ["pelos", "hipercromia"], sinonimos: ["interior de coxa", "interno de coxa", "parte interna da coxa"] },
    { id: "coxa-laterais",  nome: "Laterais de Coxa", tags: ["pelos"], sinonimos: ["laterais de coxa", "lateral da coxa", "culote"] },
    { id: "joelhos",        nome: "Joelhos",          tags: ["pelos", "hipercromia"], sinonimos: ["joelho"] },
    { id: "meia-perna",     nome: "Meia Perna",       tags: ["pelos"], sinonimos: ["meia perna", "canela", "panturrilha"] },
    { id: "pes",            nome: "Pés",              tags: ["pelos"], sinonimos: ["pe", "pes", "pes e dedos", "dorso do pe"] }
  ]}
];

/** Índice plano: areaId -> { ...area, regiaoId, regiaoNome } */
export const AREAS_POR_ID = (() => {
  const mapa = new Map();
  REGIOES.forEach(r => r.areas.forEach(a => {
    mapa.set(a.id, { ...a, regiaoId: r.id, regiaoNome: r.nome, tags: a.tags || [], sinonimos: a.sinonimos || [], equivalentes: a.equivalentes || [], suprime: a.suprime || [] });
  }));
  return mapa;
})();

/* ------------------------------------------------- AFINIDADES ANATÔMICAS */
/*
 * Pares que a clínica vende junto porque o resultado parcial fica visível:
 * fazer a faixa de barba e deixar o mento, depilar meia perna e parar na coxa.
 * `peso` ordena a prioridade da oferta (3 = gritante, 1 = complementar).
 */

export const AFINIDADES = [
  // Barba e face masculina — inclui o caso citado: faixa de barba sem mento / sem orelhas
  { de: "faixa-barba", para: ["mento", "maxilar", "pescoco", "orelhas", "nuca"], peso: 3, motivo: "O contorno da barba fica marcado quando o mento, o maxilar e o pescoço não acompanham." },
  { de: "barba",       para: ["pescoco", "nuca", "orelhas", "maxilar"], peso: 3, motivo: "Barba tratada e pescoço/nuca sem tratar deixam a transição visível." },
  { de: "cavanhaque",  para: ["bigode", "mento", "maxilar"], peso: 2, motivo: "Cavanhaque isolado deixa o restante do contorno em desalinho." },

  // Face feminina
  { de: "buco",        para: ["mento", "maxilar", "laterais-face"], peso: 3, motivo: "Quem trata o buço quase sempre incomoda também com queixo e laterais." },
  { de: "mento",       para: ["buco", "maxilar", "pescoco"], peso: 2, motivo: "Queixo e buço formam o contorno inferior do rosto." },
  { de: "laterais-face", para: ["maxilar", "pescoco"], peso: 2, motivo: "A lateral da face desce para o maxilar e o pescoço." },
  { de: "testa",       para: ["glabela", "laterais-face"], peso: 1, motivo: "Testa e glabela fecham o terço superior." },

  // Tórax e abdômen
  { de: "torax",       para: ["abdomen", "ombros", "axilas"], peso: 2, motivo: "Tórax tratado e abdômen sem tratar cria uma linha de corte no tronco." },
  { de: "abdomen",     para: ["linha-alba", "torax", "virilha"], peso: 2, motivo: "O abdômen se conecta com a linha alba e desce para a virilha." },
  { de: "linha-alba",  para: ["abdomen", "barriga"], peso: 2, motivo: "A linha alba é uma faixa: sozinha, destaca o resto da barriga." },
  { de: "seios",       para: ["areolas", "torax"], peso: 2, motivo: "Seios e aréolas são tratados na mesma sessão." },

  // Membros superiores
  { de: "antebracos",  para: ["bracos", "maos-dedos"], peso: 3, motivo: "Antebraço liso e braço não tratado deixam a divisão à mostra." },
  { de: "bracos",      para: ["antebracos", "maos-dedos", "ombros"], peso: 2, motivo: "O braço completo só fica uniforme com antebraço e mãos." },

  // Costas
  { de: "costas",      para: ["lombar", "ombros", "nuca"], peso: 3, motivo: "Costas sem a lombar deixam a faixa de baixo evidente." },
  { de: "ombros",      para: ["costas", "torax"], peso: 2, motivo: "Ombros se ligam às costas e ao tórax." },

  // Íntimo e glúteos — a sequência de maior recorrência da clínica
  { de: "virilha",     para: ["virilha-interna", "interglúteo", "anus", "axilas"], peso: 3, motivo: "Virilha sem a parte interna e o interglúteo deixa o resultado íntimo pela metade." },
  { de: "virilha-interna", para: ["virilha", "interglúteo", "anus"], peso: 3, motivo: "É a continuação natural da mesma região." },
  { de: "interglúteo", para: ["anus", "gluteos", "virilha"], peso: 2, motivo: "Interglúteo e ânus são tratados juntos na mesma posição." },
  { de: "anus",        para: ["interglúteo", "virilha", "gluteos"], peso: 2, motivo: "Fecha a região íntima posterior." },
  { de: "gluteos",     para: ["interglúteo", "coxa-posterior", "lombar"], peso: 2, motivo: "Glúteo tratado e posterior de coxa sem tratar cria degrau." },
  { de: "axilas",      para: ["virilha", "seios", "bracos"], peso: 3, motivo: "Axilas e virilha são o combo mais vendido: quem faz uma quase sempre quer a outra." },

  // Pernas
  { de: "meia-perna",  para: ["coxa-anterior", "coxa-posterior", "joelhos", "pes"], peso: 3, motivo: "Meia perna lisa e coxa sem tratar é a divisão mais perceptível de todas." },
  { de: "coxa-anterior", para: ["coxa-posterior", "coxa-interior", "coxa-laterais", "meia-perna"], peso: 3, motivo: "A coxa só fica uniforme com as quatro faces tratadas." },
  { de: "coxa-posterior", para: ["coxa-anterior", "coxa-interior", "coxa-laterais", "gluteos"], peso: 3, motivo: "Falta a face oposta da mesma coxa." },
  { de: "coxa-interior", para: ["coxa-anterior", "coxa-posterior", "virilha"], peso: 2, motivo: "Interior de coxa faz fronteira com a virilha." },
  { de: "coxa-laterais", para: ["coxa-anterior", "coxa-posterior", "gluteos"], peso: 2, motivo: "Completa o contorno da coxa." },
  { de: "joelhos",     para: ["meia-perna", "coxa-anterior"], peso: 2, motivo: "O joelho fica no meio do caminho entre coxa e meia perna." },
  { de: "pes",         para: ["meia-perna"], peso: 1, motivo: "Fecha a perna até o pé." }
];

/* ------------------------------------------------------------ NORMALIZAÇÃO */

export function normalizarTexto(txt = "") {
  return String(txt)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Identifica o serviço pelo nome vindo do Belle. Sem match explícito, assume depilação. */
export function identificarServico(nomeServico = "") {
  const t = normalizarTexto(nomeServico);
  for (const s of SERVICOS) {
    if (s.sinonimos.some(sin => t.includes(normalizarTexto(sin)))) return s.id;
  }
  return t ? "depilacao" : null;
}

/**
 * Identifica TODAS as áreas citadas num nome de serviço.
 * Um nome só pode cobrir várias: "VIRILHA COMPLETA 10SS + PERIANAL + AXILAS + BUÇO".
 */
export function identificarAreas(nomeServico = "") {
  const t = normalizarTexto(nomeServico);
  if (!t) return [];

  const encontradas = new Set();

  AREAS_POR_ID.forEach((area, id) => {
    const termos = [area.nome, ...area.sinonimos].map(normalizarTexto).filter(Boolean);
    // Termo precisa aparecer como palavra inteira, senão "pes" casa dentro de "pescoco".
    const bateu = termos.some(termo => new RegExp(`(^|\\s)${termo}(\\s|$)`).test(t));
    if (bateu) encontradas.add(id);
  });

  // "Virilha completa" no Belle já engloba a parte interna.
  if (/virilha completa/.test(t)) encontradas.add("virilha-interna");
  // "Exceto anal" desfaz o que o nome do combo sugere.
  if (/exceto anal|sem anal|nao anal/.test(t)) encontradas.delete("anus");

  // A área mais específica vence a genérica que está contida no mesmo nome.
  [...encontradas].forEach(id => {
    (AREAS_POR_ID.get(id)?.suprime || []).forEach(generica => encontradas.delete(generica));
  });

  return [...encontradas];
}

/** Extrai áreas e serviços de uma lista de serviços contratados/agendados. */
export function mapearCobertura(listaServicos = []) {
  const areas = new Map();   // areaId -> Set de serviçoIds
  const servicos = new Set();

  (Array.isArray(listaServicos) ? listaServicos : []).forEach(item => {
    const nome = typeof item === "string"
      ? item
      : (item?.servico || item?.nome || item?.nom_servico || item?.nomePlano || "");
    if (!nome) return;

    const servicoId = identificarServico(nome);
    if (servicoId) servicos.add(servicoId);

    identificarAreas(nome).forEach(areaId => {
      if (!areas.has(areaId)) areas.set(areaId, new Set());
      if (servicoId) areas.get(areaId).add(servicoId);
    });
  });

  return { areas, servicos };
}
