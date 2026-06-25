/**
 * Seed: importa o efetivo do 3º BPM com DUAS fontes:
 *
 *  1. relatorioEfetivo_total.csv  — define a ORDEM DE ANTIGUIDADE do batalhão
 *     (posição da linha = quem é mais antigo, independente de localidade)
 *
 *  2. efetivo.csv (mapa da força)  — define a LOCALIDADE, SEÇÃO, CIA, PEL, GP
 *
 * Uso:
 *   npm run seed
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

import Policial, { obterOrdemHierarquica } from '../models/Policial.js';
import Usuario from '../models/Usuario.js';

const CSV_ANTIGUIDADE = process.env.CSV_ANTIGUIDADE || resolve(__dirname, '../../data/relatorioEfetivo_total.csv');
const CSV_MAPA        = process.env.CSV_MAPA        || resolve(__dirname, '../../data/efetivo.csv');

// ─────────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────────

function lerBuffer(caminho) {
  const buffer = readFileSync(caminho);
  // Remove BOM UTF-8 se presente
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.slice(3).toString('utf-8');
  }
  // Tenta UTF-8 primeiro (efetivo.csv é UTF-8)
  try {
    const utf8 = buffer.toString('utf-8');
    // Verifica se tem caracteres de substituição inválidos (indica que NÃO é UTF-8)
    if (!utf8.includes('\uFFFD')) return utf8;
  } catch (_) { /* fallthrough */ }
  // Fallback latin1 (relatorioEfetivo_total.csv é latin1)
  return buffer.toString('latin1');
}

function norm(s) {
  return (s || '')
    .replace(/\u00a0/g, ' ')   // non-breaking space → espaço normal
    .replace(/\u00c2\u00a0/g, ' ') // Â\xa0 (double-encoded NBSP) → espaço
    .toUpperCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─────────────────────────────────────────────
// FONTE 1: relatorioEfetivo_total.csv
// ─────────────────────────────────────────────

function lerAntiguidade(caminho) {
  const conteudo = lerBuffer(caminho);
  const linhas = conteudo.split('\n').map(l => l.split(';').map(c => c.trim()));

  const mapa = new Map();
  let ordem = 0;

  for (const cols of linhas) {
    if (!cols[0] || cols[0].toLowerCase().includes('posto') || cols[0] === '') continue;

    ordem++;
    const posto        = cols[0] || '';
    const nomeCompleto = cols[2] || '';
    const nomeGuerra   = cols[3] || '';
    // Unidade completa do relatório (ex: "PM / ... / 3º BPM / 4º CIA PM / 2º PEL PM")
    const unidadeTotal = cols[6] || '';

    // Extrai CIA / PEL / GP da string de unidade do relatório total
    const { cia, pel, gp } = extrairSubunidades(unidadeTotal, '/');

    const entrada = { ordem, posto, nomeCompleto, nomeGuerra, unidadeTotal, cia, pel, gp };

    if (nomeGuerra)   mapa.set(norm(nomeGuerra), entrada);
    if (nomeCompleto) mapa.set(norm(nomeCompleto), entrada);
  }

  return mapa;
}

// ─────────────────────────────────────────────
// EXTRAÇÃO DE CIA / PEL / GP
// ─────────────────────────────────────────────

function extrairSubunidades(texto, sep) {
  const partes = (texto || '').split(sep).map(p => p.trim());
  let cia = '', pel = '', gp = '';
  for (const p of partes) {
    if (/CIA PM/i.test(p) && !cia) cia = p;
    if (/PEL PM/i.test(p) && !pel) pel = p;
    if (/GP P[MO]/i.test(p) && !gp) gp = p;
  }
  return { cia, pel, gp };
}

// ─────────────────────────────────────────────
// FONTE 2: efetivo.csv (mapa da força)
// ─────────────────────────────────────────────

function extrairLocalidade(nomeSec) {
  const match = nomeSec.match(/\(([^)]+)\)/);
  if (!match) return 'VILHENA';
  let loc = match[1].trim().toUpperCase()
    .replace('TRANSITO-VILHENA', 'TRÂNSITO-VILHENA')
    .replace('TRANÂSITO-VILHENA', 'TRÂNSITO-VILHENA')
    .replace('GUAPORÃ', 'GUAPORÉ')
    .replace('BOA ESPERANÃA', 'BOA ESPERANÇA')
    .replace('PIMENTEIRAS DO OSTE', 'PIMENTEIRAS DO OESTE');
  return loc;
}

