/**
 * LaunchMetrics — planilha de vendas de um perpétuo (ex.: Agenda Cheia).
 *
 * Recebe POSTs do backend (planilha_perpetuo_service.py) no formato
 *   { "aba": "<nome do perpétuo>", "linhas": [ { id_venda, data_hora, ... } ] }
 * e grava cada venda numa linha da aba com o nome do perpétuo (cria a aba
 * se não existir). Só vendas aprovadas. Upsert por id_venda: reenviar a
 * mesma venda só atualiza a linha, não duplica.
 *
 * INSTALAÇÃO (uma vez por planilha):
 *  1. Crie a planilha no Google Sheets.
 *  2. Arquivo > Configurações > Fuso horário: (GMT-03:00) São Paulo.
 *  3. Extensões > Apps Script > cole este arquivo inteiro > salvar.
 *  4. Implantar > Nova implantação > tipo "App da Web":
 *       Executar como: Eu  |  Quem pode acessar: Qualquer pessoa
 *  5. Autorize e copie a URL do App da Web (termina em /exec).
 *  6. No dashboard: Perpétuos > (perpétuo) > Planilha > cole a URL > Salvar
 *     > "Reenviar histórico" pra trazer as vendas que já aconteceram.
 *
 * Ao alterar este código depois: Implantar > Gerenciar implantações >
 * editar > Versão: "Nova versão" (mantém a mesma URL).
 *
 * Não edite as colunas A–Q à mão: elas são reescritas a cada venda. Colunas
 * extras à direita (anotações, fórmulas) ficam intactas.
 */

// [chave enviada pelo backend, título da coluna]
const COLUNAS = [
  ['id_venda', 'ID da venda'],
  ['data_hora', 'Data/hora'],
  ['produto', 'Produto'],
  ['oferta', 'Oferta'],
  ['categoria', 'Categoria'],
  ['valor_bruto', 'Valor bruto'],
  ['plataforma', 'Plataforma'],
  ['canal', 'Canal (utm_source)'],
  ['campanha', 'Campanha (utm_campaign)'],
  ['conjunto', 'Conjunto (utm_medium)'],
  ['criativo', 'Criativo (utm_content)'],
  ['anuncio_id', 'ID do anúncio'],
  ['posicionamento', 'Posicionamento (utm_term)'],
  ['pagina', 'Página'],
  ['referencia', 'Referência'],
  ['src', 'src'],
  ['sck', 'sck'],
];
const COL_DATA = 2;
const COL_VALOR = 6;

function doPost(e) {
  const corpo = JSON.parse(e.postData.contents);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000); // vendas simultâneas não se atropelam
  try {
    const aba = obterAba_(String(corpo.aba || 'Vendas'));
    gravar_(aba, corpo.linhas || []);
  } finally {
    lock.releaseLock();
  }
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function obterAba_(nome) {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  let aba = planilha.getSheetByName(nome);
  if (!aba) {
    aba = planilha.insertSheet(nome);
    aba.getRange(1, 1, 1, COLUNAS.length)
      .setValues([COLUNAS.map((c) => c[1])])
      .setFontWeight('bold');
    aba.setFrozenRows(1);
  }
  return aba;
}

function gravar_(aba, linhas) {
  // Lê tudo, aplica o upsert em memória e escreve de uma vez — bem mais
  // rápido que uma chamada por linha quando o histórico é reenviado.
  const total = aba.getLastRow() - 1;
  const dados = total > 0 ? aba.getRange(2, 1, total, COLUNAS.length).getValues() : [];
  const posicao = {};
  dados.forEach((r, i) => { posicao[String(r[0])] = i; });

  linhas.forEach((l) => {
    const valores = COLUNAS.map(([chave]) => converter_(chave, l[chave]));
    const id = String(l.id_venda);
    if (id in posicao) {
      dados[posicao[id]] = valores;
    } else {
      posicao[id] = dados.length;
      dados.push(valores);
    }
  });
  if (!dados.length) return;

  aba.getRange(2, 1, dados.length, COLUNAS.length).setValues(dados);
  aba.getRange(2, COL_DATA, dados.length, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
  aba.getRange(2, COL_VALOR, dados.length, 1).setNumberFormat('"R$" #,##0.00');
}

function converter_(chave, valor) {
  if (valor === null || valor === undefined) return '';
  if (chave === 'data_hora') return new Date(valor);
  if (chave === 'valor_bruto') return Number(valor);
  return valor;
}
