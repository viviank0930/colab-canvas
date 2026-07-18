#!/usr/bin/env python3
import json
import os
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")
API_URL = "https://api.deepseek.com/chat/completions"


class WorkspaceHandler(SimpleHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/api/analyse":
            return self.send_json(404, {"error": "Not found"})
        api_key = os.getenv("DEEPSEEK_API_KEY")
        if not api_key:
            return self.send_json(503, {
                "error": "DeepSeek has not been configured",
                "code": "missing_api_key"
            })
        try:
            length = int(self.headers.get("Content-Length", "0"))
            data = json.loads(self.rfile.read(length) or b"{}")
            notes = [str(x).strip()[:2000] for x in data.get("notes", []) if str(x).strip()][:80]
            task = data.get("task", "reflect")
            if not notes:
                return self.send_json(400, {"error": "No readable selected notes"})
            prompt = {
                "task": task,
                "selected_notes": notes,
                "required_output": {
                    "summary": "neutral description grounded only in selected notes",
                    "themes": ["2-5 tentative themes"],
                    "perspectives": ["different or conflicting perspectives, if present"],
                    "questions": ["questions that help humans discuss rather than decide"],
                    "next_actions": ["optional discussion actions, never final decisions"]
                }
            }
            request_body = json.dumps({
                "model": MODEL,
                "messages": [
                    {"role": "system", "content": "You are a collaborative design-learning partner. Analyse only the human-selected notes. Do not make decisions, rank people, invent evidence, or automatically organise the canvas. Distinguish evidence from inference. Return valid JSON only."},
                    {"role": "user", "content": "Return JSON for this request:\n" + json.dumps(prompt, ensure_ascii=False)}
                ],
                "response_format": {"type": "json_object"},
                "thinking": {"type": "disabled"},
                "temperature": 0.2,
                "max_tokens": 1200,
                "stream": False
            }, ensure_ascii=False).encode("utf-8")
            req = urllib.request.Request(API_URL, data=request_body, headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }, method="POST")
            with urllib.request.urlopen(req, timeout=60) as response:
                result = json.loads(response.read())
            content = result["choices"][0]["message"]["content"]
            analysis = json.loads(content)
            self.send_json(200, {"analysis": analysis, "model": MODEL})
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:800]
            self.send_json(502, {"error": "DeepSeek request failed", "detail": detail})
        except Exception as exc:
            self.send_json(500, {"error": "Analysis failed", "detail": str(exc)[:500]})


if __name__ == "__main__":
    port = int(os.getenv("PORT", "4173"))
    print(f"CoLab workspace: http://127.0.0.1:{port}")
    print(f"AI model: {MODEL} ({'configured' if os.getenv('DEEPSEEK_API_KEY') else 'DEEPSEEK_API_KEY missing'})")
    ThreadingHTTPServer(("127.0.0.1", port), WorkspaceHandler).serve_forever()
