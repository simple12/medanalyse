#!/usr/bin/env python3
"""Smoke-test OPENAI_API_KEY from your laptop (chat + embeddings).

Usage:
  export OPENAI_API_KEY='sk-...'
  python3 scripts/test_openai_key.py

Or pass the key once:
  OPENAI_API_KEY='sk-...' python3 scripts/test_openai_key.py
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

CHAT_URL = "https://api.openai.com/v1/chat/completions"
EMBED_URL = "https://api.openai.com/v1/embeddings"
CHAT_MODEL = "gpt-4o-mini"
EMBED_MODEL = "text-embedding-3-small"


def post_json(url: str, api_key: str, body: dict) -> dict:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    api_key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not api_key:
        print("FAIL: OPENAI_API_KEY is not set", file=sys.stderr)
        return 1

    print(f"Key prefix: {api_key[:8]}...{api_key[-4:]} (len={len(api_key)})")
    ok = True

    try:
        chat = post_json(
            CHAT_URL,
            api_key,
            {
                "model": CHAT_MODEL,
                "messages": [{"role": "user", "content": "Reply with exactly: ok"}],
                "max_tokens": 8,
            },
        )
        text = chat["choices"][0]["message"]["content"].strip()
        print(f"PASS chat ({CHAT_MODEL}): {text!r}")
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        print(f"FAIL chat: HTTP {err.code}\n{detail}", file=sys.stderr)
        ok = False
    except Exception as err:  # noqa: BLE001 - show any local network/auth failure
        print(f"FAIL chat: {err}", file=sys.stderr)
        ok = False

    try:
        embed = post_json(
            EMBED_URL,
            api_key,
            {"model": EMBED_MODEL, "input": "medanalyse smoke test"},
        )
        dims = len(embed["data"][0]["embedding"])
        print(f"PASS embeddings ({EMBED_MODEL}): vector dims={dims}")
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        print(f"FAIL embeddings: HTTP {err.code}\n{detail}", file=sys.stderr)
        ok = False
    except Exception as err:  # noqa: BLE001
        print(f"FAIL embeddings: {err}", file=sys.stderr)
        ok = False

    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
