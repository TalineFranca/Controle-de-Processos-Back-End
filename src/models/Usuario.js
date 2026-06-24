import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

export const PERFIS = ['admin', 'operador', 'visualizador'];

const SALT_ROUNDS = 12;

const esquemaUsuario = new mongoose.Schema(
  {
    nomeUsuario: {
      type: String,
      required: [true, 'Nome de usuário é obrigatório'],
      unique: true,
      lowercase: true,
      trim: true,
      minlength: [3, 'Nome de usuário deve ter pelo menos 3 caracteres'],
    },
    nome: {
      type: String,
      required: [true, 'Nome é obrigatório'],
      trim: true,
    },
    senhaHash: {
      type: String,
      default: null,
      select: false,
    },
    perfil: {
      type: String,
      enum: { values: PERFIS, message: 'Perfil inválido: {VALUE}' },
      default: 'operador',
    },
    ativo: {
      type: Boolean,
      default: true,
    },
    ultimoAcesso: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

esquemaUsuario.index({ nomeUsuario: 1 }, { unique: true });

esquemaUsuario.methods.definirSenha = async function (senha) {
  this.senhaHash = await bcrypt.hash(senha, SALT_ROUNDS);
};

esquemaUsuario.methods.verificarSenha = async function (senha) {
  if (!this.senhaHash) return false;
  return bcrypt.compare(senha, this.senhaHash);
};

const Usuario = mongoose.model('Usuario', esquemaUsuario);

export default Usuario;