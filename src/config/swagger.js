const especificacaoSwagger = {
  openapi: '3.0.0',
  info: {
    title: 'Controle de Processos PM — 3º BPM',
    version: '1.1.0',
    description: `
API REST para controle de recebimento e acompanhamento de processos administrativos
do 3º Batalhão de Polícia Militar de Rondônia.

**Autenticação:**
- Login local: \`POST /auth/login\` com e-mail e senha
- Login Google: \`POST /auth/google\` com idToken do Google Sign-In
- Todos os demais endpoints exigem \`Authorization: Bearer <token>\`
    `.trim(),
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
          nrOrdem: { type: 'number', description: 'Número de ordem no CSV (antiquidade)' },
          postoGraduacao: { type: 'string' },
          nomeGuerra: { type: 'string' },
          nomeCompleto: { type: 'string' },
          funcao: { type: 'string' },
          unidade: { type: 'string', example: '1ª CIA PM' },
          subunidade: { type: 'string', example: '1º PEL PM' },
          localidade: { type: 'string', example: 'VILHENA' },
          ordemHierarquica: { type: 'number', description: 'Menor = maior posto' },
          matricula: { type: 'string' },
          ativo: { type: 'boolean' },
        },
      },
      Processo: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          numeroProtocolo: { type: 'string', example: 'PROC-2025-000001' },
          numeroSEI: { type: 'string', example: '0029.003587/2025-19' },
          policial: { $ref: '#/components/schemas/Policial' },
          tipoProcesso: {
            type: 'string',
            enum: [
              'FÉRIAS','LICENÇA PRÊMIO','LICENÇA MÉDICA','LICENÇA ESPECIAL',
              'PROMOÇÃO','TRANSFERÊNCIA','PENSÃO','REVISÃO SALARIAL',
              'INDENIZAÇÃO','SINDICÂNCIA','PAD','MEDALHA/ELOGIO','OUTROS',
            ],
          },
          dataRecebimento: { type: 'string', format: 'date' },
          dataPrazo: { type: 'string', format: 'date' },
          situacao: {
            type: 'string',
            enum: [
              'recebido','em_analise','pendente_documentacao',
              'aguardando_despacho','enviado_ao_setor','concluido','arquivado','devolvido',
            ],
          },
          documentos: {
            type: 'object',
            properties: {
              requerimento: { type: 'boolean' },
              documentoIdentificacao: { type: 'boolean' },
              boletimInterno: { type: 'boolean' },
              fichaFuncional: { type: 'boolean' },
              declaracaoNaoSancao: { type: 'boolean' },
              atestadoMedico: { type: 'boolean' },
              comprovanteResidencia: { type: 'boolean' },
              certidaoBeneficiario: { type: 'boolean' },
              procuracao: { type: 'boolean' },
              outrosDocumentos: { type: 'string' },
            },
          },
          observacoes: { type: 'string' },
          pendencias: { type: 'string' },
          historico: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                situacao: { type: 'string' },
                descricao: { type: 'string' },
                nomeUsuario: { type: 'string' },
                data: { type: 'string', format: 'date-time' },
              },
            },
          },
          arquivado: { type: 'boolean' },
        },
      },
      Erro: {
        type: 'object',
        properties: {
          sucesso: { type: 'boolean', example: false },
          erro: { type: 'string' },
          detalhes: { type: 'array', items: { type: 'object' } },
        },
      },
      RespostaPaginada: {
        type: 'object',
        properties: {
          sucesso: { type: 'boolean', example: true },
          dados: { type: 'array', items: {} },
          paginacao: {
            type: 'object',
            properties: {
              total: { type: 'number' },
              pagina: { type: 'number' },
              limite: { type: 'number' },
              totalPaginas: { type: 'number' },
            },
          },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/auth/login': {
      post: {
        summary: 'Login local (e-mail + senha)',
        tags: ['Autenticação'],
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'senha'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  senha: { type: 'string', minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Login bem-sucedido' },
          401: { description: 'Credenciais inválidas', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erro' } } } },
        },
      },
    },
    '/auth/google': {
      post: {
        summary: 'Login com Google OAuth',
        tags: ['Autenticação'],
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['idToken'], properties: { idToken: { type: 'string' } } } } },
        },
        responses: { 200: { description: 'Login bem-sucedido' } },
      },
    },
    '/auth/refresh': {
      post: {
        summary: 'Renovar access token',
        tags: ['Autenticação'],
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } } } },
        },
        responses: { 200: { description: 'Token renovado' } },
      },
    },
    '/auth/me': {
      get: {
        summary: 'Dados do usuário autenticado',
        tags: ['Autenticação'],
        responses: { 200: { description: 'Perfil do usuário logado' } },
      },
    },
    '/auth/senha': {
      patch: {
        summary: 'Alterar própria senha',
        tags: ['Autenticação'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['novaSenha'],
                properties: {
                  senhaAtual: { type: 'string' },
                  novaSenha: { type: 'string', minLength: 8 },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Senha atualizada' } },
      },
    },
    '/processos/relatorio-diario': {
      get: {
        summary: 'Relatório diário de processos',
        tags: ['Processos'],
        description: 'Lista processos recebidos em uma data, ordenados por hierarquia e antiguidade. Se nenhuma data informada, usa hoje.',
        parameters: [
          { name: 'data', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Data (YYYY-MM-DD). Padrão: hoje.' },
        ],
        responses: { 200: { description: 'Lista de processos do dia' } },
      },
    },
  },
};

export default especificacaoSwagger;
