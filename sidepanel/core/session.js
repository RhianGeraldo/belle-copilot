/**
 * BELLE COPILOT - SESSÃO ATIVA (USUÁRIO LOGADO + UNIDADE ATUAL)
 *
 * Fonte única de verdade sobre QUEM está logado no Belle e em QUAL unidade.
 *
 * Como o Belle funciona (docs/MAPEAMENTO_USUARIO_SESSAO.md e doc 11.4 do
 * MAPEAMENTO_AGENDA_BELLE.md):
 *   - A sessão é particionada por unidade em cookies `token_{unidade}`
 *     (ex.: `/u/3/` usa `token_3`).
 *   - `etb`, `estabGeral` e `cod_clinica` são SEMPRE "1" em qualquer filial:
 *     não servem para identificar a unidade (o gridsala da #5 responde "1").
 *   - Quem seleciona a filial no backend é o token do header `authorization`.
 *
 * Estratégia: reunir todos os tokens possíveis, VALIDAR cada um contra o próprio
 * Belle (`estabelecimentos_do_usuario`) e adotar o do usuário logado na unidade
 * aberta. A unidade nunca é chutada: ela vem da URL da aba ou do cookie do token
 * que efetivamente autenticou.
 */

import { state, limparCachesAtendimento, definirArrGrid } from './state.js';
import { buscarEstabelecimentosApi, buscarDadosUsuarioApi } from './api-client.js';

/**
 * Nome da unidade ativa a partir de `estabelecimentos_do_usuario`.
 *
 * OBSERVADO EM PRODUÇÃO: esse endpoint é relativo ao TOKEN enviado e normaliza o `cod`
 * para 1, igual a `etb` e `cod_clinica`. Com o token da unidade #3 ele responde
 * `[#1 ESTETICA E LASER LINHARES]`; com o da #0, `[#1 Estetica & Laser (Franqueadora)]`.
 * Ou seja: casar `/u/{n}` contra `cod` não funciona — quando vem uma entrada só, ela É
 * a unidade aberta, e o que identifica a filial é o NOME.
 */
export function nomeDaUnidadeAtiva(estabelecimentos, unidade) {
  if (!Array.isArray(estabelecimentos) || estabelecimentos.length === 0) return null;

  // Uma entrada = a unidade da sessão atual.
  if (estabelecimentos.length === 1) return estabelecimentos[0].nome || null;

  // Várias entradas: tenta o código e cai para a padrão.
  const porCodigo = unidade ? estabelecimentos.find(e => String(e.cod) === String(unidade)) : null;
  const padrao = estabelecimentos.find(e => e.padrao == 1);
  return (porCodigo || padrao || null)?.nome || null;
}

/** Unidade logada a partir da URL do Belle: /u/3/agenda -> "3" */
export function extrairUnidadeDaUrl(url = "") {
  const match = String(url || "").match(/\/u\/(\d+)/);
  return match ? match[1] : null;
}

/** Aba do Belle em foco (prioriza a aba ativa da janela atual). */
export async function obterAbaBelle() {
  try {
    const abasAtivas = await chrome.tabs.query({ active: true, currentWindow: true });
    if (abasAtivas.length > 0 && abasAtivas[0].url && abasAtivas[0].url.includes("bellesoftware.com.br")) {
      return abasAtivas[0];
    }
    const abasBelle = await chrome.tabs.query({ url: "*://app.bellesoftware.com.br/*" });
    if (abasBelle.length > 0) return abasBelle[0];
  } catch (e) {
    console.warn("[Sessão] Erro ao localizar a aba do Belle:", e);
  }
  return null;
}

async function obterCookiesBelle() {
  try {
    const resposta = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "GET_BELLE_COOKIES" }, resolve);
    });
    return Array.isArray(resposta?.cookies) ? resposta.cookies : [];
  } catch (e) {
    return [];
  }
}

async function enviarMensagemAba(tabId, mensagem) {
  try {
    return await chrome.tabs.sendMessage(tabId, mensagem);
  } catch (err) {
    return null;
  }
}

/**
 * Ordena os tokens disponíveis do mais provável ao menos provável de ser o da
 * unidade aberta agora. Cada candidato carrega a unidade que ele representa.
 */
