/**
 * SSRF 防护：收件箱/抓取器的 URL 校验。
 * 只允许 http/https；解析 DNS 后拒绝回环 / 私有 / 链路本地地址。
 */
import dns from 'dns';
import { promisify } from 'util';

const lookup = promisify(dns.lookup);

export interface UrlCheck {
  safe: boolean;
  reason?: string;
}

export async function isSafeUrl(raw: string): Promise<UrlCheck> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { safe: false, reason: '无效 URL' };
  }

  const protocol = url.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    return { safe: false, reason: '仅支持 http/https 链接' };
  }

  const host = url.hostname;
  if (!host) return { safe: false, reason: '缺少主机名' };

  // 快速拒绝明显的本机/内网字面量（无需 DNS）
  if (isBlockedLiteral(host)) {
    return { safe: false, reason: '不允许访问本机或内网地址' };
  }

  // DNS 解析校验：拒绝解析到回环/私有/链路本地的地址
  try {
    const addr = await lookup(host);
    if (isBlockedIp(addr.address)) {
      return { safe: false, reason: '不允许访问本机或内网地址' };
    }
    return { safe: true };
  } catch {
    return { safe: false, reason: '无法解析主机名' };
  }
}

function isBlockedLiteral(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost') return true;
  if (/^127\./.test(h)) return true;
  if (/^0\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true; // 链路本地
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h === '::1' || h === '0.0.0.0') return true;
  return false;
}

function isBlockedIp(ip: string): boolean {
  if (ip === '::1' || ip === '::ffff:127.0.0.1') return true;
  return isBlockedLiteral(ip);
}
