#!/bin/bash

HTML_FILE="../index.html"
JS_DIR="js"
CSS_DIR="css"

mkdir -p "$JS_DIR" "$CSS_DIR"

# CSS-Dateien herunterladen
grep -Eo '<link[^>]+href="[^"]+"' "$HTML_FILE" \
    | grep -Eo 'https?://[^"]+' \
    | while read -r url; do
        fname=$(basename "${url%%\?*}")
        wget -q "$url" -O "$CSS_DIR/$fname"
        echo "✔️  CSS: $url → $CSS_DIR/$fname"
    done

# JS-Dateien herunterladen
grep -Eo '<script[^>]+src="[^"]+"' "$HTML_FILE" \
    | grep -Eo 'https?://[^"]+' \
    | while read -r url; do
        fname=$(basename "${url%%\?*}")
        wget -q "$url" -O "$JS_DIR/$fname"
        echo "✔️  JS: $url → $JS_DIR/$fname"
    done

echo "✅ Alle externen CSS/JS-Dateien wurden lokal gespeichert."
