#!/usr/bin/env python3
import hashlib
import hmac
import json
import os
import re
import threading
import time
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
room_lock = threading.Lock()
room_file = os.getenv("COLAB_ROOM_FILE", os.path.join(os.path.dirname(__file__), "outputs", "rooms.json"))
rooms = {}


def clean_room_id(value):
    value = re.sub(r"[^a-zA-Z0-9_-]", "", str(value or ""))[:48]
    return value or "shared-direction"


def load_rooms():
    global rooms
    try:
        with open(room_file, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        if isinstance(data, dict):
            rooms = data
    except (OSError, ValueError):
        rooms = {}


def save_rooms():
    os.makedirs(os.path.dirname(room_file), exist_ok=True)
    temporary = room_file + ".tmp"
    serializable = {}
    for room_id, room in rooms.items():
        serializable[room_id] = {
            "revision": room.get("revision", 0),
            "state": room.get("state"),
            "roster": room.get("roster", {}),
            "hardware_transcripts": room.get("hardware_transcripts", [])[-100:],
            "updated_at": room.get("updated_at", 0),
        }
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(serializable, handle, ensure_ascii=False)
    os.replace(temporary, room_file)


def room_payload(room_id):
    room = rooms.setdefault(room_id, {"revision": 0, "state": None, "members": {}, "roster": {}, "hardware_transcripts": [], "updated_at": 0})
    now = time.time()
    room["members"] = {
        member_id: member for member_id, member in room.get("members", {}).items()
        if now - float(member.get("seen", 0)) < 60
    }
    members = [
        {"id": member_id, "name": member.get("name", "成员"), "seen": member.get("seen", 0)}
        for member_id, member in room["members"].items()
    ]
    roster = [
        {"id": member_id, "name": member.get("name", "成员"), "joined_at": member.get("joined_at", 0)}
        for member_id, member in room.get("roster", {}).items()
    ]
    return {
        "room": room_id,
        "revision": room.get("revision", 0),
        "state": room.get("state"),
        "members": members,
        "roster": roster,
        "hardware_transcripts": room.get("hardware_transcripts", [])[-100:],
    }


load_rooms()


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
        if self.path == "/api/room":
            if not self.authenticated() and not getattr(self, "invite_cookie", False):
                return self.send_json(401, {"error": "需要邀请链接", "code": "unauthorized"})
            room_id = clean_room_id(urllib.parse.parse_qs(parsed.query).get("room", [""])[0])
            with room_lock:
                return self.send_json(200, room_payload(room_id))
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
        parsed = urllib.parse.urlsplit(self.path)
        self.path = parsed.path
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

        if self.path == "/api/hardware/transcript":
            try:
                data = self.read_json()
            except Exception:
                return self.send_json(400, {"error": "无效的硬件数据"})
            room_id = clean_room_id(data.get("room"))
            text = re.sub(r"\s+", " ", str(data.get("text", ""))).strip()[:500]
            speaker = re.sub(r"[<>]", "", str(data.get("speaker", "ESP32"))).strip()[:30] or "ESP32"
            kind = str(data.get("kind", "answer")).strip().lower()
            if kind not in ("question", "answer", "feedback"):
                kind = "answer"
            if not text:
                return self.send_json(400, {"error": "没有可用的识别文字"})
            with room_lock:
                room = rooms.setdefault(room_id, {"revision": 0, "state": None, "members": {}, "roster": {}, "hardware_transcripts": [], "updated_at": 0})
                transcripts = room.setdefault("hardware_transcripts", [])
                record = {
                    "id": f"esp32-{int(time.time() * 1000)}-{len(transcripts)}",
                    "speaker": speaker,
                    "kind": kind,
                    "text": text,
                    "created_at": time.time(),
                }
                transcripts.append(record)
                del transcripts[:-100]
                room["revision"] = int(room.get("revision", 0)) + 1
                room["updated_at"] = time.time()
                save_rooms()
            return self.send_json(201, {"ok": True, "record": record})

        if self.path in ("/api/room/join", "/api/room/state"):
            if not self.authenticated():
                return self.send_json(401, {"error": "需要邀请链接", "code": "unauthorized"})
            try:
                data = self.read_json()
            except Exception:
                return self.send_json(400, {"error": "无效的房间数据"})
            room_id = clean_room_id(data.get("room"))
            member_id = re.sub(r"[^a-zA-Z0-9_-]", "", str(data.get("member_id", "")))[:64]
            member_name = str(data.get("name", "成员")).strip()[:30] or "成员"
            if not member_id:
                return self.send_json(400, {"error": "缺少成员标识"})
            with room_lock:
                room = rooms.setdefault(room_id, {"revision": 0, "state": None, "members": {}, "roster": {}, "hardware_transcripts": [], "updated_at": 0})
                room.setdefault("members", {})[member_id] = {"name": member_name, "seen": time.time()}
                roster = room.setdefault("roster", {})
                existing_roster_member = roster.get(member_id)
                roster_changed = not existing_roster_member or existing_roster_member.get("name") != member_name
                if roster_changed:
                    roster[member_id] = {
                        "name": member_name,
                        "joined_at": existing_roster_member.get("joined_at", time.time()) if existing_roster_member else time.time(),
                    }
                if self.path == "/api/room/state":
                    state = data.get("state")
                    if not isinstance(state, dict):
                        return self.send_json(400, {"error": "无效的画布状态"})
                    objects = state.get("objects", [])
                    if not isinstance(objects, list) or len(objects) > 400:
                        return self.send_json(400, {"error": "画布对象过多"})
                    encoded = json.dumps(state, ensure_ascii=False)
                    if len(encoded.encode("utf-8")) > 220_000:
                        return self.send_json(413, {"error": "画布数据过大"})
                    if "<script" in encoded.lower() or "javascript:" in encoded.lower() or re.search(r"\son[a-z]+\s*=", encoded, re.I):
                        return self.send_json(400, {"error": "画布包含不安全内容"})
                    room["state"] = state
                    room["revision"] = int(room.get("revision", 0)) + 1
                    room["updated_at"] = time.time()
                    save_rooms()
                elif roster_changed:
                    save_rooms()
                return self.send_json(200, room_payload(room_id))

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
