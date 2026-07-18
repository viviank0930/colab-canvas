#!/bin/zsh
set -e
cd "$(dirname "$0")"

if [[ -f ".colab.pid" ]] && kill -0 "$(cat .colab.pid)" 2>/dev/null; then
  open "http://127.0.0.1:4173/"
  exit 0
fi

key="$(security find-generic-password -a "$USER" -s "CoLab DeepSeek API Key" -w 2>/dev/null || true)"
if [[ -z "$key" ]]; then
  echo "还没有保存 DeepSeek API Key。请先双击「首次设置.command」。"
  read "reply?按回车关闭窗口。"
  exit 1
fi

DEEPSEEK_API_KEY="$key" nohup python3 server.py > colab-server.log 2>&1 &
pid=$!
echo "$pid" > .colab.pid
unset key

for attempt in {1..30}; do
  if curl -fsS "http://127.0.0.1:4173/" >/dev/null 2>&1; then
    open "http://127.0.0.1:4173/"
    exit 0
  fi
  sleep 0.2
done

echo "CoLab 没有正常启动，请查看 colab-server.log。"
tail -n 12 colab-server.log
read "reply?按回车关闭窗口。"
exit 1
