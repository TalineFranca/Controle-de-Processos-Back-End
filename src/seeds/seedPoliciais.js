/**
 * Seed: importa todos os policiais do CSV do 3º BPM para o MongoDB.
 *
 * Uso:
 *   npm run seed
 *
 * O CSV possui seções identificadas por cabeçalhos textuais.
 * Este script detecta automaticamente cada seção, extrai unidade,
 * subunidade e localidade, e insere todos os policiais com a
 * ordem hierárquica calculada pelo modelo.
 *
 * Variável de ambiente CSV_PATH pode sobrescrever o caminho padrão.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import Policial, { obterOrdemHierarquica } from '../modelos/Policial.js';

// ─────────────────────────────────────────────
// Parseia o CSV sem dependências externas
// ─────────────────────────────────────────────

const CSV_PATH = process.env.CSV_PATH || resolve(__dirname, '../../data/efetivo.csv');

/**
 * Lê um CSV simples (sem header) e retorna array de arrays de strings.
 */
function lerCSV(caminho) {
  const conteudo = readFileSync(caminho, 'utf-8');
  return conteudo
    .split('\n')
    .map((linha) =>
      linha.split(',').map((cel) => cel.replace(/^"|"$/g, '').trim())
    );
}

/**
 * Extrai localidade do nome da seção.
 * Ex: "1ª CIA PM/3º BPM (VILHENA)" → "VILHENA"
 * Ex: "3º GP PM/1º PEL PM/1ª CIA PM/3º BPM (NOVA CONQUISTA)" → "NOVA CONQUISTA"
 */
function extrairLocalidade(nomeSec) {
  const match = nomeSec.match(/\(([^)]+)\)/);
  return match ? match[1].trim().toUpperCase() : 'VILHENA';
}

/**
 * Extrai unidade principal da seção.
 * Ex: "1ª CIA PM/3º BPM (VILHENA)" → "1ª CIA PM"
 * Ex: "GAB COMANDO/3º BPM (Vilhena)" → "GAB COMANDO"
 */
function extrairUnidade(nomeSec) {
  const semParenteses = nomeSec.replace(/\([^)]*\)/g, '').trim();
  const partes = semParenteses.split('/');
  // Procura "CIA PM", "BPM", "GAB", "ESTADO MAIOR", "PCSv", "FORMAÇÃO"
  for (const parte of partes) {
    const p = parte.trim().toUpperCase();
    if (
      p.includes('CIA PM') ||
      p.includes('GAB') ||
      p.includes('ESTADO MAIOR') ||
      p.includes('PCSV') ||
      p.includes('FORMAÇÃO') ||
      p.includes('SANITÁRIA')
    ) {
      return p;
    }
  }
  // Fallback: primeira parte
  return partes[0].trim().toUpperCase();
}

/**
 * Extrai subunidade (pelotão/grupo) da seção quando existir.
 */
function extrairSubunidade(nomeSec) {
  const sem = nomeSec.replace(/\([^)]*\)/g, '').trim();
  const partes = sem.split('/').map((p) => p.trim().toUpperCase());
  // Subunidades são pelotões ou grupos de policiamento
  for (const p of partes) {
    if (p.match(/\d+[ºª]?\s*(PEL|GP|PELOTÃO)/)) return p;
  }
  return null;
}

// ─────────────────────────────────────────────
// Detecta se uma linha é cabeçalho de seção
// (texto não numérico na primeira coluna,
//  sem ser "NR. ORDEM" ou variações)
// ─────────────────────────────────────────────
function ehCabecalhoSecaoJS(linha) {
  const col0 = (linha[0] || '').trim();
  if (!col0) return false;
  if (/^NR\.?\s*ORDEM$/i.test(col0)) return false;
  if (/^POSTO/i.test(col0)) return false;
  if (/^\d+$/.test(col0)) return false;
  if (/^IVAN|^Comandante|^Portaria/i.test(col0)) return false; // rodapé
  return /[a-zA-ZÀ-ÿ]/.test(col0);
}

function ehLinhaPolicial(linha) {
  const col0 = (linha[0] || '').trim();
  return /^\d+$/.test(col0); // primeira coluna é número de ordem
}

