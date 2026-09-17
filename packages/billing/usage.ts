export interface CallUsageBreakdown {
  stt_seconds: number;
  tts_characters: number;
  llm_prompt_tokens: number;
  llm_completion_tokens: number;
  telephony_seconds: number;
}

export interface CallCostBreakdown {
  stt_cost_usd: number;
  tts_cost_usd: number;
  llm_cost_usd: number;
  telephony_cost_usd: number;
  total_provider_cost_usd: number;
  sigulon_credits_charged: number;
}

export function calculateCallCost(
  usage: CallUsageBreakdown,
  rates: {
    stt_per_minute: number;
    tts_per_1k_chars: number;
    llm_prompt_per_1m: number;
    llm_completion_per_1m: number;
    telephony_per_minute: number;
  }
): CallCostBreakdown {
  const stt_cost = (usage.stt_seconds / 60) * rates.stt_per_minute;
  const tts_cost = (usage.tts_characters / 1000) * rates.tts_per_1k_chars;
  const llm_prompt_cost = (usage.llm_prompt_tokens / 1_000_000) * rates.llm_prompt_per_1m;
  const llm_comp_cost = (usage.llm_completion_tokens / 1_000_000) * rates.llm_completion_per_1m;
  const telephony_cost = (usage.telephony_seconds / 60) * rates.telephony_per_minute;

  const total_provider = stt_cost + tts_cost + llm_prompt_cost + llm_comp_cost + telephony_cost;
  const sigulon_credits = Math.max(1, Math.ceil(usage.telephony_seconds / 60)) * 0.25;

  return {
    stt_cost_usd: Number(stt_cost.toFixed(4)),
    tts_cost_usd: Number(tts_cost.toFixed(4)),
    llm_cost_usd: Number((llm_prompt_cost + llm_comp_cost).toFixed(4)),
    telephony_cost_usd: Number(telephony_cost.toFixed(4)),
    total_provider_cost_usd: Number(total_provider.toFixed(4)),
    sigulon_credits_charged: Number(sigulon_credits.toFixed(2)),
  };
}
