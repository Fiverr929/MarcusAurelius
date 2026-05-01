# CafeHTML — Image Generation Reference

All three models use the Google AI Platform endpoint via `fetch` with an API key (express mode).

---

## Models

### NANO BANANA — `gemini-2.5-flash-image`
Generalist model. Fast, good quality, lowest cost.

| Parameter | Value |
|---|---|
| Temperature | 0–2, default 1 |
| Top-P | 0.95 |
| Max output tokens | 32768 |
| Max input images | 3 |
| Thinking | Not supported |
| Grounding | Not supported |

**`imageConfig`**
| Field | Options |
|---|---|
| `aspectRatio` | `"1:1"` `"16:9"` `"9:16"` `"4:3"` `"3:4"` |
| `imageSize` | `"1K"` `"2K"` `"4K"` |
| `outputMimeType` | `"image/png"` `"image/jpeg"` |

---

### NANO BANANA 2 — `gemini-3.1-flash-image-preview`
Reasoning model. Higher quality, supports thinking, grounding, and 512 resolution.

| Parameter | Value |
|---|---|
| Temperature | 0–1, default 1 |
| Top-P | 0.95 |
| Max output tokens | 32768 |
| Max input images | 14 |
| Thinking | `"HIGH"` `"MINIMAL"` |
| Grounding | Google Search + Image Search |

**`imageConfig`**
| Field | Options |
|---|---|
| `aspectRatio` | `"1:1"` `"16:9"` `"9:16"` `"4:3"` `"3:4"` and more (range 1:8 to 8:1) |
| `imageSize` | `"512"` `"1K"` `"2K"` `"4K"` |
| `outputMimeType` | `"image/png"` `"image/jpeg"` |

**`thinkingConfig`**
| Field | Options |
|---|---|
| `thinkingLevel` | `"HIGH"` — better quality, slower. `"MINIMAL"` — faster, lighter. |

---

### NANO BANANA PRO — `gemini-3-pro-image-preview`
Most powerful model. Best for complex and multi-turn generation. Supports grounding.

| Parameter | Value |
|---|---|
| Temperature | 0–1, default 1 |
| Top-P | 0.95 |
| Max output tokens | 32768 |
| Max input images | 14 |
| Thinking | Not supported |
| Grounding | Google Search + Image Search |

**`imageConfig`**
| Field | Options |
|---|---|
| `aspectRatio` | `"1:1"` `"16:9"` `"9:16"` `"4:3"` `"3:4"` |
| `imageSize` | `"1K"` `"2K"` `"4K"` |
| `outputMimeType` | `"image/png"` `"image/jpeg"` |

---

## API Request Structure

```json
{
  "contents": [{ "role": "user", "parts": [{ "text": "..." }] }],
  "generationConfig": {
    "responseModalities": ["IMAGE"],
    "temperature": 1,
    "topP": 0.95,
    "maxOutputTokens": 32768,
    "imageConfig": {
      "aspectRatio": "1:1",
      "imageSize": "1K",
      "outputMimeType": "image/png"
    },
    "thinkingConfig": {
      "thinkingLevel": "MINIMAL"
    }
  }
}
```

> `thinkingConfig` — only send for NANO BANANA 2. Omit for NANO BANANA and NANO BANANA PRO.

---

## Safety Settings (all models)

All four categories set to `OFF` in CafeHTML:

- `HARM_CATEGORY_HATE_SPEECH`
- `HARM_CATEGORY_DANGEROUS_CONTENT`
- `HARM_CATEGORY_SEXUALLY_EXPLICIT`
- `HARM_CATEGORY_HARASSMENT`

---

## What is NOT used yet

| Feature | Notes |
|---|---|
| Grounding | Available on NANO BANANA 2 and PRO. Not implemented. |
| `stop_sequences` | Supported by NANO BANANA PRO. Not implemented. |
| `system_instruction` | Supported by all models. Not implemented. |
| `outputMimeType` | Python SDK uses `output_mime_type` but JSON field name is unknown — API returns 400. Not sent. |
| `imageSize` | Not currently sent in `api.js`. Defaults to model choice. |
| `thinkingConfig` | Not currently sent in `api.js`. |
