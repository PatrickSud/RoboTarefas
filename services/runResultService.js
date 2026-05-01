const { getSupabaseClient } = require('./supabaseClient')

async function salvarResultadoConta(resultado) {
  try {
    const supabase = getSupabaseClient()

    if (!supabase) {
      return
    }

    const payload = {
      account_id: resultado.accountId || null,
      account_name: resultado.nome,
      platform: resultado.plataforma,
      phone: resultado.telefone,
      status: resultado.status,
      tasks_completed: resultado.tarefasConcluidas || 0,
      balance: resultado.saldo || null,
      error_message: resultado.erro || null,
      screenshot_path: resultado.caminhoPrint || null,
      executed_at: new Date().toISOString()
    }

    const { error } = await supabase.from('account_run_results').insert(payload)

    if (error) {
      console.error('Falha ao salvar resultado no Supabase:', error.message)
    }
  } catch (erro) {
    console.error(
      'Falha inesperada ao salvar resultado no Supabase:',
      erro.message
    )
  }
}

module.exports = {
  salvarResultadoConta
}
