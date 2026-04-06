# Revenda Auto - Chatbot WhatsApp

## Estrutura do Projeto
```
bot-revenda-veiculos/
├── src/
│   ├── agents/
│   │   ├── agenteCadastro.js    # Cadastro de veículos
│   │   ├── agenteConsulta.js    # Busca e consulta
│   │   └── agenteRecomendacao.js # Recomendações
│   ├── database/
│   │   └── db.js                 # Banco SQLite
│   ├── whatsapp/
│   │   └── socket.js             # Conexão WhatsApp
│   └── index.js                  # Entrada principal
├── data/                         # Dados e autenticação
├── package.json
└── README.md
```

## Instalação
```bash
npm install
```

## Execução
```bash
npm start
```

Escaneie o QR Code com seu WhatsApp.

## Funcionalidades
- Listar veículos disponíveis
- Buscar por marca/modelo/ano
- Ver detalhes do veículo
- Recomendações se veículo indisponível
- Cadastro de novos veículos
- Falar com atendente

## Menu
1. Ver veículos disponíveis
2. Buscar veículo específico  
3. Falar com atendente
4. Cadastrar veículo (venda)