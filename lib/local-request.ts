/** Mutations belong to the loopback app, never a third-party website. */
export function isLocalMutation(request: Request): boolean {
  try {
    const target = new URL(request.url);
    const origin = new URL(request.headers.get('origin') || '');
    const local = new Set(['localhost', '127.0.0.1', '[::1]']);
    return local.has(target.hostname) && local.has(origin.hostname)
      && origin.host === request.headers.get('host')
      && origin.protocol === target.protocol
      && request.headers.get('content-type')?.split(';')[0] === 'application/json';
  } catch { return false; }
}
