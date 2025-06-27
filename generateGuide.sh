#!/bin/bash

# Create output directory if it doesn't exist
mkdir -p html

# Ensure jq is installed
if ! command -v jq &> /dev/null; then
  echo "❌ Error: jq is required but not installed. Please install it and try again."
  exit 1
fi

# Read site names and URLs from config.json
mapfile -t siteNames < <(jq -r '.sites[] | to_entries[] | .key' config.json)
mapfile -t urls < <(jq -r '.sites[] | to_entries[] | .value.url' config.json)


# Check if lengths match
if [ "${#urls[@]}" -ne "${#siteNames[@]}" ]; then
  echo "Error: The number of URLs and site names must match."
  echo "URLs: ${#urls[@]} | Site Names: ${#siteNames[@]}"
  exit 1
fi

# Loop through and capture each site
for i in "${!urls[@]}"; do
  url="${urls[$i]}"
  name="${siteNames[$i]}"
  outputFile="html/$name.html"

  # Check if file exists and is less than 24 hours old
  if [ -f "$outputFile" ] && [ "$(find "$outputFile" -mmin -1440)" ]; then
    echo "Skipping $name (cached file is less than 24 hours old)"
    continue
  fi

  echo "Capturing $url into $outputFile..."
  node capture-html.js "$url" > "$outputFile"
done

echo "Done."
