import { EXACT_BODY_V4, V4_CHECKPOINTS } from './OptionEWorkplanSubmitExactBodyV4Models';
import { OPTION_E_SUBMIT_CONTRACT_VERSION } from './OptionEWorkplanSubmitModels';
test('separates exact-body storage/receipt negotiation from unchanged v3', () => {
  expect(EXACT_BODY_V4.protocol).toBe('kcf.kpi.option-e.submit.v4');
  expect(EXACT_BODY_V4.integrity).toBe('exact-body/v1');
  expect(EXACT_BODY_V4.storage).toBe('kcf.kpi.option-e.storage.v4');
  expect(OPTION_E_SUBMIT_CONTRACT_VERSION).toBe('kcf.kpi.option-e.submit.v3');
  expect(V4_CHECKPOINTS).toHaveLength(7);
});
