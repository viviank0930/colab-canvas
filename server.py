#!/usr/bin/env python3
import hashlib
import hmac
import json
import os
import threading
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")
API_URL = "https://api.deepseek.com/chat/completions"
ACCESS_CODE = os.getenv("APP_ACCESS_CODE", "")
DAILY_LIMIT = int(os.getenv("DAILY_AI_LIMIT", "10"))
USER_DAILY_LIMIT = int(os.getenv("PER_USER_DAILY_LIMIT", "3"))
SESSION_SECRET = os.getenv("APP_SECRET", ACCESS_CODE or "local-development")
usage_lock = threading.Lock()
usage_day = date.today().isoformat()
total_usage = 0
user_usage = {}


def session_token():
    return hmac.new(SESSION_SECRET.encode(), b"colab-access", hashlib.sha256).hexdigest()


class WorkspaceHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        if getattr(self, "invite_cookie", False):
            secure = "; Secure" if os.getenv("RENDER") else ""
            self.send_header("Set-Cookie", f"colab_access={session_token()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000{secure}")
        super().end_headers()

    def send_json(self, status, payload, cookie=None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = min(int(self.headers.get("Content-Length", "0")), 250_000)
        return json.loads(self.rfile.read(length) or b"{}")

    def authenticated(self):
        if not ACCESS_CODE:
            return True
        cookies = SimpleCookie(self.headers.get("Cookie", ""))
        supplied = cookies.get("colab_access")
        return bool(supplied and hmac.compare_digest(supplied.value, session_token()))

    def client_ip(self):
        forwarded = self.headers.get("X-Forwarded-For", "")
        return forwarded.split(",")[0].strip() or self.client_address[0]

    def usage_status(self):
        global usage_day, total_usage, user_usage
        today = date.today().isoformat()
        with usage_lock:
            if usage_day != today:
                usage_day, total_usage, user_usage = today, 0, {}
            return total_usage, user_usage.get(self.client_ip(), 0)

    def consume_quota(self):
        global usage_day, total_usage, user_usage
        today = date.today().isoformat()
        ip = self.client_ip()
        with usage_lock:
            if usage_day != today:
                usage_day, total_usage, user_usage = today, 0, {}
            current = user_usage.get(ip, 0)
            if total_usage >= DAILY_LIMIT:
                return False, "网站今天的 AI 额度已用完，请明天再试。"
            if current >= USER_DAILY_LIMIT:
                return False, "你今天的 AI 使用次数已达到上限。"
            total_usage += 1
            user_usage[ip] = current + 1
            return True, None

    def do_GET(self):
        parsed = urllib.parse.urlsplit(self.path)
        invite = urllib.parse.parse_qs(parsed.query).get("invite", [""])[0]
        if ACCESS_CODE and invite and hmac.compare_digest(invite, ACCESS_CODE):
            self.invite_cookie = True
        self.path = parsed.path or "/"
        if self.path == "/api/status":
            total, user = self.usage_status()
            authenticated = self.authenticated() or getattr(self, "invite_cookie", False)
            return self.send_json(200, {
                "auth_required": bool(ACCESS_CODE),
                "authenticated": authenticated,
                "ai_configured": bool(os.getenv("DEEPSEEK_API_KEY")),
                "remaining_today": max(0, DAILY_LIMIT - total),
                "remaining_for_user": max(0, USER_DAILY_LIMIT - user),
                "share_path": "/?invite=" + urllib.parse.quote(ACCESS_CODE, safe="") if authenticated and ACCESS_CODE else "/",
            })
        return super().do_GET()

    def do_POST(self):
        if self.path == "/api/unlock":
            if not ACCESS_CODE:
                return self.send_json(200, {"ok": True})
            try:
                supplied = str(self.read_json().get("code", ""))
            except Exception:
                supplied = ""
            if not hmac.compare_digest(supplied, ACCESS_CODE):
                return self.send_json(401, {"error": "访问码不正确", "code": "invalid_access_code"})
            secure = "; Secure" if os.getenv("RENDER") else ""
            cookie = f"colab_access={session_token()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400{secure}"
            return self.send_json(200, {"ok": True}, cookie=cookie)

        if self.path != "/api/analyse":
            return self.send_json(404, {"error": "Not found"})
        if not self.authenticated():
            return self.send_json(401, {"error": "请先输入访问码", "code": "unauthorized"})
        api_key = os.getenv("DEEPSEEK_API_KEY")
        if not api_key:
            return self.send_json(503, {"error": "DeepSeek has not been configured", "code": "missing_api_key"})
        allowed, message = self.consume_quota()
        if not allowed:
            return self.send_json(429, {"error": message, "code": "rate_limited"})
        try:
            data = self.read_json()
            notes = [str(x).strip()[:500] for x in data.get("notes", []) if str(x).strip()][:30]
            task = str(data.get("task", "reflect"))[:1000]
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
                    "next_actions": ["optional discussion actions, never final decisions"],
                },
            }
            request_body = json.dumps({
                "model": MODEL,
                "messages": [
                    {"role": "system", "content": "You are a collaborative design-learning partner. Analyse only the human-selected notes. Do not make decisions, rank people, invent evidence, or automatically organise the canvas. Distinguish evidence from inference. Return valid JSON only."},
                    {"role": "user", "content": "Return JSON for this request:\n" + json.dumps(prompt, ensure_ascii=False)},
                ],
                "response_format": {"type": "json_object"},
                "thinking": {"type": "disabled"},
                "temperature": 0.2,
                "max_tokens": 1200,
                "stream": False,
            }, ensure_ascii=False).encode("utf-8")
            req = urllib.request.Request(API_URL, data=request_body, headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }, method="POST")
            with urllib.request.urlopen(req, timeout=60) as response:
                result = json.loads(response.read())
            analysis = json.loads(result["choices"][0]["message"]["content"])
            total, user = self.usage_status()
            self.send_json(200, {
                "analysis": analysis,
                "model": MODEL,
                "remaining_today": max(0, DAILY_LIMIT - total),
                "remaining_for_user": max(0, USER_DAILY_LIMIT - user),
            })
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:800]
            self.send_json(502, {"error": "DeepSeek request failed", "detail": detail})
        except Exception as exc:
            self.send_json(500, {"error": "Analysis failed", "detail": str(exc)[:500]})


if __name__ == "__main__":
    port = int(os.getenv("PORT", "4173"))
    host = os.getenv("HOST", "0.0.0.0" if os.getenv("RENDER") else "127.0.0.1")
    print(f"CoLab workspace: http://{host}:{port}")
    print(f"AI model: {MODEL} ({'configured' if os.getenv('DEEPSEEK_API_KEY') else 'DEEPSEEK_API_KEY missing'})")
    print(f"Access protection: {'enabled' if ACCESS_CODE else 'disabled for local use'}")
    ThreadingHTTPServer((host, port), WorkspaceHandler).serve_forever()
