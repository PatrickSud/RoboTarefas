const { getSupabaseClient } = require('./supabaseClient')

let contasLocais = []

try {
  contasLocais = require('../config/accounts')
} catch (erro) {
  contasLocais = []
}

function mapearContaSupabase(conta) {
  return {
    id: conta.id,
    localKey: conta.local_key,
    nome: conta.name,
    telefone: conta.phone,
    senha: conta.password,
    recebeWhatsApp: conta.receives_whatsapp,
    plataforma: conta.platform,
    telefoneWhatsApp: conta.whatsapp_phone,
    email: conta.email,
    ativo: conta.active,
    testar: conta.test_mode
  }
}

async function buscarContasDoSupabase() {
  const supabase = getSupabaseClient()

  if (!supabase) {
    return null
  }

  const { data, error } = await supabase
    .from('accounts')
    .select(
      'id,local_key,name,phone,password,platform,whatsapp_phone,email,receives_whatsapp,active,test_mode,sort_order'
    )
    .eq('active', true)
    .order('sort_order', { ascending: true, nullsFirst: false })

  if (error) {
    console.error('Falha ao buscar contas no Supabase:', error.message)
    return null
  }

  return data.map(mapearContaSupabase)
}

async function buscarContasParaProcessar() {
  const contasSupabase = await buscarContasDoSupabase()
  const contas = contasSupabase || contasLocais

  const contasAtivas = contas.filter(conta => conta.ativo !== false)
  const contasDeTeste = contasAtivas.filter(conta => conta.testar === true)
  const contasParaProcessar =
    contasDeTeste.length > 0 ? contasDeTeste : contasAtivas

  return {
    contasParaProcessar,
    contasDeTeste
  }
}

module.exports = {
  buscarContasParaProcessar
}
