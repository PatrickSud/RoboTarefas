exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ ok: false, message: 'Método não permitido.' })
    }
  }

  const apiUrl = process.env.ROBOT_API_URL
  const apiToken = process.env.ROBOT_API_TOKEN

  if (!apiUrl || !apiToken) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, message: 'API do robô não configurada.' })
    }
  }

  try {
    const response = await fetch(`${apiUrl.replace(/\/$/, '')}/run`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    })

    const payload = await response.json()

    return {
      statusCode: response.status,
      body: JSON.stringify(payload)
    }
  } catch (error) {
    return {
      statusCode: 502,
      body: JSON.stringify({ ok: false, message: `Falha ao conectar com a AWS: ${error.message}` })
    }
  }
}
