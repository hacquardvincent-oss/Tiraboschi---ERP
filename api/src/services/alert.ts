/**
 * Alerte sortante (Slack / Discord / webhook générique).
 * Si ALERT_WEBHOOK_URL est défini, on POST un message JSON `{ text }` (format compatible
 * Slack et Discord). Sinon, dégradation propre : log seulement. Jamais bloquant.
 */
export async function sendAlert(message: string): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) {
    console.warn('[alert] (webhook non configuré) ' + message);
    return;
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message, content: message }),
    });
    if (!res.ok) {
      console.error(`[alert] échec webhook (${res.status})`);
    }
  } catch (err) {
    console.error('[alert] erreur webhook :', (err as Error).message);
  }
}
