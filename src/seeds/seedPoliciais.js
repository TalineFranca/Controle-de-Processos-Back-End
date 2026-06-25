/**
 * Seed: importa o efetivo do 3º BPM com UMA ÚNICA FONTE:
 *
 *  relatorioEfetivo_total.csv — define a ORDEM DE ANTIGUIDADE do batalhão
 *  inteiro (posição da linha = quem é mais antigo). É a única fonte de
 *  verdade usada agora; localidade/unidade NÃO é mais lida/atribuída aqui
 *  (fica para uma etapa futura).
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

// ─────────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────────

function lerBuffer(caminho) {
  const buffer = readFileSync(caminho);
  // Remove BOM UTF-8 se presente
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.slice(3).toString('utf-8');
  }
  try {
    const utf8 = buffer.toString('utf-8');
    if (!utf8.includes('\uFFFD')) return utf8;
  } catch (_) { /* fallthrough */ }
  return buffer.toString('latin1');
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─────────────────────────────────────────────
// LEITURA: relatorioEfetivo_total.csv
//   Colunas (separadas por vírgula): Posto/Graduação, Quadro, Nome, Nome de guerra
//   A ORDEM DAS LINHAS = ORDEM DE ANTIGUIDADE DO BATALHÃO.
// ─────────────────────────────────────────────

function lerAntiguidade(caminho) {
  const conteudo = lerBuffer(caminho);
  const linhas = conteudo.split('\n').map(l => l.split(',').map(c => c.replace(/^"|"$/g, '').trim()));

  const policiais = [];
  let ordem = 0;

  for (const cols of linhas) {
    const posto = (cols[0] || '').trim();
    if (!posto || posto.toLowerCase().includes('posto')) continue;

    const quadro       = (cols[1] || '').trim();
    const nomeCompleto = (cols[2] || '').trim();
    const nomeGuerra   = (cols[3] || '').trim();

    if (!nomeCompleto && !nomeGuerra) continue;

    ordem++;

    policiais.push({
      ordemBatalhao:    ordem,
      nrOrdem:          ordem, // hoje, nrOrdem = posição na antiguidade do batalhão
      postoGraduacao:   posto,
      quadro,
      nomeGuerra:       nomeGuerra || nomeCompleto,
      nomeCompleto,
      ordemHierarquica: obterOrdemHierarquica(posto),
      ativo:            true,
    });
  }

  return policiais;
}

// ─────────────────────────────────────────────
// EXECUÇÃO PRINCIPAL
// ─────────────────────────────────────────────

async function executarSeed() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/controle_processos_pm';

  console.log('\n🌱 Iniciando seed de policiais (somente antiguidade)...');
  console.log(`📄 Antiguidade : ${CSV_ANTIGUIDADE}`);
  console.log(`🗄️  MongoDB      : ${mongoUri}\n`);

  await mongoose.connect(mongoUri);
  console.log('[MongoDB] Conectado ✓\n');

  const policiais = lerAntiguidade(CSV_ANTIGUIDADE);
  console.log(` Relatório de antiguidade: ${policiais.length} policiais lidos\n`);

  let inseridos = 0;
  let atualizados = 0;

  for (const p of policiais) {
    // Chave composta (nomeCompleto + nomeGuerra): existem casos reais de dois
    // policiais diferentes com o MESMO nome completo (ex: "ALEXANDRE FERREIRA
    // DA SILVA" aparece 2x no relatório, com nomes de guerra diferentes). Usar
    // só nomeCompleto faria um sobrescrever o outro.
    const res = await Policial.updateOne(
      {
        nomeCompleto: { $regex: new RegExp('^' + escapeRegex(p.nomeCompleto) + '$', 'i') },
        nomeGuerra:   { $regex: new RegExp('^' + escapeRegex(p.nomeGuerra) + '$', 'i') },
      },
      {
        $set: p,
        // Limpa resquícios de localidade/unidade de seeds antigos (baseados no
        // efetivo.csv), já que por ora não estamos mais atribuindo isso.
        $unset: { localidade: '', secaoOrigem: '', cia: '', pel: '', gp: '' },
      },
      { upsert: true, setDefaultsOnInsert: false }
    );
    if (res.upsertedCount) inseridos++;
    else atualizados++;
  }

  console.log(`✅ Seed concluído!`);
  console.log(`   Inseridos  : ${inseridos}`);
  console.log(`   Atualizados: ${atualizados}`);
  console.log(`   Total      : ${policiais.length}`);

  // Aviso: policiais que existem no banco mas não vieram nesta leitura
  // (podem ser sobras de um seed antigo feito a partir do efetivo.csv)
  const nomesAtuais = new Set(policiais.map(p => p.nomeCompleto.toUpperCase()));
  const todosNoBanco = await Policial.find({}).select('nomeCompleto');
  const sobras = todosNoBanco.filter(p => !nomesAtuais.has((p.nomeCompleto || '').toUpperCase()));
  if (sobras.length > 0) {
    console.warn(`\n⚠ ${sobras.length} policial(is) no banco NÃO estão no relatorioEfetivo_total.csv (sobra de seed antigo):`);
    sobras.forEach(p => console.warn(`   - ${p.nomeCompleto}`));
    console.warn('   Eles não foram apagados automaticamente. Revise manualmente se quiser removê-los.\n');
  }

  // Amostra
  console.log('\n📋 Amostra (primeiros 10 por antiguidade):');
  const amostra = await Policial.find({}).sort({ ordemBatalhao: 1 }).limit(10);
  amostra.forEach(p =>
    console.log(`   [${p.ordemBatalhao}] ${p.postoGraduacao} ${p.nomeGuerra}`)
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