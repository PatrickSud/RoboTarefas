require('dotenv').config();

const contas = require('../config/accounts');
const { getSupabaseClient } = require('../services/supabaseClient');

function gerarLocalKey(conta) {
    return `${conta.plataforma || 'sem-plataforma'}:${conta.telefone || 'sem-telefone'}:${conta.nome || 'sem-nome'}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9:.-]/g, '-');
}

function mapearConta(conta) {
    return {
        local_key: gerarLocalKey(conta),
        name: conta.nome,
        phone: conta.telefone,
        password: conta.senha,
        platform: conta.plataforma,
        whatsapp_phone: conta.telefoneWhatsApp || null,
        email: conta.email || null,
        receives_whatsapp: conta.recebeWhatsApp !== false,
        active: conta.ativo !== false,
        test_mode: conta.testar === true,
        updated_at: new Date().toISOString()
    };
}

async function main() {
    const supabase = getSupabaseClient();

    if (!supabase) {
        throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar configurados no .env.');
    }

    const payload = contas.map(mapearConta);

    const { data, error } = await supabase
        .from('accounts')
        .upsert(payload, { onConflict: 'local_key' })
        .select('id,local_key,name,platform,phone');

    if (error) {
        throw error;
    }

    console.log(`Contas enviadas/atualizadas no Supabase: ${data.length}`);
    for (const conta of data) {
        console.log(`- ${conta.name} (${conta.platform})`);
    }
}

main().catch((erro) => {
    console.error('Falha ao migrar contas para o Supabase:', erro.message);
    process.exit(1);
});