function montarCandidatosDeToken({ unidadeUrl, cookies, contexto }) {
  const candidatos = [];
  const vistos = new Set();

  const adicionar = (token, unidade, origem) => {
    if (!token || vistos.has(token)) return;
    vistos.add(token);
    candidatos.push({ token, unidade: unidade ? String(unidade) : null, origem });
  };

  // 1. Cookie da unidade aberta na aba do Belle — o caso normal.
  if (unidadeUrl) {
    const c = cookies.find(c => c.name === `token_${unidadeUrl}`);
    if (c) adicionar(c.value, unidadeUrl, `cookie token_${unidadeUrl}`);
  }

  // 2. Token que a página está usando agora (capturado das requisições do Belle).
  if (contexto?.auth?.token) {
    adicionar(contexto.auth.token, contexto.auth.etb || unidadeUrl, "requisição interceptada na página");
  }

  // 3. Cookies genéricos de sessão (o Belle espelha a unidade aberta neles).
  cookies
    .filter(c => c.name === "token" || c.name === "authToken")
    .forEach(c => adicionar(c.value, unidadeUrl, `cookie ${c.name}`));

  // 4. Demais unidades com sessão no navegador. Só entram se nada acima autenticar,
  //    e a unidade adotada passa a ser a do próprio cookie (nunca a "1" fixa).
  cookies
    .filter(c => /^token_\d+$/.test(c.name))
    .forEach(c => adicionar(c.value, c.name.replace("token_", ""), `cookie ${c.name} (outra unidade)`));

  return candidatos;
}

/**
 * Resolve a sessão consultando o próprio Belle: valida o token e traz o usuário
 * logado e as unidades a que ele tem acesso.
 */
export async function resolverSessaoBelle() {
  const aba = await obterAbaBelle();
  const contexto = aba?.id ? await enviarMensagemAba(aba.id, { action: "GET_BELLE_PAGE_CONTEXT" }) : null;

  const unidadeUrl = extrairUnidadeDaUrl(aba?.url) || extrairUnidadeDaUrl(contexto?.url);
  const codUsuario = contexto?.codUsuario || state.currentCodUsuario || "master-admin";
  const cookies = await obterCookiesBelle();

  const candidatos = montarCandidatosDeToken({ unidadeUrl, cookies, contexto });

  const sessao = {
    unidade: null,
    unidadeAba: unidadeUrl,
    token: null,
    origemToken: null,
    tabId: aba?.id || null,
    urlAba: aba?.url || "",
    dataAgenda: contexto?.dataAgenda || null,
    codUsuario: codUsuario,
    usuario: null,
    estabelecimentos: [],
    nomeUnidade: null,
    validada: false
  };

  if (candidatos.length === 0) {
    console.warn("[Sessão] ⚠️ Nenhum token do Belle encontrado. A usuária precisa estar logada no Belle nesta janela.");
    return sessao;
  }

  // Valida contra o Belle: o token bom é o que responde a lista de estabelecimentos do usuário.
  for (const candidato of candidatos) {
    const ests = await buscarEstabelecimentosApi(candidato.token, candidato.unidade || "1");
    if (Array.isArray(ests) && ests.length > 0) {
      sessao.token = candidato.token;
      sessao.origemToken = candidato.origem;
      sessao.estabelecimentos = ests;
      sessao.validada = true;

      // A unidade é a do TOKEN que autenticou — é ele que seleciona a filial no backend.
      // A URL só entra quando o token não carrega unidade própria (cookie genérico).
      // Assumir a unidade da URL usando o token de outra filial era exatamente o que
      // fazia o painel rotular como #5 dados que vinham da #3.
      const unidadeCandidata = candidato.unidade || unidadeUrl;

      if (unidadeUrl && candidato.unidade && String(candidato.unidade) !== String(unidadeUrl)) {
        console.warn(`[Sessão] ⚠️ A aba do Belle está em /u/${unidadeUrl}, mas quem autenticou foi a sessão da unidade #${candidato.unidade}. Seguindo a unidade do token para não misturar filiais.`);
      }
      // A unidade é SEMPRE a da sessão aberta (URL / cookie do token). A lista de
      // estabelecimentos serve apenas para NOMEAR a unidade — nunca para substituí-la.
      sessao.unidade = String(unidadeCandidata ?? "1");
      sessao.nomeUnidade = nomeDaUnidadeAtiva(ests, unidadeCandidata);
      break;
    }
  }

  // Nenhum token autenticou (rede fora, sessão expirada): usa o melhor candidato para
  // não deixar o painel mudo, deixando claro que a sessão não foi confirmada.
  if (!sessao.token) {
    const primeiro = candidatos[0];
    sessao.token = primeiro.token;
    sessao.origemToken = `${primeiro.origem} (não validado)`;
    sessao.unidade = String(primeiro.unidade || unidadeUrl || "1");
    console.warn("[Sessão] ⚠️ Nenhum token pôde ser validado no Belle. Seguindo com o token mais provável:", sessao.origemToken);
  }

  // Perfil do usuário logado (recuperar_dados). O código do usuário pode vir da página,
  // da configuração manual do painel ou do padrão: tenta na ordem até o Belle responder.
  const candidatosUsuario = [contexto?.codUsuario, state.currentCodUsuario, "master-admin"]
    .map(c => (c ? String(c).trim() : ""))
    .filter((c, i, arr) => c && arr.indexOf(c) === i);

  for (const cod of candidatosUsuario) {
    const perfil = await buscarDadosUsuarioApi(sessao.token, cod);
    if (perfil && (perfil.nom_usuario || perfil.cod_usuario || perfil.login)) {
      sessao.usuario = perfil;
      sessao.codUsuario = perfil.cod_usuario || perfil.login || cod;
      console.log(`[Sessão] 👤 Usuário logado no Belle: ${perfil.nom_usuario || sessao.codUsuario} (${sessao.codUsuario})`);
      break;
    }
  }

  if (!sessao.usuario) {
    console.warn(`[Sessão] ⚠️ recuperar_dados não respondeu para: ${candidatosUsuario.join(", ")}. Ajuste o código do usuário em ⚙️ Configurações.`);
  }

  return sessao;
}

