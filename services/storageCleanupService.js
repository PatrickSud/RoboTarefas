const { getSupabaseClient } = require('./supabaseClient')

const bucketName = process.env.SUPABASE_PRINTS_BUCKET || 'prints'

async function listFilesRecursively(supabase, path = '') {
  const { data, error } = await supabase.storage.from(bucketName).list(path, {
    limit: 1000,
    sortBy: { column: 'created_at', order: 'asc' }
  })

  if (error) throw error

  const files = []

  for (const item of data || []) {
    const itemPath = path ? `${path}/${item.name}` : item.name

    if (item.id) {
      files.push({ ...item, path: itemPath })
    } else {
      const nestedFiles = await listFilesRecursively(supabase, itemPath)
      files.push(...nestedFiles)
    }
  }

  return files
}

async function cleanupOldPrints(retentionDays = 30) {
  const supabase = getSupabaseClient()
  if (!supabase) return { removedCount: 0, removedFiles: [] }

  const cutoff = Date.now() - Number(retentionDays) * 24 * 60 * 60 * 1000
  const files = await listFilesRecursively(supabase)
  const oldFiles = files.filter(file => {
    const createdAt = file.created_at || file.updated_at || file.last_accessed_at
    return createdAt && new Date(createdAt).getTime() < cutoff
  })

  if (oldFiles.length === 0) {
    return { removedCount: 0, removedFiles: [] }
  }

  const paths = oldFiles.map(file => file.path)
  const { error } = await supabase.storage.from(bucketName).remove(paths)

  if (error) throw error

  return {
    removedCount: paths.length,
    removedFiles: paths
  }
}

module.exports = {
  cleanupOldPrints
}
