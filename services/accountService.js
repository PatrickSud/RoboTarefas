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
    testar: conta.test_mode,
    schedules: conta.schedules || []
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
      'id,local_key,name,phone,password,platform,whatsapp_phone,email,receives_whatsapp,active,test_mode,sort_order,schedules'
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
  
  let contasParaProcessar = []

  if (contasDeTeste.length > 0) {
    contasParaProcessar = contasDeTeste
  } else {
    const isManualRun = process.env.IS_MANUAL_RUN === 'true'
    
    if (isManualRun) {
      contasParaProcessar = contasAtivas
    } else {
      // Pega a hora atual do servidor de Brasília
      const dateSP = new Intl.DateTimeFormat('pt-BR', { 
        timeZone: 'America/Sao_Paulo', 
        hour: 'numeric',
        hourCycle: 'h23'
      }).format(new Date())
      
      const currentHour = parseInt(dateSP, 10)
      console.log(`Verificando agendamentos para a hora: ${currentHour}:00 (Brasília)`)

      contasParaProcessar = contasAtivas.filter(conta => {
        // Se a conta não tem horários definidos, vamos considerar que ela roda apenas se for manual?
        // Ou devemos considerá-la 'sempre roda' para não quebrar compatibilidade?
        // O usuário pediu "todas as contas habilitadas para aquele horário executará".
        // Portanto, se não tiver no array, não roda.
        const schedules = conta.schedules || []
        return schedules.includes(currentHour)
      })
    }
  }

  return {
    contasParaProcessar,
    contasDeTeste
  }
}

module.exports = {
  buscarContasParaProcessar
}
