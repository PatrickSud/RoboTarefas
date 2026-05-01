require('dotenv').config()
const { buscarContasParaProcessar } = require('../services/accountService')

async function testarConexaoSupabase() {
  console.log('--- TESTE DE LEITURA SUPABASE ---')
  console.log(`URL: ${process.env.SUPABASE_URL}`)

  try {
    const { contasParaProcessar, contasDeTeste } =
      await buscarContasParaProcessar()

    console.log('\nSucesso na busca!')
    console.log(`Total de contas encontradas: ${contasParaProcessar.length}`)

    if (contasDeTeste.length > 0) {
      console.log(`Contas em modo teste: ${contasDeTeste.length}`)
    }

    console.log('\nLista de Contas:')
    contasParaProcessar.forEach((c, i) => {
      const origem = c.id ? 'DB (Supabase)' : 'Local (JS)'
      console.log(
        `${i + 1}. [${origem}] ${c.nome} - Plataforma: ${c.plataforma} - Ativo: ${c.ativo}`
      )
    })

    if (contasParaProcessar.length > 0 && contasParaProcessar[0].id) {
      console.log(
        '\n✅ TESTE CONCLUÍDO: O robô está lendo INTEGRADO ao Supabase.'
      )
    } else {
      console.log(
        '\n⚠️ TESTE CONCLUÍDO: O robô ainda está lendo do arquivo local. Verifique se as contas foram migradas e se o .env está correto.'
      )
    }
  } catch (error) {
    console.error('\n❌ ERRO NO TESTE:', error.message)
  }
}

testarConexaoSupabase()
