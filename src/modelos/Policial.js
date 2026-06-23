import mongoose from 'mongoose';

/**
 * Ordem hierárquica dos postos/graduações da PM.
 * Quanto MENOR o número, MAIOR a hierarquia.
 * Baseado na estrutura do CSV do 3º BPM.
 */
export const HIERARQUIA_PM = {
  // Oficiais Superiores
  'CEL QOPM': 1,
  'CEL QOAPM': 2,
  'TC QOPM': 3,
  'TC QOAPM': 4,
  'MAJ QOPM': 5,
  'MAJ QOAPM': 6,
  // Oficiais Intermediários
  'CAP QOPM': 7,
  'CAP QOAPM': 8,
  // Oficiais Subalternos
  '1º TEN QOPM': 9,
  '1º TEN QOAPM': 10,
  '2º TEN QOPM': 11,
  '2º TEN QOAPM': 12,
  'ASP OF QOPM': 13,
  'ASP OF QOAPM': 14,
  // Praças Especiais
  'ST QPPM': 15,
  // Subtenentes e Sargentos
  '1º SGT QPPM': 16,
  '2º SGT QPPM': 17,
  '3º SGT QPPM': 18,
  // Cabos e Soldados
  'CB QPPM': 19,
  'SD 2ª CL QPPM': 20,
  'SD 1ª CL QPPM': 21,
  // Genérico (caso apareça posto não mapeado)
  'OUTRO': 99,
};

/**
 * Retorna o valor de ordem hierárquica de um posto/graduação.
 * Faz busca aproximada para lidar com variações de escrita.
 */
export function obterOrdemHierarquica(postoGraduacao) {
  if (!postoGraduacao) return 99;

  const pg = postoGraduacao.trim().toUpperCase();

  // Busca exata
  if (HIERARQUIA_PM[pg] !== undefined) return HIERARQUIA_PM[pg];

  // Busca parcial (cobre variações como "1TEN" vs "1º TEN")
  for (const [chave, valor] of Object.entries(HIERARQUIA_PM)) {
    if (pg.includes(chave) || chave.includes(pg)) return valor;
  }

  return 99;
}

const esquemaPolicial = new mongoose.Schema(
  {
    nrOrdem: {
      type: Number,
      required: true,
    },
    postoGraduacao: {
      type: String,
      required: [true, 'Posto/Graduação é obrigatório'],
      trim: true,
    },
    nomeGuerra: {
      type: String,
      required: [true, 'Nome de guerra é obrigatório'],
      trim: true,
    },
    nomeCompleto: {
      type: String,
      required: [true, 'Nome completo é obrigatório'],
      trim: true,
    },
    funcao: {
      type: String,
      trim: true,
      default: 'OPERACIONAL',
    },
    /**
     * Unidade principal (ex: "1ª CIA PM")
     */
    unidade: {
      type: String,
      trim: true,
    },
    /**
     * Subunidade/pelotão (ex: "1º PEL PM")
     */
    subunidade: {
      type: String,
      trim: true,
      default: null,
    },
    /**
     * Localidade/município (ex: "VILHENA", "COLORADO DO OESTE")
     */
    localidade: {
      type: String,
      trim: true,
    },
    /**
     * Seção do CSV original (nome completo da seção)
     */
    secaoOrigem: {
      type: String,
      trim: true,
    },
    /**
     * Ordem hierárquica calculada automaticamente com base no postoGraduacao.
     * Menor = maior hierarquia. Usado para ordenar processos.
     */
    ordemHierarquica: {
      type: Number,
      default: 99,
    },
    /**
     * Matrícula (se disponível) - pode ser adicionada manualmente
     */
    matricula: {
      type: String,
      trim: true,
      default: null,
    },
    ativo: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Índices
esquemaPolicial.index({ nomeCompleto: 'text', nomeGuerra: 'text', postoGraduacao: 'text' });
esquemaPolicial.index({ ordemHierarquica: 1, nrOrdem: 1 });
esquemaPolicial.index({ unidade: 1 });
esquemaPolicial.index({ localidade: 1 });
esquemaPolicial.index({ matricula: 1 }, { sparse: true });

// Middleware: calcula ordemHierarquica automaticamente antes de salvar
esquemaPolicial.pre('save', function (next) {
  this.ordemHierarquica = obterOrdemHierarquica(this.postoGraduacao);
  next();
});

esquemaPolicial.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate();
  if (update.postoGraduacao) {
    update.ordemHierarquica = obterOrdemHierarquica(update.postoGraduacao);
  }
  next();
});

const Policial = mongoose.model('Policial', esquemaPolicial);

export default Policial;
