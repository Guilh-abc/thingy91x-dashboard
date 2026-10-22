// Worker com Cron Trigger (*/5): chama a avaliação dos alarmes. Segredo ALARMES_CRON_TOKEN só no Cloudflare.
export default {
  async scheduled(_e, env, ctx) {
    ctx.waitUntil(fetch('https://ntn-plataforma.pages.dev/api/alarmes/avaliar', { method: 'POST', headers: { 'X-Cron-Token': env.ALARMES_CRON_TOKEN } }).then((r) => console.log('avaliar', r.status)));
  },
  async fetch() { return new Response('alarmes-cron', { status: 200 }); }
};
