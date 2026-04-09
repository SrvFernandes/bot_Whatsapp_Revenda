import sqlite3 from 'sqlite3';

const dbPath = './src/data/database.db';
const query = "SELECT * FROM configuracoes WHERE id = 1;";

(async () => {
    try {
        // Criar uma nova conexão com o banco de dados SQLite
        const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                throw new Error(`Erro ao conectar ao banco de dados: ${err.message}`);
            }
        });

        // Consultar se o registro com id = 1 existe na tabela configuracoes
        db.get(query, (err, row) => {
            if (err) {
                console.error("Erro ao executar a consulta:", err.message);
            } else if (row) {
                console.log("Registro com ID 1 encontrado:", row);
            } else {
                console.log("Registro com ID 1 não encontrado na tabela 'configuracoes'.");
            }
        });

        // Fechar a conexão
        db.close((err) => {
            if (err) {
                console.error("Erro ao fechar a conexão com o banco de dados:", err.message);
            } else {
                console.log("Conexão com o banco de dados encerrada.");
            }
        });
    } catch (error) {
        console.error(error.message);
    }
})();