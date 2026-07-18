#!/bin/zsh
set -e
cd "$(dirname "$0")"

echo "CoLab 首次设置"
echo "API Key 将保存到 macOS 钥匙串，不会写入网站代码。"
echo
read -s "key?请粘贴新的 DeepSeek API Key，然后按回车："
echo

if [[ -z "$key" ]]; then
  echo "没有输入 Key，设置已取消。"
  read "reply?按回车关闭窗口。"
  exit 1
fi

security delete-generic-password -a "$USER" -s "CoLab DeepSeek API Key" >/dev/null 2>&1 || true
security add-generic-password -a "$USER" -s "CoLab DeepSeek API Key" -w "$key" -U >/dev/null
unset key

echo "设置完成。以后只需双击「启动 CoLab.command」。"
read "reply?按回车关闭窗口。"
