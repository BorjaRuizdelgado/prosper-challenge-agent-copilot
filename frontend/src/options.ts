export interface Option {
  value: string;
  label: string;
}

/** Curated ElevenLabs voices. `DEFAULT_VOICE_ID` in the backend schema is Rachel. */
export const VOICES: Option[] = [
  { value: "21m00Tcm4TlvDq8ikWAM", label: "Rachel" },
  { value: "EXAVITQu4vr4xnSDxMaL", label: "Sarah" },
  { value: "pNInz6obpgDQGcFmaJgB", label: "Adam" },
  { value: "TxGEqnHWrfWFTfGW9XjX", label: "Josh" },
];

export const MODELS: Option[] = [
  { value: "gpt-4o", label: "gpt-4o" },
  { value: "gpt-4o-mini", label: "gpt-4o-mini" },
  { value: "gpt-4.1", label: "gpt-4.1" },
];
