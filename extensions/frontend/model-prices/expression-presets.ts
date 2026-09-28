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
        key: 'qwen-thinking-output',
        label: 'Qwen input range and thinking output prices',
        expr: 'len <= 256000 ? (param("enable_thinking") == true ? tier("0-256K thinking", p * 1.8 + c * 10.8) : tier("0-256K non-thinking", p * 1.8 + c * 10.8)) : (param("enable_thinking") == true ? tier("256K+ thinking (edit price)", p * 1.8 + c * 10.8) : tier("256K+ non-thinking (edit price)", p * 1.8 + c * 10.8))',
      },
      {
        key: 'shared-input-thinking-output',
        label: 'Shared input + thinking output prices',
        expr: '(p * 1.8) + (param("enable_thinking") == true ? tier("thinking output", c * 10.8) : tier("non-thinking output", c * 10.8))',
      },
      {
        key: 'two-range-thinking-output',
        label: 'Two input ranges + thinking output prices',
        expr: 'len <= 256000 ? (param("enable_thinking") == true ? tier("Short context thinking", p * 2 + c * 8) : tier("Short context non-thinking", p * 2 + c * 8)) : (param("enable_thinking") == true ? tier("Long context thinking", p * 6 + c * 24) : tier("Long context non-thinking", p * 6 + c * 24))',
      },
      {
        key: 'three-range-thinking-output',
        label: 'Three input ranges + thinking/non-thinking output prices',
        expr: 'len <= 128000 ? (param("enable_thinking") == true ? tier("0-128K thinking", p * 0.8 + c * 4.8) : tier("0-128K non-thinking", p * 0.8 + c * 4.8)) : len <= 256000 ? (param("enable_thinking") == true ? tier("128K-256K thinking", p * 2 + c * 12) : tier("128K-256K non-thinking", p * 2 + c * 12)) : len <= 1000000 ? (param("enable_thinking") == true ? tier("256K-1M thinking", p * 4 + c * 24) : tier("256K-1M non-thinking", p * 4 + c * 24)) : (param("enable_thinking") == true ? tier("1M+ thinking", p * 4 + c * 24) : tier("1M+ non-thinking", p * 4 + c * 24))',
      },
      {
        key: 'three-range-shared-input-thinking-output',
        label: 'Three input ranges + shared input, thinking/non-thinking output prices',
        expr: 'len <= 128000 ? (param("enable_thinking") == true ? ((p * 0.8) + tier("0-128K thinking (shared input)", c * 4.8)) : ((p * 0.8) + tier("0-128K non-thinking (shared input)", c * 3.6))) : len <= 256000 ? (param("enable_thinking") == true ? ((p * 2) + tier("128K-256K thinking (shared input)", c * 12)) : ((p * 2) + tier("128K-256K non-thinking (shared input)", c * 9))) : len <= 1000000 ? (param("enable_thinking") == true ? ((p * 4) + tier("256K-1M thinking (shared input)", c * 24)) : ((p * 4) + tier("256K-1M non-thinking (shared input)", c * 18))) : (param("enable_thinking") == true ? ((p * 4) + tier("1M+ thinking (shared input)", c * 24)) : ((p * 4) + tier("1M+ non-thinking (shared input)", c * 18)))',
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
        key: 'realtime-modality-cache-pricing',
        label: 'Realtime text/image/audio + cached input pricing',
        expr: 'tier("realtime modalities", p * 1 + cr * 0.5 + c * 1 + img * 1 + img_cr * 0.5 + img_o * 1 + ai * 1 + ai_cr * 0.5 + ao * 1)',
      },
      {
        key: 'gemini-flash-lite-unified-cache-pricing',
        label: 'Gemini Flash Lite unified multimodal + cached input pricing',
        expr: 'tier("Gemini Flash Lite input/output", p * 0.30 + img * 0.30 + vid * 0.30 + ai * 0.30 + cr * 0.03 + c * 2.50)',
      },
      {
        key: 'gemini-flash-lite-audio-cache-pricing',
        label: 'Gemini Flash Lite shared text/image/video + separate audio/cache pricing',
        expr: 'tier("Gemini Flash Lite audio split", p * 0.25 + img * 0.25 + vid * 0.25 + ai * 0.50 + cr * 0.025 + ai_cr * 0.05 + c * 1.50)',
      },
      {
        key: 'image-modality-cache-pricing',
        label: 'Image model text/image/cache input + image output pricing',
        expr: 'tier("image modalities", p * 1 + cr * 0.5 + img * 1 + img_cr * 0.5 + img_o * 1)',
      },
      {
        key: 'audio-image-input-text-audio-output',
        label: 'Audio/image input + text/audio output pricing',
        expr: 'tier("audio/image input + text/audio output", ai * 1 + img * 1 + c * 1 + ao * 1)',
      },
      {
        key: 'audio-image-input-text-audio-output-simple',
        label: 'Simple audio/image input + text/audio output pricing',
        expr: 'tier("audio/image input + text/audio output", ai * 1 + img * 1 + c * 1 + ao * 1)',
      },
      {
        key: 'text-audio-input-text-audio-output-simple',
        label: 'Simple text/audio input + text/audio output pricing',
        expr: 'tier("text/audio input + text/audio output", p * 1 + ai * 1 + c * 1 + ao * 1)',
      },
      {
        key: 'unified-multimodal-input-audio-output',
        label: 'Unified text/image/video input + separate audio pricing',
        expr: 'ao > 0 ? tier("text+audio output", p * 7 + c * 0 + img * 7 + vid * 7 + ai * 53 + ao * 213) : tier("text output", p * 7 + c * 40 + img * 7 + vid * 7 + ai * 53 + ao * 0)',
      },
      {
        key: 'shared-text-image-input-audio-output-modes',
        label: 'Shared text/image/video input + audio input + multimodal/audio output pricing',
        expr: '(p * 1 + img * 1 + vid * 1 + ai * 1) + (ao > 0 ? tier("text+audio output (audio only, shared text/image/video input)", c * 0 + ao * 1) : tier("multimodal text output (shared text/image/video input)", c * 1))',
      },
      {
        key: 'shared-text-image-audio-output-modes',
        label: 'Shared text/image input + audio input + multimodal/audio output pricing',
        expr: '(p * 1 + img * 1 + ai * 1) + (ao > 0 ? tier("text+audio output (audio only, shared text/image input)", c * 0 + ao * 1) : tier("multimodal text output (shared text/image input)", c * 1))',
      },
      {
        key: 'shared-text-image-video-audio-output-simple',
        label: 'Simple shared text/image/video input + audio input + output pricing',
        expr: '(p * 1 + img * 1 + vid * 1 + ai * 1) + (ao > 0 ? tier("text+audio output (audio only, shared text/image/video input)", c * 0 + ao * 1) : tier("multimodal text output (shared text/image/video input)", c * 1))',
      },
      {
        key: 'shared-text-image-audio-output-simple',
        label: 'Simple shared text/image input + audio input + output pricing',
        expr: '(p * 1 + img * 1 + ai * 1) + (ao > 0 ? tier("text+audio output (audio only, shared text/image input)", c * 0 + ao * 1) : tier("multimodal text output (shared text/image input)", c * 1))',
      },
      {
        key: 'omni-output-modes',
        label: 'Qwen3 Omni three output prices',
        expr: '(p * 1.8 + ai * 15.8 + img * 3.3 + vid * 3.3) + (ao > 0 ? tier("text+audio output (audio only)", c * 0 + ao * 62.6) : ((img > 0 || ai > 0 || vid > 0) ? tier("multimodal text output", c * 12.7) : tier("pure text output", c * 6.9)))',
      },
      {
        key: 'omni-shared-media-input-output-modes',
        label: 'Qwen3 Omni shared image/video input + three output prices',
        expr: '(p * 1.8 + ai * 15.8 + img * 3.3 + vid * 3.3) + (ao > 0 ? tier("text+audio output (audio only, shared image/video input)", c * 0 + ao * 62.6) : ((img > 0 || ai > 0 || vid > 0) ? tier("multimodal text output (shared image/video input)", c * 12.7) : tier("pure text output (shared image/video input)", c * 6.9)))',
      },
      {
        key: 'live-translation-multimodal',
        label: 'Live translation multimodal token pricing',
        expr: 'tier("live_translation", p * 0 + c * 10 + img * 4 + ai * 10 + ao * 40)',
      },
      {
        key: 'audio-input-audio-output-token-pricing',
        label: 'Audio input + audio output token pricing',
        expr: 'tier("audio input + audio output token pricing", ai * 3.5 + ao * 21)',
      },
      {
        key: 'audio-input-text-output-token-pricing',
        label: 'Audio input + text output token pricing',
        expr: 'tier("audio input + text output token pricing", ai * 3.5 + c * 21)',
      },
      {
        key: 'audio-transcription-per-second',
        label: 'Uploaded audio transcription per second',
        expr: 'tier("audio_transcription", p * 0 + c * 0 + aud_s * 220)',
      },
    ],
  },
]
