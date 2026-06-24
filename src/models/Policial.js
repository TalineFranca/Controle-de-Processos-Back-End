import mongoose from 'mongoose';

const HIERARQUIA = [
  'CEL PM',
  'TEN CEL PM',
  'MAJ PM',
  'CAP PM',
  '1º TEN PM',
  '2º TEN PM',
  'ASP OF PM',
  'SUB TEN PM',
  '1º SGT PM',
  '2º SGT PM',
  '3º SGT PM',
  'CB PM',
  'SD PM',
];

export function obterOrdemHierarquica(posto) {
  const p = (posto || '').toUpperCase().trim();
  const idx = HIERARQUIA.findIndex((h) => p.includes(h));
  return idx === -1 ? 99 : idx;
}

const policialSchema = new mongoose.Schema(
  {
    nrOrdem: {
      type: Number,
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
policialSchema.index({ ordemHierarquica: 1, nrOrdem: 1 });

const Policial = mongoose.model('Policial', policialSchema);

export default Policial;