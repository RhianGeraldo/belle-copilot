# 📅 Mapeamento do Fluxo de Disponibilidade e Agendamento no Belle Software

Este documento detalha as requisições, cabeçalhos, parâmetros e payloads interceptados da API do Belle Software para consulta de disponibilidade de horários, turnos válidos e criação de novos agendamentos na agenda da clínica.

---

## 🧭 Visão Geral do Ciclo de Disponibilidade (Etapas 1 a 4)

Ao selecionar ou sugerir uma data futura (ex: `17/10/2026` após 45 ou 25 dias de intervalo), o sistema executa o seguinte fluxo para mapear os horários 100% livres e válidos para a paciente:

```mermaid
sequenceDiagram
    autonumber
    participant UI as Belle Copilot (Modal)
    participant API as Belle API (app.bellesoftware.com.br)
    
    UI->>API: 1. GET /arvoresala?estabGeral=1
    API-->>UI: Retorna árvore de categorias e salas com seletores ("sel")
    
    UI->>API: 2. GET /gridsala?etb=1&restringe=0&estabGeral=1
    API-->>UI: Retorna configuração das colunas/salas (limite, tempo, id_geinfo)
    
    UI->>API: 3. GET /turnos_validos?cod={cod_sala}&tpAgd=s&dtAgenda={ISO_UTC}&estabGeral=1
    API-->>UI: Retorna grade de funcionamento da sala (horário de abertura e fechamento)
    
    UI->>API: 4. POST /agendaapi?estabGeral=1 (arrGrid para a data futura)
    API-->>UI: Retorna todos os agendamentos existentes no dia (ocupações)
```

---

## 1️⃣ Requisição: Árvore de Salas (`arvoresala`)

Obtém a hierarquia de setores, categorias de salas e os identificadores de seleção de cada recurso.

* **URL**: `https://app.bellesoftware.com.br/api/release/controller/Agenda/v1.0/arvoresala?estabGeral=1`
* **Método**: `GET`
* **Headers**:
  * `authorization`: Token ativo da sessão
  * `etb`: `1` (ou código do estabelecimento)
  * `restringe`: `0`
  * `accept`: `application/json, text/plain, */*`

### Exemplo de Resposta:
```json
{
  "rs": [
    {
      "codigo": 1,
      "nome": "AVALIAÇÃO",
      "checked": false,
      "title": "AVALIAÇÃO",
      "tipo": "sala",
      "area": "1",
      "items": [
        {
          "cod_sala": 1,
          "nome": "AVALIAÇÃO NOVOS CLEINTES",
          "sel": "975663",
          "limite": 9,
          "title": "AVALIAÇÃO NOVOS CLEINTES",
          "codTipo": 1,
          "nomeTipo": "AVALIAÇÃO",
          "tipo": "sala",
          "area": "2",
          "isLeaf": true,
          "checked": true,
          "codAgenda": 1
        }
      ]
    },
    {
      "codigo": 2,
      "nome": "SERVIÇOS ",
      "checked": false,
      "title": "SERVIÇOS ",
      "tipo": "sala",
      "area": "1",
      "items": [
        {
          "cod_sala": 2,
          "nome": "SALA DE DEPILAÇAO A LASER",
          "sel": "975664",
          "limite": 1,
          "title": "SALA DE DEPILAÇAO A LASER",
          "codTipo": 2,
          "nomeTipo": "SERVIÇOS ",
          "tipo": "sala",
          "area": "2",
          "isLeaf": true,
          "checked": true,
          "codAgenda": 2
        },
        {
          "cod_sala": 3,
          "nome": "PROCEDIMENTOS  (TODOS OS  OUTROS  SERVIÇOS )",
          "sel": "975665",
          "limite": 10,
          "title": "PROCEDIMENTOS  (TODOS OS  OUTROS  SERVIÇOS )",
          "codTipo": 2,
          "nomeTipo": "SERVIÇOS ",
          "tipo": "sala",
          "area": "2",
          "isLeaf": true,
          "checked": true,
          "codAgenda": 3
        }
      ]
    }
  ]
}
```

---

## 2️⃣ Requisição: Grid de Salas (`gridsala`)

Retorna a lista estruturada das salas operacionais com duração padrão de slots (`tempo`), limite de atendimentos simultâneos e `id_geinfo`.

* **URL**: `https://app.bellesoftware.com.br/api/release/controller/Agenda/v1.0/gridsala?etb=1&restringe=0&estabGeral=1`
* **Método**: `GET`
* **Headers**:
  * `authorization`: Token ativo da sessão
  * `accept`: `application/json, text/plain, */*`

