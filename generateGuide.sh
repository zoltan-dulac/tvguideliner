#!/bin/bash

# Create output directory if it doesn't exist
mkdir -p html

# Ensure jq is installed
if ! command -v jq &> /dev/null; then
  echo "❌ Error: jq is required but not installed. Please install it and try again."
  exit 1
fi

# Use first argument as config file, default to 'config.json'
CONFIG_FILE="${1:-config.json}"

# Check if config file exists
if [ ! -f "$CONFIG_FILE" ]; then
  echo "❌ Error: Config file '$CONFIG_FILE' not found."
  exit 1
fi

# Read site names and URLs from config file
mapfile -t siteNames < <(jq -r '.sites[] | to_entries[] | .key' "$CONFIG_FILE")
mapfile -t urls < <(jq -r '.sites[] | to_entries[] | .value.url' "$CONFIG_FILE")

# Check if lengths match
if [ "${#urls[@]}" -ne "${#siteNames[@]}" ]; then
  echo "Error: The number of URLs and site names must match."
  echo "URLs: ${#urls[@]} | Site Names: ${#siteNames[@]}"
  exit 1
fi

# Check for duplicate site names
dupes=$(printf "%s\n" "${siteNames[@]}" | sort | uniq -d)
if [ -n "$dupes" ]; then
  echo "❌ Error: Duplicate site names found in config:"
  echo "$dupes"
  exit 1
fi

# Loop through and capture each site
for i in "${!urls[@]}"; do
  url="${urls[$i]}"
  name="${siteNames[$i]}"
  outputFile="html/$name.html"

  # Check if file exists and was modified today
  if [ -f "$outputFile" ]; then
    fileDate=$(date -r "$outputFile" +%F)
    today=$(date +%F)

    if [ "$fileDate" = "$today" ]; then
      echo "Skipping $name (cached file is from today: $fileDate)"
      continue
    fi
  fi


  echo "Capturing $url into $outputFile..."
  CAPTURE=$(node capture-html.js "$url" "$CONFIG_FILE")
  if [ $? -eq 0 ]; then
    echo "$CAPTURE" > "$outputFile"
  else
    echo "❌ Failed to capture $url (attempted for $name)"
  fi
done

echo "Done."
