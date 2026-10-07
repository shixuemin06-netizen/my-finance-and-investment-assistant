export function currentUserContext() { return { id: 'local', edition: 'local' as const, capabilities: { follow: true, notes: true, export: true } }; }
