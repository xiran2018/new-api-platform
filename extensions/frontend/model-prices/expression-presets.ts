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
        expr: 'len <= 256000 ? tier("0-256K", p * 2 + c * (param("enable_thinking") == true ? 12 : 8)) : tier("256K+", p * 6 + c * (param("enable_thinking") == true ? 24 : 16))',
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
        expr: 'tier("multimodal_audio", p * 7 + c * (ao > 0 ? 0 : 40) + img * 7 + ai * 53 + vid * 7 + ao * 213)',
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
