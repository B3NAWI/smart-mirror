from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from openai import APIConnectionError, APIStatusError, OpenAI

BACKEND_DIR = Path(__file__).resolve().parent
ENV_FILE = BACKEND_DIR / ".env"
DEFAULT_MODEL = "gpt-5.5"


def main() -> int:
    load_dotenv(ENV_FILE)

    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        print("OPENAI_API_KEY is missing in backend/.env")
        return 1

    model = os.getenv("OPENAI_TEXT_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL
    client = OpenAI(api_key=api_key)

    try:
        response = client.responses.create(
            model=model,
            instructions="Reply with only the word OK.",
            input="Return OK only.",
            reasoning={"effort": "low"},
            text={"verbosity": "low"},
        )
    except APIConnectionError:
        print("OpenAI request failed: connection error")
        return 1
    except APIStatusError as exc:
        print(f"OpenAI request failed: HTTP {exc.status_code}")
        return 1
    except Exception as exc:  # pragma: no cover - defensive script path
        print(f"OpenAI request failed: {exc.__class__.__name__}")
        return 1

    if response.output_text.strip():
        print("OpenAI key works")
        return 0

    print("OpenAI request failed: empty response")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
