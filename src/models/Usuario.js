import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

export const PERFIS = ['admin', 'operador', 'visualizador'];

const usuarioSchema = new mongoose.Schema(
  {
    nomeUsuario: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
    },
    nome: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
    },
    senhaHash: {
      type: String,
      select: false,
    },
    perfil: {
      type: String,
      enum: PERFIS,
      default: 'operador',
    },
    ativo: {
      type: Boolean,
      default: true,
    },
    ultimoAcesso: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

usuarioSchema.methods.definirSenha = async function (senha) {
  this.senhaHash = await bcrypt.hash(senha, 12);
};

usuarioSchema.methods.verificarSenha = async function (senha) {
  if (!this.senhaHash) return false;
  return bcrypt.compare(senha, this.senhaHash);
};

const Usuario = mongoose.model('Usuario', usuarioSchema);

export default Usuario;