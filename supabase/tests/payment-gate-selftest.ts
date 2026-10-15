import { evaluatePaymentGate } from '../functions/_shared/paymentGate.ts';
function check(name: string, actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`${name}: got ${String(actual)} expected ${String(expected)}`);
  console.log(`PASS ${name}`);
}
check('rollout disabled keeps legacy checkout', evaluatePaymentGate('false', '1.0.0', null, false), 'allow');
check('enabled rejects missing version', evaluatePaymentGate('true', '1.2.0', null, true), 'upgrade');
check('enabled rejects old version', evaluatePaymentGate('true', '1.2.0', '1.1.9', true), 'upgrade');
check('enabled rejects absent choice', evaluatePaymentGate('true', '1.2.0', '1.2.0', false), 'choice');
check('enabled accepts supported choice', evaluatePaymentGate('true', '1.2.0', '1.2.0', true), 'allow');
check('malformed config fails closed', evaluatePaymentGate('true', 'oops', '1.2.0', true), 'unavailable');
check('disabled rollout still requires valid config', evaluatePaymentGate('false', null, null, false), 'unavailable');
check('missing rollout fails closed', evaluatePaymentGate(null, '1.2.0', '1.2.0', true), 'unavailable');
