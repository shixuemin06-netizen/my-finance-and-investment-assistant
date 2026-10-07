import fs from 'node:fs';
import path from 'node:path';
export type DeliverySettings = { enabled: boolean; recipient: string; time: string; timezone: string; automationId: string; siteUrl: string };
/** Local owner settings never enter the public Site bundle. */
export function deliverySettings(): DeliverySettings | null {
  try {
    const value = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/automation-settings.json'), 'utf8'));
    if (typeof value.email?.recipient !== 'string' || typeof value.email?.enabled !== 'boolean') return null;
    return value.email;
  } catch { return null; }
}
