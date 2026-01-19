#!/bin/bash
#
# 图标生成脚本
# 功能：使用 ImageMagick 自动生成不同尺寸 (16/48/128) 的插件图标。
#
# Simple script to create placeholder icons
# For production, replace with actual PNG files

echo "SplitView" | convert -background '#0071e3' -fill white -gravity center -pointsize 12 -font Arial label:@- icon16.png 2>/dev/null || echo "⚡" > icon16.txt

echo "SplitView" | convert -background '#0071e3' -fill white -gravity center -pointsize 24 -font Arial label:@- icon48.png 2>/dev/null || echo "⚡" > icon48.txt

echo "SV" | convert -background '#0071e3' -fill white -gravity center -pointsize 48 -font Arial label:@- icon128.png 2>/dev/null || echo "⚡" > icon128.txt

echo "Icons generated. If ImageMagick is not installed, the extension will use default Chrome icons."
