import mongoose from 'mongoose';

// Índice do posto/graduação — usado apenas para filtros e exibição
const HIERARQUIA_PREFIXOS = [
  { prefixo: 'CEL',     ordem: 0  },
  { prefixo: 'TC',      ordem: 1  },
  { prefixo: 'TEN CEL', ordem: 1  },
  { prefixo: 'MAJ',     ordem: 2  },
  { prefixo: 'CAP',     ordem: 3  },
  { prefixo: '1º TEN',  ordem: 4  },
  { prefixo: '1 TEN',   ordem: 4  },
  { prefixo: '2º TEN',  ordem: 5  },
  { prefixo: '2 TEN',   ordem: 5  },
  { prefixo: 'ASP',     ordem: 6  },
  { prefixo: 'ST',      ordem: 7  },
  { prefixo: 'SUB TEN', ordem: 7  },
  { prefixo: '1º SGT',  ordem: 8  },
  { prefixo: '1 SGT',   ordem: 8  },
  { prefixo: '2º SGT',  ordem: 9  },
  { prefixo: '2 SGT',   ordem: 9  },
  { prefixo: '3º SGT',  ordem: 10 },
  { prefixo: '3 SGT',   ordem: 10 },
  { prefixo: 'CB',      ordem: 11 },
  { prefixo: 'SD',      ordem: 12 },
];

export function obterOrdemHierarquica(posto) {
  const p = (posto || '').toUpperCase().trim();
  for (const { prefixo, ordem } of HIERARQUIA_PREFIXOS) {
    if (p.startsWith(prefixo)) return ordem;
  }
  return 99;
}

const policialSchema = new mongoose.Schema(
  {
    nrOrdem: {
      type: Number,
    },
    ordemBatalhao: {
      type: Number,
      default: 9999,
    },
    postoGraduacao: {
      type: String,
      required: true,
      trim: true,
    },
    nomeGuerra: {
      type: String,
      required: true,
      trim: true,
    },
    nomeCompleto: {
      type: String,
      required: true,
      trim: true,
    },
    matricula: {
      type: String,
      trim: true,
      sparse: true,
    },
    funcao: {
      type: String,
      trim: true,
      default: 'OPERACIONAL',
    },
    unidade: {
      type: String,
      trim: true,
    },
    subunidade: {
      type: String,
      trim: true,
      default: null,
    },
    localidade: {
      type: String,
      trim: true,
      default: 'VILHENA',
    },
    secaoOrigem: {
      type: String,
      trim: true,
    },
    ordemHierarquica: {
      type: Number,
      default: 99,
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

policialSchema.index({ nomeCompleto: 1 });
policialSchema.index({ ordemBatalhao: 1 });
policialSchema.index({ ordemHierarquica: 1, nrOrdem: 1 });

const Policial = mongoose.model('Policial', policialSchema);

export default Policial;