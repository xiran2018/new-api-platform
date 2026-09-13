export const PLATFORM_BILLING_PRESET_GROUPS = [
  {
    group: 'Platform tiered',
    presets: [
      {
        key: 'input-length-tiers',
        label: 'Input token range pricing',
        expr: 'len <= 128000 ? tier("0-128K", p * 1 + c * 4) : len <= 256000 ? tier("128K-256K", p * 2 + c * 8) : tier("256K+", p * 4 + c * 16)',
      },
      {
        key: 'input-length-thinking-tiers',
        label: 'Input range + thinking output pricing',
        expr: 'len <= 256000 ? (param("enable_thinking") == true ? tier("0-256K thinking", p * 2 + c * 12) : tier("0-256K", p * 2 + c * 8)) : (param("enable_thinking") == true ? tier("256K+ thinking", p * 6 + c * 24) : tier("256K+", p * 6 + c * 16))',
      },
    ],
  },
  {
    group: 'Platform multimodal',
    presets: [
      {
        key: 'text-image-audio-split',
        label: 'Text/image/audio split pricing',
        expr: 'tier("multimodal", p * 1 + c * 4 + img * 1 + img_o * 8 + ai * 6 + ao * 24)',
      },
      {
        key: 'unified-multimodal-input-audio-output',
        label: 'Unified text/image/video input + separate audio pricing',
        expr: 'ao > 0 ? tier("text+audio output", p * 7 + c * 0 + img * 7 + vid * 7 + ai * 53 + ao * 213) : tier("text output", p * 7 + c * 40 + img * 7 + vid * 7 + ai * 53 + ao * 0)',
      },
      {
        key: 'omni-output-modes',
        label: 'Qwen3 Omni three output prices',
        expr: '(img > 0 || ai > 0 || vid > 0) ? (ao > 0 ? tier("text+audio output", p * 1.8 + ai * 15.8 + img * 3.3 + vid * 3.3 + c * 0 + ao * 62.6) : tier("multimodal text output", p * 1.8 + ai * 15.8 + img * 3.3 + vid * 3.3 + c * 12.7)) : tier("pure text output", p * 1.8 + c * 6.9)',
      },
      {
        key: 'live-translation-multimodal',
        label: 'Live translation multimodal token pricing',
        expr: 'tier("live_translation", p * 0 + c * 10 + img * 4 + ai * 10 + ao * 40)',
      },
      {
        key: 'audio-transcription-per-second',
        label: 'Audio transcription per second',
        expr: 'tier("audio_transcription", p * 0 + c * 0 + aud_s * 220)',
      },
    ],
  },
]
