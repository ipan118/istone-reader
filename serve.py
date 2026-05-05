import argparse
import json
import os
import subprocess
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
POWERSHELL = os.environ.get("COMSPEC_POWERSHELL", "powershell")


def run_powershell(script: str, env_extra: dict[str, str] | None = None, timeout: int = 120) -> bytes:
    env = os.environ.copy()
    if env_extra:
        env.update({key: str(value) for key, value in env_extra.items()})

    completed = subprocess.run(
        [POWERSHELL, "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
        capture_output=True,
        timeout=timeout,
        env=env,
        check=False,
    )
    if completed.returncode != 0:
      message = completed.stderr.decode("utf-8", errors="ignore") or completed.stdout.decode("utf-8", errors="ignore")
      raise RuntimeError(message.strip() or "PowerShell execution failed")
    return completed.stdout


def list_windows_voices() -> list[dict[str, str | bool]]:
    script = r"""
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = $synth.GetInstalledVoices() | ForEach-Object {
  $info = $_.VoiceInfo
  [PSCustomObject]@{
    name = $info.Name
    lang = $info.Culture.Name
    gender = [string]$info.Gender
    age = [string]$info.Age
    description = $info.Description
    default = $false
  }
}
$voices | ConvertTo-Json -Depth 4 -Compress
"""
    raw = run_powershell(script, timeout=30).decode("utf-8", errors="ignore").strip()
    if not raw:
        return []
    data = json.loads(raw)
    if isinstance(data, dict):
        return [data]
    if isinstance(data, list):
        return data
    return []


def synthesize_windows_tts(text: str, voice: str, lang: str, rate: float, pitch: float) -> bytes:
    script = r"""
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Speech
$text = $env:APP_TTS_TEXT
$voice = $env:APP_TTS_VOICE
$lang = if ($env:APP_TTS_LANG) { $env:APP_TTS_LANG } else { 'en-US' }
$rate = [double]$env:APP_TTS_RATE
$pitch = [double]$env:APP_TTS_PITCH
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
if ($voice) {
  $synth.SelectVoice($voice)
}
$mappedRate = [Math]::Max(-5, [Math]::Min(10, [int][Math]::Round(($rate - 1.0) * 5)))
$mappedPitch = [Math]::Max(-40, [Math]::Min(65, [int][Math]::Round(($pitch - 1.0) * 42)))
$stream = New-Object System.IO.MemoryStream
$synth.SetOutputToWaveStream($stream)
$synth.Rate = $mappedRate
$escapedText = [System.Security.SecurityElement]::Escape($text)
$pitchLiteral = if ($mappedPitch -ge 0) { "+$mappedPitch%" } else { "$mappedPitch%" }
$ssml = "<speak version='1.0' xml:lang='$lang'><prosody pitch='$pitchLiteral'>$escapedText</prosody></speak>"
$synth.SpeakSsml($ssml)
$bytes = $stream.ToArray()
[Console]::OpenStandardOutput().Write($bytes, 0, $bytes.Length)
"""
    return run_powershell(
        script,
        env_extra={
            "APP_TTS_TEXT": text,
            "APP_TTS_VOICE": voice,
            "APP_TTS_LANG": lang,
            "APP_TTS_RATE": rate,
            "APP_TTS_PITCH": pitch,
        },
        timeout=120,
    )


class ReaderHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def respond_json(self, payload: dict, status: int = HTTPStatus.OK):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/windows-voices":
            try:
                voices = list_windows_voices()
                self.respond_json({"voices": voices})
            except Exception as exc:  # pragma: no cover - runtime safeguard
                self.respond_json({"voices": [], "error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        super().do_GET()

    def do_POST(self):
        if self.path != "/api/windows-tts":
            self.respond_json({"error": "Not found"}, status=HTTPStatus.NOT_FOUND)
            return

        content_length = int(self.headers.get("Content-Length", "0") or "0")
        try:
            payload = json.loads(self.rfile.read(content_length) or b"{}")
        except json.JSONDecodeError:
            self.respond_json({"error": "Invalid JSON"}, status=HTTPStatus.BAD_REQUEST)
            return

        text = str(payload.get("text", "")).strip()
        voice = str(payload.get("voice", "")).strip()
        lang = str(payload.get("lang", "")).strip() or "en-US"
        rate = float(payload.get("rate", 1.0) or 1.0)
        pitch = float(payload.get("pitch", 1.0) or 1.0)

        if not text:
            self.respond_json({"error": "Missing text"}, status=HTTPStatus.BAD_REQUEST)
            return
        if len(text) > 5000:
            self.respond_json({"error": "Text too long"}, status=HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
            return

        try:
            audio = synthesize_windows_tts(text=text, voice=voice, lang=lang, rate=rate, pitch=pitch)
        except Exception as exc:  # pragma: no cover - runtime safeguard
            self.respond_json({"error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(audio)))
        self.end_headers()
        self.wfile.write(audio)


def main() -> None:
    parser = argparse.ArgumentParser(description="Local iStone Reader server with Windows voice bridge.")
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=4173)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.bind, args.port), ReaderHandler)
    print(f"Serving iStone Reader on http://{args.bind}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