function ehCabecalhoSecao(cols) {
  const c0 = (cols[0] || '').trim();
  if (!c0) return false;
  if (/^NR\.?\s*ORDEM$/i.test(c0)) return false;
  if (/^\d+$/.test(c0)) return false;
  // Ignora linhas de rodapé/assinatura (sem padrão de seção operacional)
  // Seções válidas contêm '/' ou palavras como BPM, CIA, PEL, GP, GAB, ESTADO MAIOR, FORMAÇÃO, PCSv
  if (!/[/]|BPM|CIA|PEL|\bGP\b|GAB|ESTADO\s+MAIOR|FORMA[ÇC]|PCSv|SANIT/i.test(c0)) return false;
  return /[a-zA-ZÀ-ÿ]/.test(c0);
}

function lerMapaForca(caminho) {
  const conteudo = lerBuffer(caminho);
  const linhas = conteudo.split('\n').map(l => l.split(',').map(c => c.replace(/^"|"$/g, '').trim()));

  const policiais = [];
  let secaoAtual     = 'GAB COMANDO/3º BPM (VILHENA)';
  let localidadeAtual = 'VILHENA';

  for (const cols of linhas) {
    if (ehCabecalhoSecao(cols)) {
      secaoAtual      = cols[0].trim();
      localidadeAtual = extrairLocalidade(secaoAtual);
      continue;
    }

    if (!/^\d+$/.test((cols[0] || '').trim())) continue;

    const nrOrdem      = parseInt(cols[0], 10);
    const postoMapa    = (cols[1] || '').trim();
    const nomeGuerra   = (cols[2] || '').trim();
    const nomeCompleto = (cols[3] || '').trim();
    const funcao       = (cols[4] || 'OPERACIONAL').trim() || 'OPERACIONAL';

    if (!nomeCompleto && !nomeGuerra) continue;

    // Extrai CIA/PEL/GP do cabeçalho da seção (ex: "3º GP/1º PEL/2ª CIA/3º BPM (CHUPINGUAIA)")
    const { cia, pel, gp } = extrairSubunidades(secaoAtual, '/');

    policiais.push({
      nrOrdem,
      postoMapa,
      nomeGuerra,
      nomeCompleto,
      funcao,
      secaoOrigem: secaoAtual,
      localidade: localidadeAtual,
      cia,
      pel,
      gp,
    });
  }

  return policiais;
}

// ─────────────────────────────────────────────
// CRUZAMENTO
// ─────────────────────────────────────────────

