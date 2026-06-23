const especificacaoSwagger = {
  openapi: '3.0.0',
  info: {
    title: 'Controle de Processos PM - API',
    version: '1.0.0',
    description: 'API para controle de recebimento e acompanhamento de processos administrativos do 3º BPM',
  },
  servers: [
    { url: '/api/v1', description: 'Servidor principal' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      Policial: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          nrOrdem: { type: 'number' },
          postoGraduacao: { type: 'string' },
          nomeGuerra: { type: 'string' },
          nomeCompleto: { type: 'string' },
          funcao: { type: 'string' },
          unidade: { type: 'string' },
          subunidade: { type: 'string' },
          localidade: { type: 'string' },
          ordemHierarquica: { type: 'number' },
          ativo: { type: 'boolean' },
        },
      },
      Processo: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          numeroSEI: { type: 'string' },
          policial: { $ref: '#/components/schemas/Policial' },
          tipoProcesso: { type: 'string' },
          dataRecebimento: { type: 'string', format: 'date' },
          situacao: { type: 'string', enum: ['recebido', 'em_analise', 'pendente', 'concluido', 'arquivado'] },
          documentos: {
            type: 'object',
            description: 'Checklist de documentos',
          },
          observacoes: { type: 'string' },
          historico: {
            type: 'array',
            items: { type: 'object' },
          },
        },
      },
      Erro: {
        type: 'object',
        properties: {
          sucesso: { type: 'boolean', example: false },
          erro: { type: 'string' },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {},
};

export default especificacaoSwagger;
