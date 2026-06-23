import app from './app.js';
import ambiente from './config/ambiente.js';
import conectarBancoDeDados from './config/bancoDeDados.js';

const iniciar = async () => {
  await conectarBancoDeDados();

  const servidor = app.listen(ambiente.porta, () => {
    console.log(`\n🚔 Controle de Processos PM - 3º BPM`);
    console.log(`🌐 Servidor: http://localhost:${ambiente.porta}`);
    console.log(`📋 Docs:     http://localhost:${ambiente.porta}/api-docs`);
    console.log(`🔑 Ambiente: ${ambiente.nodeEnv}\n`);
  });

  // Graceful shutdown
  const encerrar = async (sinal) => {
    console.log(`\n[${sinal}] Encerrando servidor...`);
    servidor.close(async () => {
      const mongoose = (await import('mongoose')).default;
      await mongoose.disconnect();
      console.log('[MongoDB] Desconectado. Servidor encerrado.\n');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => encerrar('SIGTERM'));
  process.on('SIGINT', () => encerrar('SIGINT'));
};

iniciar().catch((erro) => {
  console.error('Erro fatal ao iniciar:', erro);
  process.exit(1);
});
