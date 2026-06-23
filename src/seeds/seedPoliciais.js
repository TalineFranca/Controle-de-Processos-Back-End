/**
 * Seed: importa todos os policiais do CSV do 3º BPM para o MongoDB.
 *
 * Uso:
 *   npm run seed
 *
 * O script detecta automaticamente encoding UTF-8 e Latin-1 (ISO-8859-1).
 * Cada seção do CSV (GAB, CIA, PEL, GP) é identificada automaticamente.
 *
 * Variáveis de ambiente:
 *   CSV_PATH   — caminho para o arquivo CSV (padrão: data/efetivo.csv)
 *   SEED_MODO  — 'upsert' (padrão) ou 'limpar'
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import Policial, { obterOrdemHierarquica } from '../models/Policial.js';

const CSV_PATH = process.env.CSV_PATH || resolve(__dirname, '../../data/efetivo.csv');

// ─────────────────────────────────────────────
// Leitura de CSV com detecção de encoding
// ─────────────────────────────────────────────

/**
 * Tenta ler o CSV como UTF-8; se detectar caracteres inválidos,
 * tenta como Latin-1 (comum em arquivos exportados do Excel no BR).
 */
function lerCSV(caminho) {
  let conteudo;

  try {
    const buffer = readFileSync(caminho);

    // Detecta BOM UTF-8
    if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
      conteudo = buffer.slice(3).toString('utf-8');
    } else {
      // Tenta UTF-8 primeiro
      const tentativaUTF8 = buffer.toString('utf-8');
      // Se tiver caractere de substituição (U+FFFD), provavelmente é Latin-1
      if (tentativaUTF8.includes('\uFFFD')) {
        conteudo = buffer.toString('latin1');
      } else {
        conteudo = tentativaUTF8;
      }
    }
  } catch (erro) {
    throw new Error(`Não foi possível ler o arquivo: ${erro.message}`);
  }

  return conteudo
    .split('\n')
    .map((linha) =>
      linha
        .split(',')
        .map((cel) => cel.replace(/^"|"$/g, '').trim())
    );
}

// ─────────────────────────────────────────────
// Extração de metadados das seções
// ─────────────────────────────────────────────

function extrairLocalidade(nomeSec) {
  const match = nomeSec.match(/\(([^)]+)\)/);
  return match ? match[1].trim().toUpperCase() : 'VILHENA';
}

function extrairUnidade(nomeSec) {
  const semParenteses = nomeSec.replace(/\([^)]*\)/g, '').trim();
  const partes = semParenteses.split('/');
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
  return partes[0].trim().toUpperCase();
}

function extrairSubunidade(nomeSec) {
  const sem = nomeSec.replace(/\([^)]*\)/g, '').trim();
  const partes = sem.split('/').map((p) => p.trim().toUpperCase());
  for (const p of partes) {
    if (p.match(/\d+[ºª]?\s*(PEL|GP|PELOTÃO)/)) return p;
  }
  return null;
}

// ─────────────────────────────────────────────
// Detecção de linhas
// ─────────────────────────────────────────────

function ehCabecalhoSecao(linha) {
  const col0 = (linha[0] || '').trim();
  if (!col0) return false;
  if (/^NR\.?\s*ORDEM$/i.test(col0)) return false;
  if (/^POSTO/i.test(col0)) return false;
  if (/^\d+$/.test(col0)) return false;
  if (/^IVAN|^Comandante|^Portaria/i.test(col0)) return false;
  return /[a-zA-ZÀ-ÿ]/.test(col0);
}

function ehLinhaPolicial(linha) {
  return /^\d+$/.test((linha[0] || '').trim());
}

// ─────────────────────────────────────────────
// Processamento principal
// ─────────────────────────────────────────────

function processarCSV(linhas) {
  const policiais = [];
  let secaoAtual = 'GAB COMANDO';
  let unidadeAtual = 'GAB COMANDO';
  let subunidadeAtual = null;
  let localidadeAtual = 'VILHENA';

  for (const linha of linhas) {
    if (ehCabecalhoSecao(linha)) {
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
      nomeGuerra: nomeGuerra || nomeCompleto.split(' ')[0],
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
// Execução do seed
// ─────────────────────────────────────────────

async function executarSeed() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/controle_processos_pm';

  console.log('\n🌱 Iniciando seed de policiais...');
  console.log(`📄 CSV: ${CSV_PATH}`);
  console.log(`🗄️  MongoDB: ${mongoUri}\n`);

  await mongoose.connect(mongoUri);
  console.log('[MongoDB] Conectado ✓\n');

  let linhas;
  try {
    linhas = lerCSV(CSV_PATH);
    console.log(`📄 Linhas lidas: ${linhas.length}`);
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
    console.error('   Esperado: coluna 0 = nrOrdem, 1 = posto, 2 = nomeGuerra, 3 = nomeCompleto, 4 = funcao');
    process.exit(1);
  }

  // Exibe seções encontradas
  const secoes = [...new Set(policiais.map((p) => p.secaoOrigem))];
  console.log(`\n📍 Seções encontradas (${secoes.length}):`);
  secoes.forEach((s) => {
    const qtd = policiais.filter((p) => p.secaoOrigem === s).length;
    console.log(`   • ${s} (${qtd} policiais)`);
  });

  const existentes = await Policial.countDocuments();
  const modo = process.env.SEED_MODO || 'upsert';

  if (existentes > 0) {
    console.log(`\n⚠️  Já existem ${existentes} policiais no banco. Modo: ${modo.toUpperCase()}\n`);

    if (modo === 'limpar') {
      await Policial.deleteMany({});
      console.log('   Coleção limpa. Reinserindo...\n');
    } else {
      // Upsert: atualiza pelo nomeCompleto
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
      console.log(`   Inseridos:   ${inseridos}`);
      console.log(`   Atualizados: ${atualizados}\n`);
      await mongoose.disconnect();
      return;
    }
  }

  await Policial.insertMany(policiais, { ordered: false });

  const total = await Policial.countDocuments();
  console.log(`✅ Seed concluído! Total no banco: ${total} policiais\n`);

  // Amostra
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