### Exemplo de Resposta:
```json
[
  {
    "id_geinfo": 85015,
    "codigo": 975663,
    "login": "master-admin",
    "cod_tipo": 1,
    "cod_sala": 1,
    "todos": "1",
    "id": 1,
    "cod_clinica": "1",
    "nom_clinica": "ESTETICA E LASER MANTENA",
    "nome": "AVALIAÇÃO NOVOS CLEINTES",
    "tempo": "20",
    "limite": 9,
    "foto": "",
    "title": "AVALIAÇÃO NOVOS CLEINTES"
  },
  {
    "id_geinfo": 85015,
    "codigo": 975664,
    "login": "master-admin",
    "cod_tipo": 2,
    "cod_sala": 2,
    "todos": "1",
    "id": 2,
    "cod_clinica": "1",
    "nom_clinica": "ESTETICA E LASER MANTENA",
    "nome": "SALA DE DEPILAÇAO A LASER",
    "tempo": "5",
    "limite": 1,
    "foto": "",
    "title": "SALA DE DEPILAÇAO A LASER"
  },
  {
    "id_geinfo": 85015,
    "codigo": 975665,
    "login": "master-admin",
    "cod_tipo": 2,
    "cod_sala": 3,
    "todos": "1",
    "id": 3,
    "cod_clinica": "1",
    "nom_clinica": "ESTETICA E LASER MANTENA",
    "nome": "PROCEDIMENTOS  (TODOS OS  OUTROS  SERVIÇOS )",
    "tempo": "5",
    "limite": 10,
    "foto": "",
    "title": "PROCEDIMENTOS  (TODOS OS  OUTROS  SERVIÇOS )"
  }
]
```

---

## 3️⃣ Requisição: Turnos Válidos (`turnos_validos`)

Consulta para cada sala/recurso os horários de início e término de expediente permitidos para a data alvo.

* **URL**: `https://app.bellesoftware.com.br/api/release/controller/Buscas/v1.0/turnos_validos?cod={cod_sala}&tpAgd=s&dtAgenda={dtAgendaUtc}&estabGeral=1`
* **Método**: `GET`
* **Parâmetros de Query**:
  * `cod`: Código da Sala (ex: `1`, `2`, `3`);
  * `tpAgd`: `"s"` (Sala / Recurso);
  * `dtAgenda`: Data no formato ISO UTC (ex: `2026-10-17T03:00:00.000Z`, correspondente às 00:00 no fuso de Brasília GMT-3);
  * `estabGeral`: `1`.
* **Headers**:
  * `authorization`: Token ativo da sessão

### Exemplo de Resposta:
```json
[
  { "daysOfWeek": [1], "startTime": "08:00", "endTime": "20:00" },
  { "daysOfWeek": [1], "startTime": "08:00", "endTime": "22:00" },
  { "daysOfWeek": [2], "startTime": "08:00", "endTime": "20:00" },
  { "daysOfWeek": [2], "startTime": "08:00", "endTime": "22:00" },
  { "daysOfWeek": [3], "startTime": "08:00", "endTime": "20:00" },
  { "daysOfWeek": [3], "startTime": "08:00", "endTime": "22:00" },
  { "daysOfWeek": [4], "startTime": "08:00", "endTime": "20:00" },
  { "daysOfWeek": [4], "startTime": "08:00", "endTime": "22:00" },
  { "daysOfWeek": [5], "startTime": "08:00", "endTime": "20:00" },
  { "daysOfWeek": [5], "startTime": "08:00", "endTime": "22:00" },
  { "daysOfWeek": [6], "startTime": "08:00", "endTime": "12:00" },
  { "daysOfWeek": [6], "startTime": "12:00", "endTime": "22:00" }
]
```

---

## 4️⃣ Requisição: Ocupação do Dia (`agendaapi`)

Recupera todos os agendamentos já marcados para a data alvo na grade de salas especificada.

* **URL**: `https://app.bellesoftware.com.br/api/release/controller/Agenda/v1.0/agendaapi?estabGeral=1`
* **Método**: `POST`
* **Headers**:
  * `authorization`: Token ativo da sessão
  * `content-type`: `text/plain`
  * `accept`: `application/json, text/plain, */*`
* **Body (Payload text/plain)**:
  JSON stringificado contendo a lista de `arrGrid` para a data da consulta futura (ex: `2026-10-17`).

---

## 🧠 Algoritmo de Cálculo de Horários Livres (Disponibilidade)

Com as informações das 4 requisições:
1. **Faixa de Atendimento**: Obtida em `turnos_validos` (ex: `08:00` às `20:00`);
2. **Duração do Procedimento**: Calculada somando os tempos das áreas selecionadas (ex: 20 min);
3. **Bloqueios / Conflitos**: Extraídos de `agendaapi` (todos os agendamentos marcados entre `start_date` e `end_date` daquela sala);
4. **Horários Sugeridos**: Slots livres onde `[Horário Início, Horário Início + Duração]` não colide com agendamentos existentes na mesma sala.
