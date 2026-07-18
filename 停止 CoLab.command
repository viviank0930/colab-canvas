#!/bin/zsh
cd "$(dirname "$0")"

if [[ -f ".colab.pid" ]]; then
  pid="$(cat .colab.pid)"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
  fi
  rm -f .colab.pid
fi

echo "CoLab 已停止。停止后不会产生任何模型调用费用。"
sleep 1
