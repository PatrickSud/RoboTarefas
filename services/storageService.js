const { createClient } = require('@supabase/supabase-js')

function getSupabaseStorageClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false }
    }
  )
}

async function uploadPrintToStorage(localPath, remoteName) {
  const supabase = getSupabaseStorageClient()
  const fs = require('fs')
  if (!fs.existsSync(localPath)) return null
  const fileBuffer = fs.readFileSync(localPath)
  const bucket = 'prints'
  const uploadPath = `${remoteName}`
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(uploadPath, fileBuffer, {
      upsert: true,
      contentType: 'image/png'
    })
  if (error) {
    console.error('Erro ao subir print para Supabase Storage:', error.message)
    return null
  }
  // Gera URL pública
  const { publicUrl } = supabase.storage
    .from(bucket)
    .getPublicUrl(uploadPath).data
  return publicUrl
}

module.exports = {
  uploadPrintToStorage
}
