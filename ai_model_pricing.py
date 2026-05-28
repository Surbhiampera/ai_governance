from dataclasses import dataclass

@dataclass
class ModelPricing:
    input_per_1m: float       # USD per 1M input tokens
    output_per_1m: float      # USD per 1M output tokens
    context_window: int       # max context tokens
    max_output_tokens: int
    provider: str
    category: str             # chat | reasoning | code | embedding | search

MODEL_PRICING: dict[str, ModelPricing] = {

    # ── OPENAI ────────────────────────────────────────────────────────────────
    "gpt-4o":               ModelPricing(2.50,  10.00, 128_000,  16_384, "OpenAI", "chat"),
    "gpt-4o-mini":          ModelPricing(0.15,   0.60, 128_000,  16_384, "OpenAI", "chat"),
    "gpt-4o-2024-11-20":    ModelPricing(2.50,  10.00, 128_000,  16_384, "OpenAI", "chat"),
    "gpt-4-turbo":          ModelPricing(10.00, 30.00, 128_000,   4_096, "OpenAI", "chat"),
    "gpt-4":                ModelPricing(30.00, 60.00,   8_192,   4_096, "OpenAI", "chat"),
    "gpt-3.5-turbo":        ModelPricing(0.50,   1.50,  16_385,   4_096, "OpenAI", "chat"),
    "o1":                   ModelPricing(15.00, 60.00, 200_000, 100_000, "OpenAI", "reasoning"),
    "o1-mini":              ModelPricing(1.10,   4.40, 128_000,  65_536, "OpenAI", "reasoning"),
    "o1-preview":           ModelPricing(15.00, 60.00, 128_000,  32_768, "OpenAI", "reasoning"),
    "o3":                   ModelPricing(10.00, 40.00, 200_000, 100_000, "OpenAI", "reasoning"),
    "o3-mini":              ModelPricing(1.10,   4.40, 200_000, 100_000, "OpenAI", "reasoning"),
    "o4-mini":              ModelPricing(1.10,   4.40, 200_000, 100_000, "OpenAI", "reasoning"),
    "text-embedding-3-small": ModelPricing(0.02,  0.00,   8_191,       0, "OpenAI", "embedding"),
    "text-embedding-3-large": ModelPricing(0.13,  0.00,   8_191,       0, "OpenAI", "embedding"),

    # ── ANTHROPIC ─────────────────────────────────────────────────────────────
    "claude-opus-4-5":            ModelPricing(15.00, 75.00, 200_000, 32_000, "Anthropic", "chat"),
    "claude-sonnet-4-5":          ModelPricing(3.00,  15.00, 200_000, 64_000, "Anthropic", "chat"),
    "claude-haiku-4-5":           ModelPricing(0.80,   4.00, 200_000,  8_096, "Anthropic", "chat"),
    "claude-3-5-sonnet-20241022": ModelPricing(3.00,  15.00, 200_000,  8_096, "Anthropic", "chat"),
    "claude-3-5-haiku-20241022":  ModelPricing(0.80,   4.00, 200_000,  8_096, "Anthropic", "chat"),
    "claude-3-opus-20240229":     ModelPricing(15.00, 75.00, 200_000,  4_096, "Anthropic", "chat"),

    # ── GOOGLE GEMINI ─────────────────────────────────────────────────────────
    "gemini-2.5-pro":   ModelPricing(1.25,  10.00, 1_048_576, 65_536, "Google", "chat"),
    "gemini-2.5-flash": ModelPricing(0.15,   0.60, 1_048_576, 65_536, "Google", "chat"),
    "gemini-2.0-flash": ModelPricing(0.10,   0.40, 1_048_576,  8_192, "Google", "chat"),
    "gemini-1.5-pro":   ModelPricing(1.25,   5.00, 2_097_152,  8_192, "Google", "chat"),
    "gemini-1.5-flash": ModelPricing(0.075,  0.30, 1_048_576,  8_192, "Google", "chat"),
    "text-embedding-004": ModelPricing(0.025, 0.00,     2_048,      0, "Google", "embedding"),

    # ── META LLAMA ────────────────────────────────────────────────────────────
    "llama-3.3-70b-versatile":  ModelPricing(0.59, 0.79, 128_000, 32_768, "Meta/Groq",    "chat"),
    "llama-3.1-405b-instruct":  ModelPricing(3.00, 3.00, 131_072, 16_384, "Meta/Together","chat"),
    "llama-3.1-70b-instruct":   ModelPricing(0.88, 0.88, 131_072, 16_384, "Meta/Together","chat"),
    "llama-3.1-8b-instruct":    ModelPricing(0.18, 0.18, 131_072, 16_384, "Meta/Together","chat"),

    # ── MISTRAL ───────────────────────────────────────────────────────────────
    "mistral-large-2411": ModelPricing(2.00, 6.00, 128_000, 16_384, "Mistral", "chat"),
    "mistral-small-2503": ModelPricing(0.10, 0.30,  32_000,  8_192, "Mistral", "chat"),
    "codestral-2501":     ModelPricing(0.30, 0.90, 256_000, 16_384, "Mistral", "code"),

    # ── COHERE ────────────────────────────────────────────────────────────────
    "command-r-plus-08-2024": ModelPricing(2.50, 10.00, 128_000, 4_096, "Cohere", "chat"),
    "command-r-08-2024":      ModelPricing(0.15,  0.60, 128_000, 4_096, "Cohere", "chat"),
    "embed-english-v3.0":     ModelPricing(0.10,  0.00,     512,     0, "Cohere", "embedding"),

    # ── GROQ ──────────────────────────────────────────────────────────────────
    "mixtral-8x7b-32768": ModelPricing(0.27, 0.27, 32_768, 32_768, "Groq",         "chat"),
    "gemma2-9b-it":       ModelPricing(0.20, 0.20,  8_192,  8_192, "Groq/Google",  "chat"),

    # ── DEEPSEEK ──────────────────────────────────────────────────────────────
    "deepseek-chat":     ModelPricing(0.27, 1.10, 64_000, 8_192, "DeepSeek", "chat"),
    "deepseek-reasoner": ModelPricing(0.55, 2.19, 64_000, 8_192, "DeepSeek", "reasoning"),

    # ── PERPLEXITY ────────────────────────────────────────────────────────────
    "sonar-pro": ModelPricing(3.00, 15.00, 200_000, 8_000, "Perplexity", "search"),
    "sonar":     ModelPricing(1.00,  1.00, 127_072, 8_000, "Perplexity", "search"),

    # ── XAI GROK ──────────────────────────────────────────────────────────────
    "grok-3":      ModelPricing(3.00,  15.00, 131_072, 131_072, "xAI", "chat"),
    "grok-3-mini": ModelPricing(0.30,   0.50, 131_072, 131_072, "xAI", "reasoning"),
}
