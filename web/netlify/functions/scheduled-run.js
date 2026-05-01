const { createClient } = require('@supabase/supabase-js');

// Configuração do Supabase (Usando as variáveis já existentes no Netlify)
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Função auxiliar para chamar a nossa própria function de execução do robô
async function triggerRobotExecution(apiUrl, apiToken, instanceId) {
  // Chamamos o endpoint do Robô diretamente na AWS para evitar timeouts em cascata no Netlify
  // 1. Liga a instância
  const { EC2Client, StartInstancesCommand } = require('@aws-sdk/client-ec2');
  const ec2 = new EC2Client({
    region: process.env.MY_AWS_REGION || 'sa-east-1',
    credentials: {
      accessKeyId: process.env.MY_AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.MY_AWS_SECRET_ACCESS_KEY,
    },
  });
  
  console.log(`[Scheduled] Ligando instância ${instanceId}...`);
  await ec2.send(new StartInstancesCommand({ InstanceIds: [instanceId] }));

  // Aguarda 2 minutos para o boot e chama o run
  // Usamos um delay simples aqui pois Scheduled Functions podem rodar por mais tempo (até 15min)
  console.log("[Scheduled] Aguardando 2 minutos para boot...");
  await new Promise(r => setTimeout(r, 120000));

  console.log("[Scheduled] Disparando execução do robô...");
  const res = await fetch(`${apiUrl.replace(/\/$/, '')}/run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' }
  });
  
  return res.json();
}

export default async (req, context) => {
  const now = new Date();
  // Ajuste para o fuso horário de Brasília (UTC-3)
  const brasiliaHour = (now.getUTCHours() - 3 + 24) % 24;
  const todayStr = now.toISOString().split('T')[0];

  console.log(`[Scheduled] Verificando agendamento. Hora atual (Brasília): ${brasiliaHour}:00`);

  try {
    const { data: config, error } = await supabase
      .from('global_settings')
      .select('value')
      .eq('key', 'schedule')
      .single();

    if (error || !config) {
      console.error('[Scheduled] Erro ao carregar configurações:', error);
      return;
    }

    const { enabled, hour, last_run } = config.value;

    if (!enabled) {
      console.log('[Scheduled] Agendamento desativado.');
      return;
    }

    if (brasiliaHour !== hour) {
      console.log(`[Scheduled] Fora do horário agendado (${hour}:00).`);
      return;
    }

    if (last_run === todayStr) {
      console.log('[Scheduled] Robô já foi executado hoje.');
      return;
    }

    // Configurações da API
    const apiUrl = process.env.ROBOT_API_URL;
    const apiToken = process.env.ROBOT_API_TOKEN;
    const instanceId = process.env.AWS_INSTANCE_ID;

    console.log('[Scheduled] Iniciando execução agendada...');
    await triggerRobotExecution(apiUrl, apiToken, instanceId);

    // Atualiza o last_run para hoje
    await supabase
      .from('global_settings')
      .update({ value: { ...config.value, last_run: todayStr } })
      .eq('key', 'schedule');

    console.log('[Scheduled] Execução agendada concluída com sucesso.');

  } catch (err) {
    console.error('[Scheduled] Erro crítico na execução agendada:', err.message);
  }
};

// Configuração do Cron: roda todo início de hora
export const config = {
  schedule: "0 * * * *"
};