function cruzarDados(mapaForca, mapaAntiguidade) {
  const resultado = [];
  const nomesNaForca = new Set();
  let semCorrespondencia = 0;

  for (const pol of mapaForca) {
    const dadosAnt =
      mapaAntiguidade.get(norm(pol.nomeGuerra)) ||
      mapaAntiguidade.get(norm(pol.nomeCompleto));

    if (!dadosAnt) {
      semCorrespondencia++;
      console.warn(`  ⚠ Sem antiguidade: ${pol.nomeGuerra} / ${pol.nomeCompleto} (${pol.secaoOrigem.slice(0, 50)})`);
    }

    const postoFinal = dadosAnt?.posto || pol.postoMapa;
    const nomeCompletoFinal = dadosAnt?.nomeCompleto || pol.nomeCompleto;

    nomesNaForca.add(norm(nomeCompletoFinal));
    if (dadosAnt?.nomeGuerra) nomesNaForca.add(norm(dadosAnt.nomeGuerra));

    // CIA/PEL/GP: prioriza relatório total (tem dados mais limpos), fallback mapa da força
    const ciaFinal = dadosAnt?.cia || pol.cia;
    const pelFinal = dadosAnt?.pel || pol.pel;
    const gpFinal  = dadosAnt?.gp  || pol.gp;

    resultado.push({
      nrOrdem:          pol.nrOrdem,
      postoGraduacao:   postoFinal,
      nomeGuerra:       dadosAnt?.nomeGuerra || pol.nomeGuerra,
      nomeCompleto:     nomeCompletoFinal,
      funcao:           pol.funcao,
      localidade:       pol.localidade,
      secaoOrigem:      pol.secaoOrigem,
      cia:              ciaFinal,
      pel:              pelFinal,
      gp:               gpFinal,
      ordemBatalhao:    dadosAnt?.ordem ?? 9999,
      ordemHierarquica: obterOrdemHierarquica(postoFinal),
      ativo: true,
    });
  }

  if (semCorrespondencia > 0) {
    console.warn(`\n  ⚠ ${semCorrespondencia} policiais sem correspondência no relatório.\n`);
  }

  return { resultado, nomesNaForca };
}

// ─────────────────────────────────────────────
// EXECUÇÃO PRINCIPAL
// ─────────────────────────────────────────────

async function executarSeed() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/controle_processos_pm';

  console.log('\n🌱 Iniciando seed de policiais...');
  console.log(`📄 Antiguidade : ${CSV_ANTIGUIDADE}`);
  console.log(`📄 Mapa da força: ${CSV_MAPA}`);
  console.log(`🗄️  MongoDB      : ${mongoUri}\n`);

  await mongoose.connect(mongoUri);
  console.log('[MongoDB] Conectado ✓\n');

  const mapaAntiguidade = lerAntiguidade(CSV_ANTIGUIDADE);
  console.log(` Relatório de antiguidade: ${mapaAntiguidade.size / 2} policiais indexados`);

  const mapaForca = lerMapaForca(CSV_MAPA);
  console.log(` Mapa da força: ${mapaForca.length} policiais encontrados\n`);

  const { resultado: policiais, nomesNaForca } = cruzarDados(mapaForca, mapaAntiguidade);

  let inseridos = 0;
  let atualizados = 0;

  for (const p of policiais) {
    const res = await Policial.updateOne(
      { nomeCompleto: { $regex: new RegExp('^' + p.nomeCompleto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') } },
      { $set: p },
      { upsert: true }
    );
    if (res.upsertedCount) inseridos++;
    else atualizados++;
  }

  console.log(`✅ Seed concluído!`);
  console.log(`   Inseridos  : ${inseridos}`);
  console.log(`   Atualizados: ${atualizados}`);

  // Amostra
  console.log('\n📋 Amostra (primeiros 10 por antiguidade):');
  const amostra = await Policial.find({}).sort({ ordemBatalhao: 1 }).limit(10);
  amostra.forEach(p =>
    console.log(`   [${p.ordemBatalhao}] ${p.postoGraduacao} ${p.nomeGuerra} — ${p.localidade} ${p.cia} ${p.pel} ${p.gp}`)
  );

  // Usuário padrão
  const usuarioExistente = await Usuario.findOne({ nomeUsuario: 'usuario.padrao' });
  if (!usuarioExistente) {
    const admin = new Usuario({
      nomeUsuario: 'usuario.padrao',
      nome: 'Administrador',
      perfil: 'admin',
      ativo: true,
    });
    await admin.definirSenha('Bpm2026@');
    await admin.save();
    console.log('\n👤 Usuário padrão criado: usuario.padrao / Bpm2026@');
  }

  await mongoose.disconnect();
  console.log('\n[MongoDB] Desconectado. Seed finalizado.\n');
}

executarSeed().catch((erro) => {
  console.error('❌ Erro no seed:', erro);
  process.exit(1);
});
