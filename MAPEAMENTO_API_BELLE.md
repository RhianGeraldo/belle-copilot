# Mapeamento Técnico e Funcional das APIs do Belle Software

Este documento mapeia os três endpoints principais do **Belle Software** consumidos pela extensão para consulta de planos, histórico financeiro de parcelas, saldo de serviços/sessões e geração do cálculo padronizado de rescisão.

---

## 1. Visão Geral de Autenticação & Parâmetros Base

| Parâmetro / Header | Regra de Negócio | Descrição |
| :--- | :--- | :--- |
| **`authorization`** | Dinâmico por Unidade | Token obtido do cookie da unidade ativa (`token_3`, `token_1`, `token_0` etc.). Enviado no header de todas as requisições HTTP. |
| **`codEstab`** | Fixo `= 1` | O identificador do estabelecimento nas rotas de API é mantido como `1`. |
| **`estabGeral`** | Fixo `= 1` | Garante que a consulta abranja a estrutura geral da rede. |
| **`dtIni` / `dtFim`** | Formato ISO 8601 | Exemplo: `2021-01-01T03:00:00.000Z` até `2026-08-29T03:00:00.000Z`. |

---

## 2. Endpoint 1: Consulta de Venda do Plano / Orçamento (`vendasplanos`)

* **Finalidade:** Retorna o cabeçalho completo do plano vendido, dados do cliente/paciente, responsável legal, **Valor Bruto (`preco`)**, descontos aplicados, valor final contratado (`preco_final`) e forma de pagamento.
* **Método:** `GET`
* **URL:**
```http
https://app.bellesoftware.com.br/api/release/controller/Plano/v1.0/vendasplanos?dtIni=2021-01-01T03:00:00.000Z&dtFim=2026-08-29T03:00:00.000Z&codEstab=1&codCliente=&codVendedor=&codOrc=408491812&status=&origem=Ambos&tpPlan=&pfCmp=&ckClass=1&rating=0&nomePlan=&ord=&cres=0&vencidos=0&tpDt=0&codCamp=&indicacao=&ckFinan=0&somenteCortesia=0&valorIni=0&valorFim=0&contrato=&limit=10&offset=0&somenteSaldo=0&estabGeral=1
```

### 2.1. Exemplo de Resposta (JSON)
```json
{
  "qtdRegistros": 1,
  "registros": [
    {
      "cod_orcamento": 408491812,
      "codAgenda": "---",
      "cod_paciente": 15269037,
      "nom_paciente": "PAULA ROBERTA FURLANE ZOTTELE  - GRAVIDA 06/05/26",
      "cod_clinica": "1",
      "nom_clinica": "ESTETICA E LASER LINHARES",
      "descricao": "ok",
      "cod_plano": 58776949,
      "nomePlano": "17 -  VIRILHA COMPLETA 10SS + PERIANAL 10SS + AXILAS 10SS + BUÇO 10SS -  COMBO VERÃO",
      "dtProp": "10/11/2025",
      "validade": 24,
      "cod_usuario": "82700",
      "nom_usuario": "BARBARA MARTINS ",
      "dtValPlano": "10/11/2027",
      "dt_inclusao": "2025-11-10",
      "vencido": false,
      "preco": "2.396,00",
      "desconto": "70,00",
      "preco_final": "718,80",
      "tp_desconto": "1",
      "pagador": "PAULA ROBERTA FURLANE ZOTTELE  - GRAVIDA 06/05/26",
      "stOrc": "Suspenso",
      "status": "3",
      "status_anterior": "3",
      "remontar": 0,
      "tipo": "0",
      "quantidade": 0,
      "clube": "x",
      "aplicado": null,
      "cod_campanha": null,
      "forma": "p",
      "expira": null,
      "cod_troca": "",
      "logradouro": "AV LASTENIO CALMON 607 ",
      "celular": "(27)99958-9718",
      "cpf": "205.227.487-16",
      "cnpj": "",
      "tipo_pessoa": "Física",
      "email": "paulazotteli@gmail.com",
      "_cod_fin": "vnd17945810",
      "cod_indicacao": "",
      "nomInd": null,
      "cod_auxiliar": "",
      "id_geinfo": 114411,
      "sem_saldo": "",
      "labelCli": "15269037-PAULA ROBERTA FURLANE ZOTTELE  - GRAVIDA 06/05/26",
      "origem": "Presencial",
      "cplf": 58776949,
      "ccf": null,
      "dt_nascimento": "2002-12-03",
      "cpfResp": "",
      "nomeResp": "",
      "documento_estrangeiro": "",
      "idadeNaOcasiao": 22,
      "houve_tranf_sessao_entre_unidades": 0,
      "idVenda": 17945810,
      "convenio": 0,
      "qtd_minutos_vendidos": 0,
      "labelFormasPag": "005- *LINK* - PAGO LIVRE - CARTÃO DE CRÉDITO - 1X a 12X",
      "campanha_origem": 0,
      "saldo": "32",
      "nome_campanha": null,
      "auxiliar": null,
      "labelCampanha": null,
      "descReal": false,
      "lbTipo": "Serviços Fixos",
      "cor": "0xFFFFFF",
      "total": "718,80"
    }
  ]
}
```

