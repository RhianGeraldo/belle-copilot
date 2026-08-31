# 🚀 Belle Copilot - Assistente Inteligente para Belle Software

Extensão do Google Chrome desenvolvida em arquitetura moderna (Manifest V3 + ES Modules) para otimizar, acelerar e guiar a operação de clínicas de estética e depilação a laser integradas ao **Belle Software**.

---

## 🌟 Principais Funcionalidades

1. **Sincronização em Tempo Real (0ms)**:
   - Captura instantânea de dados de sessão direto das requisições do Belle Software, por interceptação de `XMLHttpRequest`/`fetch` no MAIN world (`interceptor.js`) e repasse ao content script com validação de origem.
   - Resolução da **unidade logada** e do usuário pelo próprio Belle (`recuperar_dados` + `estabelecimentos_do_usuario`), em `core/session.js`.
   - Sincronização automática de datas e salas selecionadas no calendário do Belle.

2. **Visão da Agenda & KPIs**:
   - KPIs no topo: **Total**, **Confirmados**, **Aguardando** e **Atendidos**.
   - Filtros rápidos por sala/profissional e status tabs.
   - Mapeamento completo dos status oficiais do Belle (`Marcado`, `Confirmado`, `Aguardando`, `Em Andamento`, `Atendido`, `Falhou`, `Bloqueado`).

3. **Painel Clínico de Atendimento & Parâmetros Laser**:
   - **📢 Fila de Próxima Cliente a Chamar**: Identifica automaticamente a próxima cliente aguardando na recepção com botão de chamada rápida.
   - **Histórico Completo do Laser**: Exibe os últimos parâmetros aplicados por área (Joules, Pulso, Frequência, Ponteira, Disparos).
   - **Controle de Sessões & Saldos**: Exibe a contagem de sessões realizadas vs. contratadas com barras de progresso visual.
   - **Validação de Evolução Clínica**: Trava de segurança para impedir finalização sem registro de evolução nas áreas atendidas.
   - **Transição Automática de Fila**: Ao finalizar os atendimentos da cliente atual, abre automaticamente a próxima cliente com status `Aguardando`.
   - **Ofertas & Cadência Clínica** (`engines/cadencia-ofertas.js`): dentro da própria ficha de atendimento, prescreve a oferta do dia conforme a fase do tratamento (inicial, expansão de áreas ou reta final), com motivo clínico e script verbal pronto para a aplicadora.

4. **Sucesso do Cliente (CS / Pós-Laser 24h & 3 Dias)**:
   - Acompanhamento automático de clientes com status **Atendido / Finalizado** em 24h (ontem) e 3 dias pós-procedimento.
   - Pinned no "HOJE" real (independente da navegação manual de datas na agenda do Belle).
   - Consolidação de múltiplas áreas tratadas pela mesma cliente em um único card com link direto do WhatsApp (`wa.me`) e script clínico pronto.
   - Controle de contato diário ("Marcar como Feito") com persistência local.

5. **Vendas & Resgate de Orçamentos (Funil Comercial)**:
   - Sub-aba no módulo Comercial alimentada pelo `vendasplanos` dos **últimos 90 dias**.
   - KPIs do funil: aprovado no período, **valor parado a resgatar**, taxa de conversão, ticket médio, desconto médio e cortesias.
   - Duas filas de trabalho separadas: **🔥 Aguardando** (link de pagamento gerado — cadência D+0/D+1/D+3) e **💬 Pendente** (orçamento apresentado — D+1/D+3/D+7/D+15/D+30), além de Suspenso.
   - Cada card traz a etapa da cadência vencendo hoje, script pronto de WhatsApp, valor, desconto, consultora responsável e controle diário de "contatada".
   - Ranking por consultora: fechados, taxa de conversão e valor ainda em aberto.

---

## 📁 Estrutura do Projeto

```
belle-copilot/
├── manifest.json              # Configuração Manifest V3
├── background.js              # Service worker & inicialização do sidepanel
├── content.js                 # Injeção de scripts & captura de DOM/eventos
├── interceptor.js             # Interceptação de tráfego de rede (XHR/Fetch)
├── logo.png                   # Identidade visual da extensão
├── icons/                     # Ícones em resoluções 16x16, 32x32, 48x48, 128x128
├── docs/                      # Mapeamento técnico detalhado das APIs do Belle
│   ├── MAPEAMENTO_AGENDA_BELLE.md
│   ├── MAPEAMENTO_API_BELLE.md
│   └── MAPEAMENTO_USUARIO_SESSAO.md
└── sidepanel/                 # Interface do painel lateral (Chrome Side Panel)
    ├── sidepanel.html         # Estrutura visual HTML5
    ├── sidepanel.css          # Design system responsivo e moderno
    ├── main.js                # Orquestrador central e inicialização
    ├── core/                  # Estado global, sessão, RBAC e cliente de API
    │   ├── state.js
    │   ├── session.js          # Unidade logada + usuário ativo do Belle
    │   ├── cache-persistente.js # Cache de cadastro em chrome.storage.local
    │   ├── permissions.js
    │   └── api-client.js
    ├── engines/               # Motores de regras clínicas e comerciais
    │   ├── cadencia-ofertas.js
    │   ├── cadencia-vendas.js  # Filas de resgate e cadência de follow-up
    │   └── laser-safety.js
    ├── views/                 # Módulos de visualização
    │   ├── agenda-view.js
    │   ├── atendimento-view.js
    │   ├── comercial-view.js
    │   ├── cs-view.js
    │   ├── vendas-view.js
    │   └── config-view.js
    └── components/            # Modais e componentes reutilizáveis
        ├── modal-trava.js
        ├── modal-proximo.js
        └── modal-agendar-proxima.js
```

---

## 🔧 Como Instalar e Testar

1. Abra o Google Chrome e acesse `chrome://extensions/`;
2. Ative o modo de desenvolvedor (**Developer mode**) no canto superior direito;
3. Clique em **Load unpacked** (Carregar sem compactação);
4. Selecione a pasta `belle-copilot/`;
5. Abra o **Belle Software** no navegador e utilize o Side Panel lateral integrado!

---

## 📄 Licença
Proprietário - Todos os direitos reservados.