// ─────────────────────────────────────────────
// Processa o CSV e monta array de policiais
// ─────────────────────────────────────────────
function processarCSV(linhas) {
  const policiais = [];
  let secaoAtual = 'GAB COMANDO';
  let unidadeAtual = 'GAB COMANDO';
  let subunidadeAtual = null;
  let localidadeAtual = 'VILHENA';

  for (const linha of linhas) {
    if (ehCabecalhoSecaoJS(linha)) {
      secaoAtual = linha[0].trim();
      unidadeAtual = extrairUnidade(secaoAtual);
      subunidadeAtual = extrairSubunidade(secaoAtual);
      localidadeAtual = extrairLocalidade(secaoAtual);
      continue;
    }

    if (!ehLinhaPolicial(linha)) continue;

    const nrOrdem = parseInt(linha[0], 10);
    const postoGraduacao = (linha[1] || '').trim();
    const nomeGuerra = (linha[2] || '').trim();
    const nomeCompleto = (linha[3] || '').trim();
    const funcao = (linha[4] || 'OPERACIONAL').trim() || 'OPERACIONAL';

    if (!postoGraduacao || !nomeCompleto) continue;

    policiais.push({
      nrOrdem,
      postoGraduacao,
      nomeGuerra,
      nomeCompleto,
      funcao,
      unidade: unidadeAtual,
      subunidade: subunidadeAtual,
      localidade: localidadeAtual,
      secaoOrigem: secaoAtual,
      ordemHierarquica: obterOrdemHierarquica(postoGraduacao),
      ativo: true,
    });
  }

  return policiais;
}

// ─────────────────────────────────────────────
// Executa o seed
// ─────────────────────────────────────────────
async function executarSeed() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/controle_processos_pm';

  console.log('\n🌱 Iniciando seed de policiais...');
  console.log(`📄 CSV: ${CSV_PATH}`);
  console.log(`🗄️  MongoDB: ${mongoUri}\n`);

  // Conecta ao MongoDB
  await mongoose.connect(mongoUri);
  console.log('[MongoDB] Conectado ✓\n');

  // Lê e processa o CSV
  let linhas;
  try {
    linhas = lerCSV(CSV_PATH);
  } catch (erro) {
    console.error(`❌ Erro ao ler CSV: ${erro.message}`);
    console.error(`   Verifique se o arquivo existe em: ${CSV_PATH}`);
    console.error(`   Ou defina CSV_PATH=caminho/para/o/arquivo.csv\n`);
    process.exit(1);
  }

  const policiais = processarCSV(linhas);
  console.log(`📊 Policiais encontrados no CSV: ${policiais.length}`);

  if (policiais.length === 0) {
    console.error('❌ Nenhum policial encontrado. Verifique o formato do CSV.');
    process.exit(1);
  }

  // Mostra prévia das seções encontradas
  const secoes = [...new Set(policiais.map((p) => p.secaoOrigem))];
  console.log(`\n📍 Seções encontradas (${secoes.length}):`);
  secoes.forEach((s) => {
    const qtd = policiais.filter((p) => p.secaoOrigem === s).length;
    console.log(`   • ${s} (${qtd} policiais)`);
  });

  // Verifica se já existem dados
  const existentes = await Policial.countDocuments();
  if (existentes > 0) {
    console.log(`\n⚠️  Já existem ${existentes} policiais no banco.`);
    const modo = process.env.SEED_MODO || 'upsert';
    console.log(`   Modo: ${modo.toUpperCase()}\n`);

    if (modo === 'limpar') {
      await Policial.deleteMany({});
      console.log('   Coleção limpa. Reinserindo...\n');
    } else {
      // Modo upsert: atualiza existentes pelo nomeCompleto
      console.log('   Executando upsert por nomeCompleto...\n');
      let atualizados = 0;
      let inseridos = 0;

      for (const p of policiais) {
        const resultado = await Policial.updateOne(
          { nomeCompleto: p.nomeCompleto },
          { $set: p },
          { upsert: true }
        );
        if (resultado.upsertedCount) inseridos++;
        else atualizados++;
      }

      console.log(`✅ Seed concluído!`);
      console.log(`   Inseridos:  ${inseridos}`);
      console.log(`   Atualizados: ${atualizados}\n`);
      await mongoose.disconnect();
      return;
    }
  }

  // Inserção em lote
  await Policial.insertMany(policiais, { ordered: false });

  const total = await Policial.countDocuments();
  console.log(`✅ Seed concluído! Total no banco: ${total} policiais\n`);

  // Exemplos por hierarquia
  console.log('📋 Amostra por hierarquia:');
  const amostra = await Policial.find({}).sort({ ordemHierarquica: 1, nrOrdem: 1 }).limit(5);
  amostra.forEach((p) =>
    console.log(`   [${p.ordemHierarquica}] ${p.postoGraduacao} ${p.nomeGuerra} — ${p.unidade} (${p.localidade})`)
  );

  await mongoose.disconnect();
  console.log('\n[MongoDB] Desconectado. Seed finalizado.\n');
}

executarSeed().catch((erro) => {
  console.error('❌ Erro no seed:', erro);
  process.exit(1);
});
