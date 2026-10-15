type GateResult = 'allow' | 'upgrade' | 'choice' | 'unavailable';
function parse(value: string | null): number[] | null {
  if (!value || !/^\d+(\.\d+){0,2}$/.test(value)) return null;
  const parts = value.split('.').map(Number);
  if (parts.some(part => !Number.isSafeInteger(part))) return null;
  return [parts[0], parts[1] ?? 0, parts[2] ?? 0];
}
export function evaluatePaymentGate(
  rollout: string | null, minimum: string | null, installed: string | null, hasChoice: boolean,
): GateResult {
  if (rollout !== 'true' && rollout !== 'false') return 'unavailable';
  const min = parse(minimum);
  if (!min) return 'unavailable';
  if (rollout === 'false') return 'allow';
  const version = parse(installed);
  if (!version || version.some((part, i) => part < min[i] && version.slice(0, i).every((v, j) => v === min[j])))
    return 'upgrade';
  if (!hasChoice) return 'choice';
  return 'allow';
}
export async function paymentGate(req: Request, hasChoice: boolean): Promise<GateResult> {
  const { supabaseAdmin } = await import('./supabaseAdmin.ts');
  const { data, error } = await supabaseAdmin.from('app_config').select('key,value')
    .in('key', ['require_ucb_for_razorpay', 'min_app_version']);
  if (error || !data) return 'unavailable';
  const values = new Map((data as { key: string; value: string }[]).map(row => [row.key, row.value]));
  return evaluatePaymentGate(values.get('require_ucb_for_razorpay') ?? null,
    values.get('min_app_version') ?? null, req.headers.get('x-medveda-app-version'), hasChoice);
}
