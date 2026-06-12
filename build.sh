#!/bin/bash
# SkillHub 生产打包脚本
# 用法: bash build.sh
# 输出: skillhub-v1.0.1.zip (可直接上传到 Chrome Web Store)

set -e

VERSION=$(grep '"version"' skillhub/manifest.json | head -1 | sed 's/.*"\(.*\)".*/\1/')
OUTPUT="skillhub-v${VERSION}.zip"
SRC_DIR="skillhub"

echo "📦 打包 SkillHub v${VERSION}..."

# 清理旧包
rm -f "$OUTPUT"

# 打包（排除开发文件）
cd "$SRC_DIR"
zip -r "../$OUTPUT" . \
  -x "*.md" \
  -x "*.py" \
  -x "prd.md" \
  -x "store-assets.md" \
  -x "docs/*" \
  -x ".DS_Store" \
  -x "*.pem"

cd ..

echo ""
echo "✅ 打包完成: $OUTPUT"
echo "📏 大小: $(du -h "$OUTPUT" | cut -f1)"
echo ""
echo "下一步: 上传到 https://chrome.google.com/webstore/devconsole"