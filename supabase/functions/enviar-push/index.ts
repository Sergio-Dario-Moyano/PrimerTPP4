// Supabase Edge Function: enviar-push
// La dispara un Database Webhook en cada INSERT de la tabla "notificaciones" y
// manda un Web Push a todos los dispositivos suscriptos de ese usuario,
// así la notificación llega aunque la app esté cerrada.
//
// Secretos necesarios (Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ej. mailto:admin@cinelanus.com)
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los provee Supabase automáticamente.

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

interface Notificacion {
  id: string;
  perfil_id: string;
  titulo: string;
  mensaje: string;
  link: string | null;
}

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@cinelanus.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!
);

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req) => {
  const { record } = (await req.json()) as { record: Notificacion };
  if (!record?.perfil_id) return new Response('sin destinatario', { status: 400 });

  const { data: suscripciones } = await supabase
    .from('push_suscripciones')
    .select('id, suscripcion')
    .eq('perfil_id', record.perfil_id);

  // Formato que entiende el service worker de Angular (ngsw)
  const url = record.link ?? '/';
  const payload = JSON.stringify({
    notification: {
      title: record.titulo,
      body: record.mensaje,
      icon: 'icons/icon-192x192.png',
      badge: 'icons/icon-72x72.png',
      tag: record.id,
      data: {
        url,
        onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url } }
      }
    }
  });

  let enviadas = 0;
  for (const s of suscripciones ?? []) {
    try {
      await webpush.sendNotification(s.suscripcion, payload);
      enviadas++;
    } catch (err) {
      // 404 / 410: el dispositivo dio de baja la suscripción → la borramos
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await supabase.from('push_suscripciones').delete().eq('id', s.id);
      } else {
        console.error('Error enviando push:', err);
      }
    }
  }

  return new Response(JSON.stringify({ enviadas }), { headers: { 'Content-Type': 'application/json' } });
});
