/**
 * Seed: importa o efetivo do 3º BPM com DUAS fontes:
 *
 *  1. relatorioEfetivo_total.csv  — define a ORDEM DE ANTIGUIDADE do batalhão
 *     (posição da linha = quem é mais antigo, independente de localidade)
 *
 *  2. efetivo.csv (mapa da força)  — define a LOCALIDADE e SEÇÃO de cada policial
 *     (ex: "3º GP/1º PEL/2ª CIA/3º BPM (CHUPINGUAIA)")
 *
 * O cruzamento é feito por nome de guerra e nome completo (normalizado,
 * sem acentos, maiúsculas) para tolerar diferenças de encoding entre os arquivos.
 *
 * Campos salvos no banco:
 *   - ordemBatalhao   → posição no relatório total (1 = mais antigo do batalhão)
 *   - ordemHierarquica → índice do posto (0=TC, 1=MAJ... 11=CB, 12=SD) — mantido para filtros
 *   - nrOrdem          → número de ordem dentro da localidade (do mapa da força)
 *   - localidade       → cidade/seção (ex: "CHUPINGUAIA", "TRÂNSITO-VILHENA")
 *   - secaoOrigem      → seção completa do mapa da força
 *
 * Ordenação na fila de chegada (controlador.js):
 *   dataRecebimento ASC → ordemBatalhao ASC
 *
 * Uso:
 *   npm run seed
 *   CSV_ANTIGUIDADE=data/relatorioEfetivo_total.csv CSV_MAPA=data/efetivo.csv npm run seed
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
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.slice(3).toString('utf-8');
  }
  const tentativaUTF8 = buffer.toString('utf-8');
  if (tentativaUTF8.includes('\uFFFD')) return buffer.toString('latin1');
  return tentativaUTF8;
}

// Normaliza string para comparação: remove acentos, maiúsculas, espaços extras
function norm(s) {
  return (s || '')
    .toUpperCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // remove diacríticos
    .replace(/\s+/g, ' ');
}

// ─────────────────────────────────────────────
// FONTE 1: relatorioEfetivo_total.csv
// Delimitador: ponto-e-vírgula
// Colunas: Posto/Grad ; Quadro ; Nome ; Nome de guerra ; Dt Inclusão ; Dt Promoção ; Unidade
// A POSIÇÃO DA LINHA (1-based, pulando cabeçalhos) = ordem de antiguidade do batalhão
// ─────────────────────────────────────────────

function lerAntiguidade(caminho) {
  const conteudo = lerBuffer(caminho);
  const linhas = conteudo.split('\n').map(l => l.split(';').map(c => c.trim()));

  const mapa = new Map(); // chave normalizada → { ordem, posto, nomeCompleto, nomeGuerra }

  let ordem = 0;
  for (const cols of linhas) {
    // Pula linhas vazias e cabeçalho
    if (!cols[0] || cols[0].toLowerCase().includes('posto') || cols[0] === '') continue;

    ordem++;
    const posto       = cols[0] || '';
    const nomeCompleto = cols[2] || '';
    const nomeGuerra  = cols[3] || '';

    const entrada = { ordem, posto, nomeCompleto, nomeGuerra };

    // Indexa tanto por nome de guerra quanto nome completo para maximizar o cruzamento
    if (nomeGuerra)   mapa.set(norm(nomeGuerra), entrada);
    if (nomeCompleto) mapa.set(norm(nomeCompleto), entrada);
  }

  return mapa;
}

// ─────────────────────────────────────────────
// FONTE 2: efetivo.csv (mapa da força)
// Delimitador: vírgula
// Colunas: NR.ORDEM , POSTO/GRAD , NOME DE GUERRA , NOME COMPLETO , FUNÇÃO
// Os cabeçalhos de seção identificam localidade e unidade
// ─────────────────────────────────────────────

function extrairLocalidade(nomeSec) {
  // Pega o conteúdo entre parênteses: "3º GP/2º PEL/4ª CIA/3º BPM (PIMENTEIRAS DO OESTE)"
  // → "PIMENTEIRAS DO OESTE"
  const match = nomeSec.match(/\(([^)]+)\)/);
  if (!match) return 'VILHENA';
  let loc = match[1].trim().toUpperCase();
  // Casos especiais de variação de nome
  loc = loc.replace('TRANÂSITO-VILHENA', 'TRÂNSITO-VILHENA');
  loc = loc.replace('GUAPORÃ', 'GUAPORÉ');
  loc = loc.replace('BOA ESPERANÃA', 'BOA ESPERANÇA');
  loc = loc.replace('PIMENTEIRAS DO OSTE', 'PIMENTEIRAS DO OESTE');
  return loc;
}

function ehCabecalhoSecao(cols) {
  const c0 = (cols[0] || '').trim();
  if (!c0) return false;
  if (/^NR\.?\s*ORDEM$/i.test(c0)) return false;
  if (/^\d+$/.test(c0)) return false;
  return /[a-zA-ZÀ-ÿ]/.test(c0);
}

function lerMapaForca(caminho) {
  const conteudo = lerBuffer(caminho);
  const linhas = conteudo.split('\n').map(l => l.split(',').map(c => c.replace(/^"|"$/g, '').trim()));

  const policiais = [];
  let secaoAtual    = 'GAB COMANDO/3º BPM (VILHENA)';
  let localidadeAtual = 'VILHENA';

  for (const cols of linhas) {
    if (ehCabecalhoSecao(cols)) {
      secaoAtual    = cols[0].trim();
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

    policiais.push({
      nrOrdem,
      postoMapa,
      nomeGuerra,
      nomeCompleto,
      funcao,
      secaoOrigem: secaoAtual,
      localidade: localidadeAtual,
    });
  }

  return policiais;
}

// ─────────────────────────────────────────────
// CRUZAMENTO: mapa da força + antiguidade
// ─────────────────────────────────────────────

function cruzarDados(mapaForca, mapaAntiguidade) {
  const resultado = [];
  let semCorrespondencia = 0;

  for (const pol of mapaForca) {
    // Tenta encontrar por nome de guerra primeiro, depois por nome completo
    const dadosAnt =
      mapaAntiguidade.get(norm(pol.nomeGuerra)) ||
      mapaAntiguidade.get(norm(pol.nomeCompleto));

    if (!dadosAnt) {
      semCorrespondencia++;
      console.warn(`  ⚠ Sem antiguidade: ${pol.nomeGuerra} / ${pol.nomeCompleto} (${pol.secaoOrigem.slice(0, 40)})`);
    }

    // Posto vem do relatório de antiguidade quando disponível (mais confiável)
    // Fallback: posto do mapa da força
    const postoFinal = dadosAnt?.posto || pol.postoMapa;

    resultado.push({
      nrOrdem:          pol.nrOrdem,
      postoGraduacao:   postoFinal,
      nomeGuerra:       dadosAnt?.nomeGuerra || pol.nomeGuerra,
      nomeCompleto:     dadosAnt?.nomeCompleto || pol.nomeCompleto,
      funcao:           pol.funcao,
      localidade:       pol.localidade,
      secaoOrigem:      pol.secaoOrigem,
      // Ordem de antiguidade do BATALHÃO INTEIRO (1 = mais antigo)
      // Se não encontrou no relatório, vai para o final (9999)
      ordemBatalhao:    dadosAnt?.ordem ?? 9999,
      // Índice do posto — mantido para compatibilidade com filtros existentes
      ordemHierarquica: obterOrdemHierarquica(postoFinal),
      ativo: true,
    });
  }

  if (semCorrespondencia > 0) {
    console.warn(`\n  ⚠ ${semCorrespondencia} policiais sem correspondência no relatório de antiguidade.`);
    console.warn('    Eles serão cadastrados com ordemBatalhao=9999 (aparecerão por último na fila).\n');
  }

  return resultado;
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

  // Lê as duas fontes
  const mapaAntiguidade = lerAntiguidade(CSV_ANTIGUIDADE);
  console.log(` Relatório de antiguidade: ${mapaAntiguidade.size / 2} policiais indexados`);

  const mapaForca = lerMapaForca(CSV_MAPA);
  console.log(` Mapa da força: ${mapaForca.length} policiais encontrados\n`);

  // Cruza os dados
  const policiais = cruzarDados(mapaForca, mapaAntiguidade);

  // Upsert: atualiza pelo nomeCompleto normalizado
  let inseridos = 0;
  let atualizados = 0;

  for (const p of policiais) {
    const resultado = await Policial.updateOne(
      // Busca por nomeCompleto ignorando acentos (normalizado)
      { nomeCompleto: { $regex: new RegExp('^' + p.nomeCompleto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') } },
      { $set: p },
      { upsert: true }
    );
    if (resultado.upsertedCount) inseridos++;
    else atualizados++;
  }

  console.log(`\n✅ Seed concluído!`);
  console.log(`   Inseridos  : ${inseridos}`);
  console.log(`   Atualizados: ${atualizados}`);

  // Amostra dos primeiros por antiguidade
  console.log('\n📋 Amostra (primeiros 10 por antiguidade do batalhão):');
  const amostra = await Policial.find({}).sort({ ordemBatalhao: 1 }).limit(10);
  amostra.forEach(p =>
    console.log(`   [${p.ordemBatalhao}] ${p.postoGraduacao} ${p.nomeGuerra} — ${p.localidade}`)
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