/**
 * Grava a sessão no estado global. Ao trocar de unidade, descarta TODO dado da
 * unidade anterior para que agenda, atendimento e CS nunca misturem filiais.
 */
export function aplicarSessaoNoEstado(sessao) {
  if (!sessao || !sessao.unidade) return { unidadeAlterada: false };

  const unidadeAnterior = String(state.currentCodEstab || "");
  const unidadeAlterada = Boolean(unidadeAnterior) && String(sessao.unidade) !== unidadeAnterior;

  if (unidadeAlterada) {
    console.log(`[Sessão] 🏢 Unidade ativa: #${unidadeAnterior} → #${sessao.unidade}. Limpando dados da unidade anterior.`);
    state.appointmentsData = [];
    state.selectedAppointment = null;
    definirArrGrid(null, null);
    state.lastInterceptedAgendaPayload = null;
    state.currentSalas = [];
    limparCachesAtendimento();
  }

  state.currentCodEstab = String(sessao.unidade);
  state.unidadeAbaResolvida = sessao.unidadeAba || null;
  // Unidade da aba que o painel acompanha. O stream ao vivo dessa aba é o que a operadora
  // está vendo no Belle, então ele é aceito; o filtro existe só para barrar uma SEGUNDA
  // aba aberta em outra filial.
  state.unidadeAbaBelle = sessao.unidadeAba ? String(sessao.unidadeAba) : null;
  if (sessao.token) state.currentToken = sessao.token;
  if (sessao.codUsuario) state.currentCodUsuario = sessao.codUsuario;
  if (sessao.usuario) state.currentUserData = sessao.usuario;
  if (Array.isArray(sessao.estabelecimentos) && sessao.estabelecimentos.length > 0) {
    state.currentEstabelecimentos = sessao.estabelecimentos;
  }
  if (sessao.nomeUnidade) state.currentClinicaNome = sessao.nomeUnidade;

  return { unidadeAlterada };
}

/**
 * O content script roda em TODAS as abas do Belle. Descarta mensagens de uma aba
 * logada em outra unidade, para não contaminar agenda, atendimento e CS.
 */
export function mensagemEhDaUnidadeAtiva(sender) {
  const unidadeRemetente = extrairUnidadeDaUrl(sender?.tab?.url || sender?.url || "");
  if (!unidadeRemetente) return true;       // URL sem unidade: não há o que comparar

  // Compara APENAS com a unidade da aba acompanhada. Sem ela, o filtro deixa passar:
  // um filtro que bloqueia por desconhecimento derruba a agenda ao vivo e o clique em
  // agendamento em silêncio, que foi exatamente o que aconteceu.
  const unidadeAba = state.unidadeAbaBelle;
  if (!unidadeAba) return true;

  return String(unidadeRemetente) === String(unidadeAba);
}
