import mongoose from 'mongoose';
import ambiente from './ambiente.js';

const conectarBancoDeDados = async () => {
  try {
    await mongoose.connect(ambiente.mongoUri);
    console.log(`[MongoDB] Conectado: ${ambiente.mongoUri}`);
  } catch (erro) {
    console.error('[MongoDB] Erro de conexão:', erro.message);
    process.exit(1);
  }
};

mongoose.connection.on('disconnected', () => {
  console.warn('[MongoDB] Desconectado');
});

mongoose.connection.on('reconnected', () => {
  console.log('[MongoDB] Reconectado');
});

export default conectarBancoDeDados;
