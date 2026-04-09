import fetch from 'node-fetch';

const url = 'http://localhost:3000/api/config';
const data = {
    nome_loja: "Nova Loja",
    telefone_loja: "987654321"
};

const updateConfig = async () => {
    try {
        const response = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`Erro na requisição: ${response.status}`);
        }

        const result = await response.json();
        console.log("Resposta do servidor:", result);
    } catch (error) {
        console.error("Erro ao testar PUT /api/config:", error);
    }
};

updateConfig();