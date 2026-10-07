import { assessContentQuality, type QualityInput } from './content-quality';
import { validateJudgment } from './judgment';

/** A quotation match alone does not make a stale or mismatched generation suitable for reading. */
export function readResearchJudgment(input: QualityInput, conditionalOnly = false) {
  const quality = assessContentQuality(input);
  if (quality.status !== 'accepted' || !quality.canGenerate) return null;
  try {
    const judgment = validateJudgment(JSON.parse(input.judgment || 'null'), input.raw_text || '');
    if (!judgment || (conditionalOnly && (!judgment.conditions || judgment.horizon === 'knowledge'))) return null;
    return judgment;
  } catch { return null; }
}
