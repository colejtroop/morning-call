import { fileURLToPath } from "node:url";

export const clientRoot = fileURLToPath(new URL("../client/", import.meta.url));

export function readConfig(env = process.env) {
  const port = Number(env.PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return {
    apiKey: env.OPENAI_API_KEY || "",
    host: env.HOST || "127.0.0.1",
    model: env.OPENAI_REALTIME_MODEL || "gpt-realtime",
    port
  };
}

export function createSessionConfig(model) {
  return {
    type: "realtime",
    model,
    output_modalities: ["audio"],
    instructions: [
      "You are a concise organic personal bio-optimization assistant in a morning call.",
      "Sound natural, observant, direct, and occasionally dryly funny. Never use fake positivity.",
      "Begin with exactly: Morning. Weight?",
      "When the user gives a bodyweight in pounds, immediately call record_weight.",
      "Do not claim to see or measure the user. The camera observer is not connected yet.",
      "After weight is stored, briefly acknowledge it and say: Camera up.",
      "Keep each spoken turn under two short sentences unless the user asks for detail."
    ].join(" "),
    audio: {
      input: {
        noise_reduction: { type: "near_field" },
        turn_detection: {
          type: "semantic_vad",
          create_response: true,
          interrupt_response: true
        },
        transcription: { model: "gpt-4o-mini-transcribe", language: "en" }
      },
      output: { voice: "cedar", speed: 1.05 }
    },
    tools: [
      {
        type: "function",
        name: "record_weight",
        description: "Record the user's stated morning bodyweight in pounds.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            pounds: { type: "number", minimum: 80, maximum: 500 },
            source_text: { type: "string" }
          },
          required: ["pounds"]
        }
      }
    ],
    tool_choice: "auto",
    max_output_tokens: 180
  };
}
