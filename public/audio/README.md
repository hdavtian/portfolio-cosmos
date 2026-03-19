# Cosmic Audio Files

Place your cosmic background music MP3 files in this directory:
- `public\audio`

Update `CosmicNavigation.ts audioTracks : Record`

## Recommended Audio Specifications

- Format: MP3
- Duration: 2-5 minutes (will loop automatically)
- Volume: Normalized to prevent clipping
- Bitrate: 128-192 kbps for web optimization

## Audio Sources

You can find suitable cosmic/ambient music from:

- Freesound.org (Creative Commons licensed)
- YouTube Audio Library
- Uppbeat.io
- Adobe Stock Audio

## Usage

The audio system will automatically:

- Loop tracks seamlessly
- Respect user volume preferences (default 30%)
- Handle play/pause based on user interaction requirements
- Gracefully fall back to silence if files are missing