---

## 3. Endpoint 2: Listar Parcelas e Lançamentos Financeiros (`listar_parcelas`)

* **Finalidade:** Retorna todas as parcelas financeiras do contrato, identificando quais foram **efetivamente pagas**, valores, vencimentos, taxas de intermediação/gateway e saldo pendente.
* **Método:** `GET`
* **URL:**
```http
https://app.bellesoftware.com.br/api/release/controller/Financeiro/v1.0/listar_parcelas?tip=R&codref=408491812&tipori=Plano&excluir=true&estabGeral=1
```

---

## 4. Endpoint 3: Consultar Saldos e Sessões de Serviços (`saldovendaplano`)

* **Finalidade:** Retorna cada serviço individual do plano, quantidade total de sessões, sessões já realizadas/gastas, saldo restante e o valor unitário.
* **Método:** `GET`
* **URL:**
```http
https://app.bellesoftware.com.br/api/release/controller/Plano/v1.0/saldovendaplano?estabGeral=1
```

---

## 5. Resumo da Estrutura nos 5 Blocos

### 👤 BLOCO 1: Informações do Cliente (Lista Vertical)
- **CPF:** `205.227.487-16`
- **Celular / WhatsApp:** `(27)99958-9718`
- **E-mail:** `paulazotteli@gmail.com`
- **Cidade / Endereço:** `AV LASTENIO CALMON 607`
- **Responsável Legal:** *(Exibido apenas se cadastrado)*

### 📋 BLOCO 2: Informações do Orçamento / Plano (Tabs)
- **Tab 1 (Geral & Venda):** Cód. Orçamento (`408491812`), ID Venda (`17945810`), Unidade, Vendedor, Forma de Pagamento.
- **Tab 2 (Valores & Preço):** Valor Bruto (`R$ 2.396,00`), Desconto (`70,00%`), Preço Final (`R$ 718,80`), Saldo (`32 sessões`).
- **Tab 3 (Vigência & Prazos):** Data da Venda (`10/11/2025`), Validade (`24 meses`), Expiração (`10/11/2027`).

### 📊 BLOCO 3: Sessões & Consumo
- Consolidado **Com Rateio** (Preço Final) e **Sem Rateio** (Valor Bruto `preco`).
- Barra de consumo e detalhamento serviço a serviço.

### 💳 BLOCO 4: Lançamentos Financeiros & Parcelas
- Total Pago pelo Cliente, Total em Aberto, Taxa de Gateway e Tabela de Parcelas pagas/pendentes.

### ⚖️ BLOCO 5: Fórmula de Rescisão Padronizada
- Base da Multa de 10%: Incide diretamente sobre o **`preco` (Valor Bruto)** do plano (ex: $10\% \times \text{R\$} 2.396,00 = \text{R\$} 239,60$).
