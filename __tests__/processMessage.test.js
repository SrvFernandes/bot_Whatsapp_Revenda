import { jest } from '@jest/globals';
import { strict as assert } from 'assert';
import { getDB, initDatabase, getConfig } from '../src/database/db.js';
import { processMessage } from '../src/server.js';

describe('Pesquisa de Satisfação', () => {
   beforeEach(async () => {
     await initDatabase();
     const db = getDB();
     db.run(`DELETE FROM pesquisas`);
   });

  it('Deve enviar a mensagem de avaliação ao final de uma interação', async () => {
    const sockMock = { sendMessage: jest.fn() };
    const from = '5511999999999';
    const text = 'Oi';
    await processMessage(sockMock, from, text);

    const sentMessages = sockMock.sendMessage.mock.calls;
    assert(sentMessages.some(msg => msg[1].text === 'De 1 a 5, como você avalia nosso atendimento?'));
  });

  it('Deve registrar a nota de avaliação no banco de dados', () => {
    const result = getDB().exec('SELECT * FROM pesquisas WHERE nota = 5');

    expect(result.length).toBeGreaterThan(0);
  });
});